// Quiz Generator - pure vanilla JS, no external API calls

class QuizGenerator {
  constructor() {
    // English pattern regexes
    this._reDefinition = /^(.{3,40}?)\s+(?:is|are|refers? to|defined as|known as|called)\s+(.{10,}?)\.?$/i;
    this._reLocation   = /(.{3,35}?)\s+(?:is|are)\s+(?:located|found|situated|positioned)\s+(?:in|at|within|between|above|below|posterior to|anterior to|medial to|lateral to)\s+(.{5,50}?)\.?$/i;
    this._reFunction   = /(.{3,35}?)\s+(?:functions? to|is responsible for|serves? to|plays? (?:a|an|the) role in|enables?|allows?|facilitates?|regulates?|produces?)\s+(.{10,}?)\.?$/i;
    this._reComponent  = /(.{3,35}?)\s+(?:consists? of|is composed of|contains?|comprises?|includes?|is made (?:up )?of)\s+(.{10,}?)\.?$/i;

    // Korean pattern regexes
    this._reKorDef  = /^(.{2,15}?)(?:은|는|이란|란)\s*(.{5,}?)(?:이다|이라고 한다|라고 한다|을 말한다|를 말한다|로 정의된다)\.?$/;
    this._reKorLoc  = /(.{2,15}?)(?:은|는)?\s*(.{3,25}?)(?:에 위치|에 존재|에 있으며|에서 발견)[\w\s]*?(?:한다|된다|있다)?\.?$/;
    this._reKorFunc = /(.{2,15}?)(?:은|는)?\s*(?:의 기능|의 역할|의 작용)(?:은|는)\s*(.{5,}?)(?:이다|한다|된다)\.?$/;

    // Korean–English term extraction regexes
    this._reKorParen = /([가-힣]{2,10})\(([A-Za-z\s]{3,30})\)/g;
    this._reEngParen = /([A-Za-z]{3,30})\(([가-힣]{2,10})\)/g;

    // Anatomy keyword list for fallback fill-blank generation
    this._anatomyKeywords = [
      'heart', 'lung', 'liver', 'brain', 'bone', 'muscle', 'nerve', 'artery',
      'vein', 'cell', 'organ', 'tissue', 'vascular', 'cardiac', 'neural',
      'pulmonary', 'hepatic', 'renal', 'cerebral',
      '심장', '폐', '간', '뇌', '뼈', '근육', '신경', '동맥', '정맥', '세포', '조직'
    ];
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------

  /**
   * Generate quiz questions from raw text.
   * @param {string} text
   * @param {object} [options]
   * @param {number}   [options.maxQuestions=10]
   * @param {string[]} [options.types=['mcq','true-false','fill-blank']]
   * @param {string}   [options.language='auto']
   * @returns {{ questions: object[], sourceText: string, stats: object }}
   */
  generate(text, options = {}) {
    const maxQuestions  = options.maxQuestions  !== undefined ? options.maxQuestions  : 10;
    const types         = options.types         !== undefined ? options.types         : ['mcq', 'true-false', 'fill-blank'];

    const cleanText = this.cleanText(text);
    const sentences = this.extractSentences(cleanText);

    // --- Pattern extraction ---
    const patterns = [];
    for (const sentence of sentences) {
      const m =
        this.matchDefinition(sentence) ||
        this.matchLocation(sentence)   ||
        this.matchFunction(sentence)   ||
        this.matchComponent(sentence)  ||
        this.matchKoreanDefinition(sentence) ||
        this.matchKoreanLocation(sentence)   ||
        this.matchKoreanFunction(sentence);
      if (m) patterns.push(m);
    }

    // --- Question generation ---
    const questions = [];

    // Cycle through question types for variety
    const typeQueue = [];
    const allTypes = ['mcq', 'true-false', 'fill-blank'];
    for (const t of allTypes) {
      if (types.indexOf(t) !== -1) typeQueue.push(t);
    }

    if (typeQueue.length === 0) {
      return { questions: [], sourceText: cleanText, stats: { totalSentences: sentences.length, patternsFound: 0, questionsByType: {} } };
    }

    let typeIdx = 0;
    for (const pattern of patterns) {
      if (questions.length >= maxQuestions) break;

      const qType = typeQueue[typeIdx % typeQueue.length];
      typeIdx++;

      let q = null;
      if (qType === 'mcq') {
        q = this.generateMCQ(pattern, patterns);
      } else if (qType === 'true-false') {
        q = this.generateTrueFalse(pattern, patterns);
      } else if (qType === 'fill-blank') {
        q = this.generateFillBlank(pattern);
      }

      if (q) questions.push(q);
    }

    // --- Fallback: if < 3 patterns, try sentence-level generation ---
    if (patterns.length < 3 && types.indexOf('fill-blank') !== -1) {
      for (const sentence of sentences) {
        if (questions.length >= maxQuestions) break;
        const q = this.generateSentenceMCQ(sentence, sentences);
        if (q) questions.push(q);
      }
    }

    // --- Stats ---
    const questionsByType = { mcq: 0, 'true-false': 0, 'fill-blank': 0 };
    for (const q of questions) {
      if (questionsByType[q.type] !== undefined) {
        questionsByType[q.type]++;
      }
    }

    return {
      questions,
      sourceText: cleanText,
      stats: {
        totalSentences: sentences.length,
        patternsFound: patterns.length,
        questionsByType
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Text processing
  // ---------------------------------------------------------------------------

  /**
   * Clean raw OCR/PDF text for processing.
   * @param {string} text
   * @returns {string}
   */
  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove form-feed and other control chars except newline/tab
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
      // Collapse horizontal whitespace within a line
      .replace(/[ \t]+/g, ' ')
      // Collapse 3+ blank lines into one blank line
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Split cleaned text into individual sentences.
   * @param {string} text
   * @returns {string[]}
   */
  extractSentences(text) {
    if (!text) return [];

    // Split on sentence-ending punctuation followed by whitespace or end-of-string,
    // keeping boundary markers so we can trim properly.
    // Also split on newlines (paragraph breaks from OCR output).
    const raw = text.split(/(?<=[.!?。])\s+|\n+/);

    const sentences = [];
    for (const s of raw) {
      const trimmed = s.trim();
      if (trimmed.length >= 15 && trimmed.length <= 500) {
        sentences.push(trimmed);
      }
    }
    return sentences;
  }

  /**
   * Extract key terms and their context sentences.
   * @param {string[]} sentences
   * @returns {Map<string, string[]>}
   */
  extractKeyTerms(sentences) {
    const termMap = new Map();

    for (const sentence of sentences) {
      // Extract Korean(English) pairs
      let m;
      const rKor = new RegExp(this._reKorParen.source, 'g');
      while ((m = rKor.exec(sentence)) !== null) {
        const term = m[1] + '(' + m[2] + ')';
        if (!termMap.has(term)) termMap.set(term, []);
        termMap.get(term).push(sentence);
      }

      // Extract English(Korean) pairs
      const rEng = new RegExp(this._reEngParen.source, 'g');
      while ((m = rEng.exec(sentence)) !== null) {
        const term = m[1] + '(' + m[2] + ')';
        if (!termMap.has(term)) termMap.set(term, []);
        termMap.get(term).push(sentence);
      }

      // Extract anatomy keywords present in sentence
      for (const kw of this._anatomyKeywords) {
        if (sentence.indexOf(kw) !== -1) {
          if (!termMap.has(kw)) termMap.set(kw, []);
          termMap.get(kw).push(sentence);
        }
      }
    }

    return termMap;
  }

  // ---------------------------------------------------------------------------
  // Pattern matching
  // ---------------------------------------------------------------------------

  /**
   * @param {string} sentence
   * @returns {{type:'definition', term:string, description:string, source:string}|null}
   */
  matchDefinition(sentence) {
    const m = this._reDefinition.exec(sentence);
    if (!m) return null;
    return {
      type: 'definition',
      term: m[1].trim(),
      description: m[2].trim(),
      source: sentence
    };
  }

  /**
   * @param {string} sentence
   * @returns {{type:'location', term:string, location:string, source:string}|null}
   */
  matchLocation(sentence) {
    const m = this._reLocation.exec(sentence);
    if (!m) return null;
    return {
      type: 'location',
      term: m[1].trim(),
      location: m[2].trim(),
      source: sentence
    };
  }

  /**
   * @param {string} sentence
   * @returns {{type:'function', term:string, functionDesc:string, source:string}|null}
   */
  matchFunction(sentence) {
    const m = this._reFunction.exec(sentence);
    if (!m) return null;
    return {
      type: 'function',
      term: m[1].trim(),
      functionDesc: m[2].trim(),
      source: sentence
    };
  }

  /**
   * @param {string} sentence
   * @returns {{type:'component', term:string, components:string, source:string}|null}
   */
  matchComponent(sentence) {
    const m = this._reComponent.exec(sentence);
    if (!m) return null;
    return {
      type: 'component',
      term: m[1].trim(),
      components: m[2].trim(),
      source: sentence
    };
  }

  /**
   * @param {string} sentence
   * @returns {{type:'definition', term:string, description:string, source:string}|null}
   */
  matchKoreanDefinition(sentence) {
    const m = this._reKorDef.exec(sentence);
    if (!m) return null;
    return {
      type: 'definition',
      term: m[1].trim(),
      description: m[2].trim(),
      source: sentence
    };
  }

  /**
   * @param {string} sentence
   * @returns {{type:'location', term:string, location:string, source:string}|null}
   */
  matchKoreanLocation(sentence) {
    const m = this._reKorLoc.exec(sentence);
    if (!m) return null;
    return {
      type: 'location',
      term: m[1].trim(),
      location: m[2].trim(),
      source: sentence
    };
  }

  /**
   * @param {string} sentence
   * @returns {{type:'function', term:string, functionDesc:string, source:string}|null}
   */
  matchKoreanFunction(sentence) {
    const m = this._reKorFunc.exec(sentence);
    if (!m) return null;
    return {
      type: 'function',
      term: m[1].trim(),
      functionDesc: m[2].trim(),
      source: sentence
    };
  }

  // ---------------------------------------------------------------------------
  // Question generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a multiple-choice question from a pattern.
   * @param {object} pattern
   * @param {object[]} allPatterns
   * @returns {object|null}
   */
  generateMCQ(pattern, allPatterns) {
    let questionText = '';
    let correctAnswer = '';
    let distractorField = '';

    if (pattern.type === 'definition') {
      questionText  = '"' + pattern.term + '"에 대한 설명으로 옳은 것은?';
      correctAnswer = this.truncate(pattern.description, 120);
      distractorField = 'description';
    } else if (pattern.type === 'location') {
      questionText  = '"' + pattern.term + '"은/는 어디에 위치하는가?';
      correctAnswer = this.truncate(pattern.location, 120);
      distractorField = 'location';
    } else if (pattern.type === 'function') {
      questionText  = '"' + pattern.term + '"의 기능으로 옳은 것은?';
      correctAnswer = this.truncate(pattern.functionDesc, 120);
      distractorField = 'functionDesc';
    } else if (pattern.type === 'component') {
      questionText  = '"' + pattern.term + '"의 구성 요소는?';
      correctAnswer = this.truncate(pattern.components, 120);
      distractorField = 'components';
    } else {
      return null;
    }

    if (!correctAnswer) return null;

    // Collect distractors from other patterns of the same type
    const distractors = [];
    for (const p of allPatterns) {
      if (p === pattern) continue;
      if (p.type !== pattern.type) continue;
      const val = p[distractorField];
      if (!val) continue;
      const truncated = this.truncate(val, 120);
      if (truncated === correctAnswer) continue;
      if (distractors.indexOf(truncated) === -1) {
        distractors.push(truncated);
      }
      if (distractors.length >= 3) break;
    }

    // Generic fallback distractors if not enough real ones
    const genericFallbacks = ['위에 열거된 것 모두', '해당 없음', '위의 어느 것도 아님', '알 수 없음'];
    let fbIdx = 0;
    while (distractors.length < 3) {
      const fb = genericFallbacks[fbIdx % genericFallbacks.length];
      fbIdx++;
      if (distractors.indexOf(fb) === -1 && fb !== correctAnswer) {
        distractors.push(fb);
      }
    }

    // Build 4 options: correct + 3 distractors, shuffled
    const pool = [correctAnswer].concat(distractors.slice(0, 3));
    this.shuffleArray(pool);

    const correctIndex = pool.indexOf(correctAnswer);
    const prefixes = ['A. ', 'B. ', 'C. ', 'D. '];
    const options = pool.map((opt, i) => prefixes[i] + opt);

    return {
      id: this.generateId(),
      type: 'mcq',
      question: questionText,
      options,
      answer: correctIndex,
      explanation: pattern.source
    };
  }

  /**
   * Generate a true/false question from a pattern.
   * @param {object} pattern
   * @param {object[]} allPatterns
   * @returns {object|null}
   */
  generateTrueFalse(pattern, allPatterns) {
    const isTrue = Math.random() < 0.5;

    let statement = '';
    let answer; // 0 = O (참), 1 = X (거짓)

    if (isTrue) {
      // Use the source sentence as a true statement
      statement = this.truncate(pattern.source, 100);
      answer = 0;
    } else {
      // Swap the key field with one from a different pattern to make it false
      let swappedValue = null;
      const field = pattern.type === 'definition' ? 'description'
                  : pattern.type === 'location'   ? 'location'
                  : pattern.type === 'function'   ? 'functionDesc'
                  : pattern.type === 'component'  ? 'components'
                  : null;

      if (field) {
        for (const p of allPatterns) {
          if (p === pattern) continue;
          if (p.type !== pattern.type) continue;
          const val = p[field];
          if (val && val !== pattern[field]) {
            swappedValue = this.truncate(val, 80);
            break;
          }
        }
      }

      if (swappedValue && field) {
        // Build a false statement by substituting the wrong value
        if (pattern.type === 'definition') {
          statement = this.truncate('"' + pattern.term + '"은/는 ' + swappedValue + '이다.', 100);
        } else if (pattern.type === 'location') {
          statement = this.truncate('"' + pattern.term + '"은/는 ' + swappedValue + '에 위치한다.', 100);
        } else if (pattern.type === 'function') {
          statement = this.truncate('"' + pattern.term + '"의 기능은 ' + swappedValue + '이다.', 100);
        } else if (pattern.type === 'component') {
          statement = this.truncate('"' + pattern.term + '"은/는 ' + swappedValue + '으로 구성된다.', 100);
        }
        answer = 1;
      } else {
        // Fallback: use the true statement
        statement = this.truncate(pattern.source, 100);
        answer = 0;
      }
    }

    if (!statement) return null;

    return {
      id: this.generateId(),
      type: 'true-false',
      question: statement,
      options: ['O (참)', 'X (거짓)'],
      answer,
      explanation: pattern.source
    };
  }

  /**
   * Generate a fill-in-the-blank question from a pattern.
   * @param {object} pattern
   * @returns {object|null}
   */
  generateFillBlank(pattern) {
    const source = pattern.source;
    const term   = pattern.term;

    if (!source || !term) return null;

    // Only proceed if the term appears verbatim in the source
    if (source.indexOf(term) === -1) return null;

    const blanked = source.replace(term, '______');

    return {
      id: this.generateId(),
      type: 'fill-blank',
      question: blanked,
      answer: term,
      explanation: source
    };
  }

  /**
   * Fallback: generate a fill-blank question from a raw sentence if it contains
   * an anatomy keyword.
   * @param {string} sentence
   * @param {string[]} allSentences  // currently unused but kept for API compatibility
   * @returns {object|null}
   */
  generateSentenceMCQ(sentence, allSentences) {
    if (!sentence || sentence.length < 30 || sentence.length > 200) return null;

    // Find first matching anatomy keyword
    let matchedKw = null;
    for (const kw of this._anatomyKeywords) {
      if (sentence.indexOf(kw) !== -1) {
        matchedKw = kw;
        break;
      }
    }

    if (!matchedKw) return null;

    const blanked = sentence.replace(matchedKw, '______');

    return {
      id: this.generateId(),
      type: 'fill-blank',
      question: blanked,
      answer: matchedKw,
      explanation: sentence
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Fisher-Yates shuffle (in-place).
   * @param {Array} arr
   * @returns {Array}
   */
  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Generate a short unique string ID.
   * @returns {string}
   */
  generateId() {
    return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Truncate a string to at most maxLen characters, appending '…' if cut.
   * @param {string} str
   * @param {number} maxLen
   * @returns {string}
   */
  truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
  }
}
