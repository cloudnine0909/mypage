// QuizRenderer – renders questions to the DOM and handles scoring
// Vanilla JS class, no ES modules – becomes global.

class QuizRenderer {
  constructor(containerEl, resultEl) {
    this.containerEl = containerEl;
    this.resultEl    = resultEl;

    // Map: questionId → { question, selectedAnswer, inputEl? }
    this.answers   = {};
    this.quizData  = null;
    this.submitted = false;

    // Input element refs for fill-blank questions (survives answer-map resets)
    this._inputRefs = {};

    // Korean ↔ English anatomical equivalents for fill-blank comparison
    this._koEn = {
      '심장': 'heart',    '폐': 'lung',        '뇌': 'brain',
      '간': 'liver',      '신장': 'kidney',    '위': 'stomach',
      '대장': 'large intestine', '소장': 'small intestine',
      '척추': 'spine',    '근육': 'muscle',    '뼈': 'bone',
      '혈관': 'blood vessel', '동맥': 'artery', '정맥': 'vein',
      '모세혈관': 'capillary', '신경': 'nerve', '피부': 'skin',
      '눈': 'eye',        '귀': 'ear',         '코': 'nose',
      '입': 'mouth',      '혀': 'tongue',      '이': 'tooth',
      '목': 'neck',       '어깨': 'shoulder',  '팔': 'arm',
      '다리': 'leg',      '손': 'hand',        '발': 'foot',
      '가슴': 'chest',    '배': 'abdomen',     '등': 'back',
      '머리': 'head',     '얼굴': 'face',
    };

    // Build reverse map (English → Korean)
    this._enKo = {};
    for (const [ko, en] of Object.entries(this._koEn)) {
      this._enKo[en.toLowerCase()] = ko;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Render all questions from quizData into containerEl.
   * @param {{ questions: object[] }|object[]} quizData
   */
  renderQuiz(quizData) {
    this.quizData   = quizData;
    this.answers    = {};
    this._inputRefs = {};
    this.submitted  = false;

    this.containerEl.innerHTML = '';
    if (this.resultEl) this.resultEl.hidden = true;

    const questions = this._getQuestions();
    questions.forEach((q, i) => {
      this.containerEl.appendChild(this.renderQuestion(q, i));
    });

    this._updateProgress();
  }

  /**
   * Create and return a question card element.
   * @param {object} question
   * @param {number} index   zero-based
   * @returns {HTMLElement}
   */
  renderQuestion(question, index) {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `q-${question.id}`;

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'question-header';

    const numSpan = document.createElement('span');
    numSpan.className = 'question-number';
    numSpan.textContent = `문제 ${index + 1}`;

    const badge = document.createElement('span');
    badge.className = 'question-type-badge';
    badge.textContent = this._typeBadgeLabel(question.type);

    header.appendChild(numSpan);
    header.appendChild(badge);
    card.appendChild(header);

    // ── Question text ──
    const pText = document.createElement('p');
    pText.className = 'question-text';
    pText.textContent = question.question;
    card.appendChild(pText);

    // ── Answer widget ──
    const type = this._normalizeType(question.type);
    let widget;
    if (type === 'mcq')            widget = this.renderMCQ(question, index);
    else if (type === 'truefalse') widget = this.renderTrueFalse(question, index);
    else if (type === 'fillblank') widget = this.renderFillBlank(question, index);
    if (widget) card.appendChild(widget);

    // ── Explanation (hidden until submit) ──
    const expl = document.createElement('div');
    expl.className = 'explanation';
    expl.hidden = true;
    const strong = document.createElement('strong');
    strong.textContent = '해설: ';
    expl.appendChild(strong);
    expl.appendChild(document.createTextNode(question.explanation || ''));
    card.appendChild(expl);

    return card;
  }

  /**
   * Render the multiple-choice options grid.
   * @param {object} question
   * @param {number} index
   * @returns {HTMLElement}
   */
  renderMCQ(question, index) {
    const grid = document.createElement('div');
    grid.className = 'options-grid';

    const options = question.options || [];
    options.forEach((optText, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.dataset.index = String(i);
      // Options from QuizGenerator already contain letter prefixes ("A. …");
      // display as-is to avoid double-prefixing.
      btn.textContent = optText;
      btn.addEventListener('click', () => {
        if (!this.submitted) this.handleAnswer(question.id, i);
      });
      grid.appendChild(btn);
    });

    return grid;
  }

  /**
   * Render the O / X true-false button pair.
   * @param {object} question
   * @param {number} index
   * @returns {HTMLElement}
   */
  renderTrueFalse(question, index) {
    const container = document.createElement('div');
    container.className = 'tf-buttons';

    ['O (참)', 'X (거짓)'].forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'tf-btn';
      btn.dataset.index = String(i);
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (!this.submitted) this.handleAnswer(question.id, i);
      });
      container.appendChild(btn);
    });

    return container;
  }

  /**
   * Render the fill-in-the-blank text input.
   * @param {object} question
   * @param {number} index
   * @returns {HTMLElement}
   */
  renderFillBlank(question, index) {
    const input = document.createElement('input');
    input.className = 'blank-input';
    input.type = 'text';
    input.placeholder = '답을 입력하세요';

    // Store a ref so revealAllAnswers can reach it even if question is unanswered
    this._inputRefs[question.id] = input;

    input.addEventListener('input', () => {
      if (this.submitted) return;
      const val = input.value.trim();
      const wasAnswered = !!(this.answers[question.id]);
      if (val) {
        this.answers[question.id] = { question, selectedAnswer: val, inputEl: input };
      } else {
        delete this.answers[question.id];
      }
      const isAnswered = !!(this.answers[question.id]);
      if (wasAnswered !== isAnswered) this._updateProgress();
    });

    return input;
  }

  /**
   * Record an answer and highlight the selected button.
   * @param {string|number} questionId
   * @param {number} selectedAnswer  index into options / tf buttons
   */
  handleAnswer(questionId, selectedAnswer) {
    const question = this._findQuestion(questionId);
    if (!question) return;

    const card = document.getElementById(`q-${questionId}`);
    if (card) {
      const selector = this._normalizeType(question.type) === 'mcq'
        ? '.option-btn' : '.tf-btn';
      card.querySelectorAll(selector).forEach(btn => btn.classList.remove('selected'));
      const buttons = card.querySelectorAll(selector);
      if (buttons[selectedAnswer]) buttons[selectedAnswer].classList.add('selected');
    }

    const wasAnswered = !!(this.answers[questionId]);
    this.answers[questionId] = {
      question,
      selectedAnswer,
      inputEl: this.answers[questionId] ? this.answers[questionId].inputEl : null,
    };
    if (!wasAnswered) this._updateProgress();
  }

  /**
   * Score the quiz and display results. Locks all inputs.
   */
  submitQuiz() {
    if (this.submitted) return;
    this.submitted = true;

    this.revealAllAnswers();
    const score = this.calculateScore();
    this.showResults(score);
  }

  /**
   * Calculate the score.
   * @returns {{ correct: number, total: number, percentage: number, byType: object }}
   */
  calculateScore() {
    const questions = this._getQuestions();
    const byType = {};
    let correct = 0;

    for (const q of questions) {
      const key = this._normalizeType(q.type);
      if (!byType[key]) byType[key] = { correct: 0, total: 0 };
      byType[key].total++;

      const entry = this.answers[q.id];
      if (entry && this._isCorrect(q, entry.selectedAnswer)) {
        correct++;
        byType[key].correct++;
      }
    }

    const total = questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { correct, total, percentage, byType };
  }

  /**
   * Render the results panel inside resultEl.
   * @param {{ correct: number, total: number, percentage: number, byType: object }} score
   */
  showResults(score) {
    if (!this.resultEl) return;

    const scoreDisplay = this.resultEl.querySelector('#score-display');
    if (!scoreDisplay) return;

    // Colour the score circle based on percentage
    let colorClass = 'score-low';
    if (score.percentage >= 80) colorClass = 'score-high';
    else if (score.percentage >= 60) colorClass = 'score-mid';

    const typeLabels = {
      mcq:       '객관식',
      truefalse: '참/거짓',
      fillblank: '빈칸 채우기',
    };

    let breakdownHTML = '';
    for (const [key, data] of Object.entries(score.byType)) {
      const label = typeLabels[key] || key;
      breakdownHTML += `
        <div class="score-breakdown-item">
          <span class="breakdown-label">${label}</span>
          <span class="breakdown-value">${data.correct}/${data.total} 정답</span>
        </div>`;
    }

    // Collect wrong questions for the "틀린 문제 보기" section
    const questions = this._getQuestions();
    const wrong = questions.filter(q => {
      const entry = this.answers[q.id];
      return !entry || !this._isCorrect(q, entry.selectedAnswer);
    });

    let wrongHTML = '';
    if (wrong.length > 0) {
      wrongHTML = wrong.map((q, i) => {
        const userEntry    = this.answers[q.id];
        const userLabel    = userEntry ? this._answerLabel(q, userEntry.selectedAnswer) : '미응답';
        const correctLabel = this._correctAnswerLabel(q);
        return `
          <div class="wrong-question-item">
            <p class="wrong-q-text"><strong>${i + 1}.</strong> ${q.question}</p>
            <p class="wrong-q-user">내 답: <span class="wrong-answer">${userLabel}</span></p>
            <p class="wrong-q-correct">정답: <span class="correct-answer">${correctLabel}</span></p>
            ${q.explanation ? `<p class="wrong-q-explanation">해설: ${q.explanation}</p>` : ''}
          </div>`;
      }).join('');
    }

    scoreDisplay.innerHTML = `
      <div class="score-circle ${colorClass}">
        <span class="score-percent">${score.percentage}%</span>
        <span class="score-fraction">${score.correct} / ${score.total}</span>
      </div>
      <div class="score-breakdown">
        ${breakdownHTML}
      </div>
      ${wrong.length > 0
        ? `<div class="wrong-section">
             <button class="btn btn--outline wrong-toggle-btn" aria-expanded="false">
               틀린 문제 보기 (${wrong.length}개)
             </button>
             <div class="wrong-list" hidden>${wrongHTML}</div>
           </div>`
        : '<p class="all-correct">모든 문제를 맞혔습니다! 🎉</p>'
      }
    `;

    // Wire up the toggle button
    const toggleBtn = scoreDisplay.querySelector('.wrong-toggle-btn');
    if (toggleBtn) {
      const wrongList = scoreDisplay.querySelector('.wrong-list');
      toggleBtn.addEventListener('click', () => {
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', String(!expanded));
        wrongList.hidden = expanded;
        toggleBtn.textContent = expanded
          ? `틀린 문제 보기 (${wrong.length}개)`
          : '틀린 문제 숨기기';
      });
    }

    this.resultEl.hidden = false;
  }

  /**
   * Reveal correct / wrong state on every question card.
   * Called automatically by submitQuiz().
   */
  revealAllAnswers() {
    const questions = this._getQuestions();

    for (const q of questions) {
      const card = document.getElementById(`q-${q.id}`);
      if (!card) continue;

      // Show explanation
      const expl = card.querySelector('.explanation');
      if (expl) expl.hidden = false;

      const entry   = this.answers[q.id];
      const typeKey = this._normalizeType(q.type);

      if (typeKey === 'mcq') {
        const buttons    = card.querySelectorAll('.option-btn');
        const correctIdx = q.answer; // numeric index
        buttons.forEach((btn, i) => {
          btn.disabled = true;
          if (i === correctIdx) {
            btn.classList.add(entry && entry.selectedAnswer === i ? 'correct' : 'show-correct');
          } else if (entry && entry.selectedAnswer === i) {
            btn.classList.add('wrong');
          }
        });

      } else if (typeKey === 'truefalse') {
        const buttons    = card.querySelectorAll('.tf-btn');
        const correctIdx = this._tfCorrectIndex(q);
        buttons.forEach((btn, i) => {
          btn.disabled = true;
          if (i === correctIdx) {
            btn.classList.add(entry && entry.selectedAnswer === i ? 'correct' : 'show-correct');
          } else if (entry && entry.selectedAnswer === i) {
            btn.classList.add('wrong');
          }
        });

      } else if (typeKey === 'fillblank') {
        const inputEl = (entry && entry.inputEl) || this._inputRefs[q.id];
        if (inputEl) {
          inputEl.disabled = true;
          const right = entry && this._isCorrect(q, entry.selectedAnswer);
          inputEl.classList.add(right ? 'correct' : 'wrong');

          if (!right) {
            const hint = document.createElement('p');
            hint.className = 'fill-blank-answer show-correct';
            hint.textContent = `정답: ${this._correctAnswerLabel(q)}`;
            inputEl.insertAdjacentElement('afterend', hint);
          }
        }
      }
    }
  }

  /**
   * Clear all answers and wipe the container.
   * Caller should call renderQuiz() again to re-render.
   */
  resetQuiz() {
    this.answers    = {};
    this._inputRefs = {};
    this.submitted  = false;

    if (this.resultEl) this.resultEl.hidden = true;
    this.containerEl.innerHTML = '';
    this._updateProgress();
  }

  /**
   * Return the number of questions that have been answered.
   * @returns {number}
   */
  getAnsweredCount() {
    return Object.values(this.answers).filter(
      e => e && e.selectedAnswer !== undefined && e.selectedAnswer !== null
    ).length;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  _getQuestions() {
    if (!this.quizData) return [];
    return Array.isArray(this.quizData) ? this.quizData : (this.quizData.questions || []);
  }

  _findQuestion(id) {
    return this._getQuestions().find(q => q.id === id) || null;
  }

  _normalizeType(type) {
    if (!type) return 'mcq';
    const t = String(type).toLowerCase().replace(/[-_\s]/g, '');
    if (t === 'mcq' || t === 'multiple' || t === 'multiplechoice') return 'mcq';
    if (t === 'truefalse' || t === 'tf')                            return 'truefalse';
    if (t === 'fillblank' || t === 'blank' || t === 'fill')        return 'fillblank';
    return t;
  }

  _typeBadgeLabel(type) {
    switch (this._normalizeType(type)) {
      case 'mcq':       return 'MCQ';
      case 'truefalse': return '참거짓';
      case 'fillblank': return '빈칸';
      default:          return String(type);
    }
  }

  _tfCorrectIndex(question) {
    const a = question.answer;
    // QuizGenerator stores 0 = O/참, 1 = X/거짓
    if (a === 0 || a === true  || a === 'true'  || a === 'O') return 0;
    if (a === 1 || a === false || a === 'false' || a === 'X') return 1;
    if (typeof a === 'number') return a;
    return 0;
  }

  _isCorrect(question, selectedAnswer) {
    if (selectedAnswer === undefined || selectedAnswer === null) return false;
    const type = this._normalizeType(question.type);

    if (type === 'mcq') {
      return selectedAnswer === question.answer;
    }

    if (type === 'truefalse') {
      return selectedAnswer === this._tfCorrectIndex(question);
    }

    if (type === 'fillblank') {
      const user    = String(selectedAnswer).trim().toLowerCase();
      const correct = String(question.answer).trim().toLowerCase();
      if (user === correct) return true;

      // Korean ↔ English equivalents
      if (this._koEn[user] === correct) return true;
      if (this._enKo[user] === question.answer) return true;

      // acceptedAnswers list
      if (Array.isArray(question.acceptedAnswers)) {
        return question.acceptedAnswers.some(a => String(a).trim().toLowerCase() === user);
      }
      return false;
    }

    return false;
  }

  _correctAnswerLabel(question) {
    const type    = this._normalizeType(question.type);
    const options = question.options || [];

    if (type === 'mcq') {
      const idx = question.answer;
      // Options already contain letter prefixes from QuizGenerator
      return (idx >= 0 && idx < options.length) ? options[idx] : String(question.answer);
    }

    if (type === 'truefalse') {
      return this._tfCorrectIndex(question) === 0 ? 'O (참)' : 'X (거짓)';
    }

    return String(question.answer);
  }

  _answerLabel(question, selectedAnswer) {
    if (selectedAnswer === undefined || selectedAnswer === null) return '미응답';
    const type    = this._normalizeType(question.type);
    const options = question.options || [];

    if (type === 'mcq') {
      return (selectedAnswer >= 0 && selectedAnswer < options.length)
        ? options[selectedAnswer]
        : String(selectedAnswer);
    }

    if (type === 'truefalse') {
      return selectedAnswer === 0 ? 'O (참)' : 'X (거짓)';
    }

    return String(selectedAnswer);
  }

  _updateProgress() {
    const el = document.getElementById('quiz-progress');
    if (!el) return;
    const total    = this._getQuestions().length;
    const answered = this.getAnsweredCount();
    el.textContent = `${answered} / ${total}`;
  }
}
