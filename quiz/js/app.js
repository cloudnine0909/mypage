// App – orchestrates the anatomy quiz app
// Vanilla JS class, no ES modules – becomes global.
// Instantiated immediately at the bottom of this file.

class App {
  constructor() {
    this.pdfProcessor   = new PDFProcessor();
    this.imageProcessor = new ImageProcessor();
    this.quizGenerator  = new QuizGenerator();
    this.quizRenderer   = null; // created after quiz is generated

    this.currentFile   = null;
    this.extractedText = '';
    this.currentQuiz   = null;

    this.initDOM();
    this.bindEvents();
  }

  // ─── DOM initialisation ─────────────────────────────────────────────────────

  /**
   * Cache references to all elements used throughout the app.
   */
  initDOM() {
    // Sections
    this.uploadSection      = document.getElementById('upload-section');
    this.processingSection  = document.getElementById('processing-section');
    this.textPreviewSection = document.getElementById('text-preview-section');
    this.quizSection        = document.getElementById('quiz-section');

    // Upload / options
    this.dropZone      = document.getElementById('drop-zone');
    this.fileInput     = document.getElementById('file-input');
    this.generateBtn   = document.getElementById('generate-btn');
    this.langSelect    = document.getElementById('lang-select');
    this.questionCount = document.getElementById('question-count');
    this.countDisplay  = document.getElementById('count-display');
    this.typeMCQ       = document.getElementById('type-mcq');
    this.typeTF        = document.getElementById('type-tf');
    this.typeBlank     = document.getElementById('type-blank');

    // Processing
    this.statusText   = document.getElementById('status-text');
    this.progressFill = document.getElementById('progress-fill');

    // Text preview
    this.textPreview   = document.getElementById('text-preview');
    this.regenerateBtn = document.getElementById('regenerate-btn');

    // Quiz
    this.quizContainer  = document.getElementById('quiz-container');
    this.quizResultEl   = document.getElementById('quiz-result');
    this.quizProgress   = document.getElementById('quiz-progress');
    this.submitQuizBtn  = document.getElementById('submit-quiz-btn');
    this.printBtn       = document.getElementById('print-btn');
    this.retryBtn       = document.getElementById('retry-btn');
    this.newQuizBtn     = document.getElementById('new-quiz-btn');

    // ── Mode tabs ──
    this.tabText        = document.getElementById('tab-text');
    this.tabImage       = document.getElementById('tab-image');

    // ── Image quiz section ──
    this.imageQuizSection  = document.getElementById('image-quiz-section');
    this.iqDropZone        = document.getElementById('iq-drop-zone');
    this.iqFileInput       = document.getElementById('iq-file-input');
    this.iqLangSelect      = document.getElementById('iq-lang-select');
    this.iqStartBtn        = document.getElementById('iq-start-btn');
    this.iqProcessing      = document.getElementById('iq-processing');
    this.iqStatus          = document.getElementById('iq-status');
    this.iqProgressFill    = document.getElementById('iq-progress-fill');
    this.iqQuizDisplay     = document.getElementById('iq-quiz-display');
    this.iqImageWrapper    = document.getElementById('iq-image-wrapper');
    this.iqQProgress       = document.getElementById('iq-q-progress');
    this.iqScoreCorrect    = document.getElementById('iq-score-correct');
    this.iqScoreWrong      = document.getElementById('iq-score-wrong');
    this.iqBeforeReveal    = document.getElementById('iq-before-reveal');
    this.iqAfterReveal     = document.getElementById('iq-after-reveal');
    this.iqRevealedText    = document.getElementById('iq-revealed-text');
    this.iqRevealBtn       = document.getElementById('iq-reveal-btn');
    this.iqCorrectBtn      = document.getElementById('iq-correct-btn');
    this.iqWrongBtn        = document.getElementById('iq-wrong-btn');
    this.iqPrevBtn         = document.getElementById('iq-prev-btn');
    this.iqNextBtn         = document.getElementById('iq-next-btn');
    this.iqResetBtn        = document.getElementById('iq-reset-btn');
    this.iqNewImageBtn     = document.getElementById('iq-new-image-btn');

    // Reference image for text quiz
    this.quizImageRef      = document.getElementById('quiz-image-ref');
    this.quizRefImg        = document.getElementById('quiz-ref-img');
    this.toggleImageRefBtn = document.getElementById('toggle-image-ref-btn');
    this._refImgUrl        = null; // object URL to revoke on reset

    // Image quiz engine instance (created on first use)
    this.imageQuiz = null;
    this._iqFile   = null;
    this._mode     = 'text'; // 'text' | 'image'
  }

