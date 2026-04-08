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
  }

  // ─── Event binding ──────────────────────────────────────────────────────────

  bindEvents() {
    // ── Drop zone click → open file picker ──
    this.dropZone.addEventListener('click', (e) => {
      // Avoid double-firing when the hidden input itself is inside the zone
      if (e.target !== this.fileInput) this.fileInput.click();
    });

    // Keyboard activation (accessibility)
    this.dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.fileInput.click();
      }
    });

    // ── Drag visual feedback ──
    this.dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });

    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });

    this.dropZone.addEventListener('dragleave', (e) => {
      // Only remove when the pointer truly leaves the drop zone
      if (!this.dropZone.contains(e.relatedTarget)) {
        this.dropZone.classList.remove('drag-over');
      }
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) this.setFile(file);
    });

    // ── File input change ──
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      if (file) this.setFile(file);
      // Reset value so the same file can be re-selected after a reset
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