  // ─── Event binding ──────────────────────────────────────────────────────────

  bindEvents() {
    // ── Text quiz drop zone ──
    this._bindDropZone(this.dropZone, this.fileInput, (f) => this.setFile(f));
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      if (file) this.setFile(file);
      this.fileInput.value = '';
    });

    // ── Options ──
    this.questionCount.addEventListener('input', () => {
      if (this.countDisplay) this.countDisplay.textContent = this.questionCount.value;
    });

    // ── Generate ──
    this.generateBtn.addEventListener('click', () => this.startProcessing());

    // ── Regenerate (re-run quiz generation with same text) ──
    this.regenerateBtn.addEventListener('click', () => this.generateQuiz());

    // ── Submit quiz ──
    this.submitQuizBtn.addEventListener('click', () => {
      if (this.quizRenderer) this.quizRenderer.submitQuiz();
    });

    // ── Print ──
    this.printBtn.addEventListener('click', () => window.print());

    // ── Retry: clear answers and re-render the same quiz ──
    this.retryBtn.addEventListener('click', () => {
      if (this.quizRenderer && this.currentQuiz) {
        this.quizRenderer.resetQuiz();
        this.quizRenderer.renderQuiz(this.currentQuiz);
        this.quizSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // ── New quiz: back to upload ──
    this.newQuizBtn.addEventListener('click', () => this.resetAll());
    document.addEventListener('newQuiz', () => this.resetAll());

    // ── Mode tabs ──
    this.tabText.addEventListener('click',  () => this._setMode('text'));
    this.tabImage.addEventListener('click', () => this._setMode('image'));

    // ── Image quiz: upload zone ──
    this._bindDropZone(this.iqDropZone, this.iqFileInput, (f) => this._iqSetFile(f));
    this.iqFileInput.addEventListener('change', () => {
      const f = this.iqFileInput.files && this.iqFileInput.files[0];
      if (f) this._iqSetFile(f);
      this.iqFileInput.value = '';
    });

    this.iqStartBtn.addEventListener('click',    () => this._iqStartProcessing());
    this.iqRevealBtn.addEventListener('click',   () => this._iqRevealCurrent());
    this.iqCorrectBtn.addEventListener('click',  () => this._iqMarkAnswer(true));
    this.iqWrongBtn.addEventListener('click',    () => this._iqMarkAnswer(false));
    this.iqPrevBtn.addEventListener('click',     () => { this.imageQuiz.goPrev();  this._iqSyncUI(); });
    this.iqNextBtn.addEventListener('click',     () => { this.imageQuiz.goNext();  this._iqSyncUI(); });
    this.iqResetBtn.addEventListener('click',    () => { this.imageQuiz.reset();   this._iqSyncUI(); });
    this.iqNewImageBtn.addEventListener('click', () => this._iqNewImage());

    // ── Reference image toggle ──
    if (this.toggleImageRefBtn) {
      this.toggleImageRefBtn.addEventListener('click', () => {
        const body = document.getElementById('quiz-image-ref-body');
        const hidden = body.hidden;
        body.hidden = !hidden;
        this.toggleImageRefBtn.textContent = hidden ? '숨기기' : '보이기';
      });
    }

    // ── Clipboard paste (Ctrl+V anywhere on the page) ──
    document.addEventListener('paste', (e) => this._handlePaste(e));
  }

  /** Handle image paste from clipboard. */
  _handlePaste(e) {
    if (!e.clipboardData) return;
    const items = Array.from(e.clipboardData.items);
    const imgItem = items.find(item => item.type.startsWith('image/'));
    if (!imgItem) return;

    e.preventDefault();
    const blob = imgItem.getAsFile();
    if (!blob) return;

    // Give the pasted image a filename
    const ext  = imgItem.type.split('/')[1] || 'png';
    const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imgItem.type });

    if (this._mode === 'image') {
      this._iqSetFile(file);
      // Scroll to drop zone so user sees the file was accepted
      this.iqDropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      this.setFile(file);
    }
  }

  /** Helper: bind click + drag-and-drop to a drop zone element. */
  _bindDropZone(zone, input, onFile) {
    zone.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    zone.addEventListener('dragenter', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) onFile(f);
    });
  }

  // ─── File handling ──────────────────────────────────────────────────────────

  /**
   * Validate and store the chosen file, then enable the generate button.
   * @param {File} file
   */
  setFile(file) {
    this.hideError();

    const isPDF   = file.type === 'application/pdf' ||
                    file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (!isPDF && !isImage) {
      this.showError(
        '지원하지 않는 파일 형식입니다. PDF 또는 이미지 파일(JPG, PNG, WEBP, GIF)을 선택해주세요.'
      );
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      this.showError('파일 크기가 너무 큽니다. 50MB 이하의 파일만 지원합니다.');
      return;
    }

    this.currentFile = file;

    // Update drop zone label to show the selected file name
    const titleEl = this.dropZone.querySelector('.drop-zone-title');
    if (titleEl) titleEl.textContent = `선택된 파일: ${file.name}`;
    this.dropZone.classList.add('file-selected');

    this.generateBtn.disabled = false;
  }

  // ─── Processing pipeline ─────────────────────────────────────────────────────

  /**
   * Start file extraction, then quiz generation.
   */
  async startProcessing() {
    if (!this.currentFile) return;
    this.hideError();

    this._showSection(this.processingSection);
    this.setProgress(0, '파일 처리 중...');

    const isPDF = this.currentFile.type === 'application/pdf' ||
                  this.currentFile.name.toLowerCase().endsWith('.pdf');
    const lang  = this.langSelect ? this.langSelect.value : 'kor+eng';

    try {
      let text = '';

      if (isPDF) {
        // ── PDF extraction: 0 – 80 % ──
        this.pdfProcessor.onProgress = (pageNum, totalPages) => {
          const pct = Math.round((pageNum / totalPages) * 80);
          this.setProgress(pct, `페이지 ${pageNum}/${totalPages} 처리 중...`);
        };
        this.setProgress(5, 'PDF 파일 분석 중...');
        text = await this.pdfProcessor.extractText(this.currentFile);

      } else {
        // ── Image OCR: 0 – 90 % ──
        this.imageProcessor.onProgress = (percent) => {
          const scaled = Math.round(percent * 0.9); // 0-100 → 0-90
          this.setProgress(scaled, `이미지 인식 중... ${percent}%`);
        };
        this.setProgress(5, '이미지 텍스트 인식 중...');
        text = await this.imageProcessor.extractText(this.currentFile, lang);
      }

      this.extractedText = text;
      await this.generateQuiz();

    } catch (err) {
      console.error('[App] extraction error:', err);
      this.showError(err.message || '처리 중 오류가 발생했습니다.');
      this._showSection(this.uploadSection);
    }
  }

  /**
   * Run the quiz generator with the already-extracted text and current options.
   * Can be called again to regenerate with a different shuffle.
   */
  async generateQuiz() {
    this._showSection(this.processingSection);
    this.setProgress(80, '퀴즈 생성 중...');

    // Gather question-type options
    const types = [];
    if (this.typeMCQ   && this.typeMCQ.checked)   types.push('mcq');
    if (this.typeTF    && this.typeTF.checked)     types.push('true-false');
    if (this.typeBlank && this.typeBlank.checked)  types.push('fill-blank');

    // Fall back to all types if none checked
    const selectedTypes = types.length > 0 ? types : ['mcq', 'true-false', 'fill-blank'];

    const options = {
      maxQuestions: parseInt(this.questionCount ? this.questionCount.value : '10', 10) || 10,
      types: selectedTypes,
    };

    try {
      // Small yield so the browser can repaint the progress bar
      await new Promise(r => setTimeout(r, 30));

      const quizData = this.quizGenerator.generate(this.extractedText, options);

      if (!quizData.questions || quizData.questions.length === 0) {
        this.showError(
          '충분한 내용을 추출하지 못했습니다. 더 선명한 이미지나 텍스트가 많은 PDF를 사용해보세요.'
        );
        this._showSection(this.uploadSection);
        return;
      }

      this.currentQuiz = quizData;

      // ── Reference image: show original if source was an image ──
      const isPDFSource = this.currentFile &&
        (this.currentFile.type === 'application/pdf' || this.currentFile.name.toLowerCase().endsWith('.pdf'));
      if (!isPDFSource && this.currentFile && this.quizImageRef && this.quizRefImg) {
        if (this._refImgUrl) URL.revokeObjectURL(this._refImgUrl);
        this._refImgUrl = URL.createObjectURL(this.currentFile);
        this.quizRefImg.src = this._refImgUrl;
        this.quizImageRef.hidden = false;
        // Reset toggle button label
        if (this.toggleImageRefBtn) this.toggleImageRefBtn.textContent = '숨기기';
        const body = document.getElementById('quiz-image-ref-body');
        if (body) body.hidden = false;
      } else if (this.quizImageRef) {
        this.quizImageRef.hidden = true;
      }

      // ── Text preview (first 500 chars) ──
      if (this.textPreview) {
        const src = quizData.sourceText || this.extractedText;
        this.textPreview.textContent = src.length > 500
          ? src.slice(0, 500) + '...'
          : src;
      }
      if (this.textPreviewSection) this.textPreviewSection.hidden = false;

      // ── Create renderer and render quiz ──
      this.quizRenderer = new QuizRenderer(this.quizContainer, this.quizResultEl);
      this.quizRenderer.renderQuiz(quizData);

      this.setProgress(100, '완료!');

      // Brief pause so the user sees 100 % before the section switches
      await new Promise(r => setTimeout(r, 200));

      this._showSection(this.quizSection);
      this.quizSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('[App] quiz generation error:', err);
      this.showError(err.message || '퀴즈 생성 중 오류가 발생했습니다.');
      this._showSection(this.uploadSection);
    }
  }

  // ─── Progress ───────────────────────────────────────────────────────────────

  /**
   * Update the progress bar width and status text.
   * @param {number} percent  0–100
   * @param {string} message
   */
  setProgress(percent, message) {
    if (this.progressFill) {
      this.progressFill.style.width = Math.min(100, Math.max(0, percent)) + '%';
    }
    if (this.statusText) {
      this.statusText.textContent = message || '';
    }
  }

  // ─── Error handling ─────────────────────────────────────────────────────────

  /**
   * Display an error message below the drop zone.
   * @param {string} message
   */
  showError(message) {
    this.hideError();
    const div = document.createElement('div');
    div.id = 'app-error';
    div.className = 'error-message';
    div.textContent = message;
    if (this.dropZone && this.dropZone.parentNode) {
      this.dropZone.insertAdjacentElement('afterend', div);
    } else if (this.uploadSection) {
      this.uploadSection.appendChild(div);
    }
  }

  /** Remove the error message if present. */
  hideError() {
    const el = document.getElementById('app-error');
    if (el) el.remove();
  }

  // ─── Mode switching ─────────────────────────────────────────────────────────

  _setMode(mode) {
    this._mode = mode;
    const isText = mode === 'text';

    this.tabText.classList.toggle('mode-tab--active',  isText);
    this.tabImage.classList.toggle('mode-tab--active', !isText);

    if (isText) {
      if (this.imageQuizSection) this.imageQuizSection.hidden = true;
      // Restore text quiz sections to their last state
      this._showSection(this.uploadSection);
      if (this.textPreviewSection && this.currentQuiz) this.textPreviewSection.hidden = false;
      if (this.currentQuiz) this._showSection(this.quizSection);
    } else {
      // Hide all text-quiz sections
      [this.uploadSection, this.processingSection, this.textPreviewSection, this.quizSection]
        .forEach(s => { if (s) s.hidden = true; });
      if (this.imageQuizSection) this.imageQuizSection.hidden = false;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Image quiz ──────────────────────────────────────────────────────────────

  _iqSetFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 지원합니다 (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('파일 크기가 너무 큽니다 (최대 50MB).');
      return;
    }
    this._iqFile = file;
    const title = this.iqDropZone.querySelector('.drop-zone-title');
    if (title) title.textContent = `선택된 파일: ${file.name}`;
    this.iqDropZone.classList.add('file-selected');
    this.iqStartBtn.disabled = false;
  }

  async _iqStartProcessing() {
    if (!this._iqFile) return;

    this.iqProcessing.hidden  = false;
    this.iqQuizDisplay.hidden = true;

    if (!this.imageQuiz) this.imageQuiz = new ImageQuiz();
    this.imageQuiz.onProgress = (pct) => {
      this.iqProgressFill.style.width  = pct + '%';
      this.iqStatus.textContent        = `이미지 인식 중... ${pct}%`;
    };

    try {
      const lang  = this.iqLangSelect ? this.iqLangSelect.value : 'kor+eng';
      const count = await this.imageQuiz.processImage(this._iqFile, lang);

      if (count === 0) {
        this.iqProcessing.hidden = true;
        alert('텍스트 라벨을 감지하지 못했습니다.\n라벨이 선명하게 인쇄된 해부도 이미지를 사용해주세요.');
        return;
      }

      // Show quiz section FIRST so the image has real layout dimensions
      this.iqProcessing.hidden  = true;
      this.iqQuizDisplay.hidden = false;

      // Render AFTER section is visible so img.offsetWidth is correct
      this.imageQuiz.render(this.iqImageWrapper);

      // One animation frame to let the browser paint and ResizeObserver fire
      await new Promise(r => requestAnimationFrame(r));

      this._iqSyncUI();
      this.iqQuizDisplay.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('[ImageQuiz] processing error:', err);
      this.iqProcessing.hidden = true;
      alert('처리 중 오류가 발생했습니다: ' + (err.message || err));
    }
  }

  _iqRevealCurrent() {
    if (!this.imageQuiz) return;
    this.imageQuiz.revealCurrent();
    this._iqSyncUI();
  }

  _iqMarkAnswer(correct) {
    if (!this.imageQuiz) return;
    this.imageQuiz.markAnswer(this.imageQuiz.currentIndex, correct);
    this._iqSyncUI();
    // Auto-advance after a short pause
    setTimeout(() => {
      if (this.imageQuiz && this.imageQuiz.goNext()) this._iqSyncUI();
    }, 600);
  }

  _iqSyncUI() {
    const iq = this.imageQuiz;
    if (!iq) return;

    const total = iq.totalLabels;
    const idx   = iq.currentIndex;
    const label = iq.getCurrentLabel();

    this.iqQProgress.textContent    = `문제 ${idx + 1} / ${total}`;
    this.iqScoreCorrect.textContent = `✓ ${iq.score.correct}`;
    this.iqScoreWrong.textContent   = `✗ ${iq.score.wrong}`;

    if (label && label.revealed) {
      this.iqBeforeReveal.hidden  = true;
      this.iqAfterReveal.hidden   = false;
      this.iqRevealedText.textContent = label.text;
      // Disable self-score buttons if already answered
      const answered = label.answered !== null;
      this.iqCorrectBtn.disabled = answered;
      this.iqWrongBtn.disabled   = answered;
    } else {
      this.iqBeforeReveal.hidden = false;
      this.iqAfterReveal.hidden  = true;
    }

    this.iqPrevBtn.disabled = idx === 0;
    this.iqNextBtn.disabled = idx >= total - 1;
  }

  _iqNewImage() {
    if (this.imageQuiz) { this.imageQuiz.destroy(); this.imageQuiz = null; }
    this._iqFile = null;
    this.iqStartBtn.disabled  = true;
    this.iqQuizDisplay.hidden = true;
    this.iqProcessing.hidden  = true;
    this.iqImageWrapper.innerHTML = '';
    const title = this.iqDropZone.querySelector('.drop-zone-title');
    if (title) title.textContent = '해부도 이미지를 업로드하세요';
    this.iqDropZone.classList.remove('file-selected', 'drag-over');
    this.iqDropZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Navigation helpers ──────────────────────────────────────────────────────

  /**
   * Hide all major sections then show only the requested one.
   * The text-preview section is managed independently.
   * @param {HTMLElement} target
   */
  _showSection(target) {
    [this.uploadSection, this.processingSection, this.quizSection].forEach(s => {
      if (s) s.hidden = (s !== target);
    });
  }

  /**
   * Reset everything and return to the upload view.
   */
  resetAll() {
    this.currentFile   = null;
    this.extractedText = '';
    this.currentQuiz   = null;
    this.quizRenderer  = null;

    // Clean up reference image
    if (this._refImgUrl) { URL.revokeObjectURL(this._refImgUrl); this._refImgUrl = null; }
    if (this.quizRefImg)  this.quizRefImg.src = '';
    if (this.quizImageRef) this.quizImageRef.hidden = true;

    // Reset file input and drop zone label
    if (this.fileInput) this.fileInput.value = '';
    if (this.dropZone) {
      this.dropZone.classList.remove('file-selected', 'drag-over');
      const titleEl = this.dropZone.querySelector('.drop-zone-title');
      if (titleEl) titleEl.textContent = '파일을 여기에 드래그하거나 클릭하여 업로드';
    }
    if (this.generateBtn) this.generateBtn.disabled = true;

    // Clear quiz area
    if (this.quizContainer)  this.quizContainer.innerHTML = '';
    if (this.quizResultEl)   this.quizResultEl.hidden = true;

    // Hide text preview
    if (this.textPreviewSection) this.textPreviewSection.hidden = true;
    if (this.textPreview)        this.textPreview.textContent = '';

    this.hideError();
    this.setProgress(0, '처리 중...');

    this._showSection(this.uploadSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
new App();
