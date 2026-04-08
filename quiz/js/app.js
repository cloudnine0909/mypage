// App - main orchestrator for the anatomy quiz generator

class App {
  constructor() {
    this.pdfProcessor   = new PDFProcessor();
    this.imageProcessor = new ImageProcessor();
    this.quizGenerator  = new QuizGenerator();
    this.quizRenderer   = null;

    this.currentFile    = null;
    this.extractedText  = '';
    this.currentQuiz    = null;

    this.initDOM();
    this.bindEvents();
  }

  // ─── DOM References ─────────────────────────────────────────────────────────

  initDOM() {
    this.dropZone          = document.getElementById('drop-zone');
    this.fileInput         = document.getElementById('file-input');
    this.generateBtn       = document.getElementById('generate-btn');
    this.langSelect        = document.getElementById('lang-select');
    this.questionCount     = document.getElementById('question-count');
    this.countDisplay      = document.getElementById('count-display');
    this.typeMCQ           = document.getElementById('type-mcq');
    this.typeTF            = document.getElementById('type-tf');
    this.typeBlank         = document.getElementById('type-blank');

    this.uploadSection     = document.getElementById('upload-section');
    this.processingSection = document.getElementById('processing-section');
    this.statusText        = document.getElementById('status-text');
    this.progressFill      = document.getElementById('progress-fill');

    this.textPreviewSection = document.getElementById('text-preview-section');
    this.textPreview        = document.getElementById('text-preview');
    this.regenerateBtn      = document.getElementById('regenerate-btn');

    this.quizSection       = document.getElementById('quiz-section');
    this.quizProgress      = document.getElementById('quiz-progress');
    this.quizContainer     = document.getElementById('quiz-container');
    this.quizResultEl      = document.getElementById('quiz-result');
    this.submitQuizBtn     = document.getElementById('submit-quiz-btn');
    this.printBtn          = document.getElementById('print-btn');
    this.retryBtn          = document.getElementById('retry-btn');
    this.newQuizBtn        = document.getElementById('new-quiz-btn');
  }

  // ─── Event Binding ──────────────────────────────────────────────────────────

  bindEvents() {
    // Drop zone: click to open file picker
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.fileInput.click();
    });

    // Drag-and-drop
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });
    this.dropZone.addEventListener('dragleave', (e) => {
      if (!this.dropZone.contains(e.relatedTarget)) {
        this.dropZone.classList.remove('drag-over');
      }
    });
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this.setFile(file);
    });

    // File input change
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files[0];
      if (file) this.setFile(file);
    });

    // Question count slider
    this.questionCount.addEventListener('input', () => {
      this.countDisplay.textContent = this.questionCount.value;
    });

    // Generate button
    this.generateBtn.addEventListener('click', () => this.startProcessing());

    // Regenerate quiz
    this.regenerateBtn.addEventListener('click', () => this.generateQuiz());

    // Submit quiz
    this.submitQuizBtn.addEventListener('click', () => {
      if (this.quizRenderer) this.quizRenderer.submitQuiz();
    });

    // Print
    this.printBtn.addEventListener('click', () => window.print());

    // Retry
    this.retryBtn.addEventListener('click', () => {
      if (this.quizRenderer && this.currentQuiz) {
        this.quizRenderer.resetQuiz();
        this.quizRenderer.renderQuiz(this.currentQuiz);
        this.quizResultEl.hidden = true;
      }
    });

    // New quiz (reset everything)
    this.newQuizBtn.addEventListener('click', () => this.resetAll());
    document.addEventListener('newQuiz', () => this.resetAll());
  }

  // ─── File Handling ───────────────────────────────────────────────────────────

  setFile(file) {
    this.hideError();

    // Validate type
    const isPDF   = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');
    if (!isPDF && !isImage) {
      this.showError('지원하지 않는 파일 형식입니다. PDF 또는 이미지 파일을 선택해주세요.');
      return;
    }

    // Validate size (50 MB)
    if (file.size > 50 * 1024 * 1024) {
      this.showError('파일 크기가 너무 큽니다. 50MB 이하의 파일을 선택해주세요.');
      return;
    }

    this.currentFile = file;

    // Update drop zone label
    const titleEl = this.dropZone.querySelector('.drop-zone-title');
    if (titleEl) {
      titleEl.textContent = `선택된 파일: ${file.name}`;
    }
    this.dropZone.classList.add('file-selected');

    this.generateBtn.disabled = false;
  }

  // ─── Processing Pipeline ─────────────────────────────────────────────────────

  async startProcessing() {
    if (!this.currentFile) return;
    this.hideError();

    // Show processing, hide others
    this.uploadSection.hidden    = true;
    this.textPreviewSection.hidden = true;
    this.quizSection.hidden      = true;
    this.processingSection.hidden = false;

    const isPDF = this.currentFile.type === 'application/pdf'
               || this.currentFile.name.toLowerCase().endsWith('.pdf');
    const lang  = this.langSelect.value;

    try {
      let text = '';

      if (isPDF) {
        this.pdfProcessor.onProgress = (pageNum, totalPages) => {
          const pct = Math.round((pageNum / totalPages) * 80);
          this.setProgress(pct, this.pdfProcessor.formatProgress(pageNum, totalPages));
        };
        this.setProgress(5, 'PDF 파일 분석 중...');
        text = await this.pdfProcessor.extractText(this.currentFile);
      } else {
        this.imageProcessor.onProgress = (pct) => {
          const scaled = Math.round(pct * 0.9);
          this.setProgress(scaled, `이미지 인식 중... ${pct}%`);
        };
        this.setProgress(5, '이미지 텍스트 인식 중...');
        text = await this.imageProcessor.extractText(this.currentFile, lang);
      }

      if (!text || text.trim().length < 20) {
        throw new Error('텍스트를 충분히 추출하지 못했습니다. 더 선명한 이미지나 텍스트가 많은 PDF를 사용해보세요.');
      }

      this.extractedText = text;
      await this.generateQuiz();

    } catch (err) {
      console.error(err);
      this.processingSection.hidden = true;
      this.uploadSection.hidden     = false;
      this.showError(err.message || '처리 중 오류가 발생했습니다.');
    }
  }

  async generateQuiz() {
    this.setProgress(90, '퀴즈 생성 중...');
    this.processingSection.hidden = false;
    this.quizSection.hidden = true;

    const types = [];
    if (this.typeMCQ.checked)   types.push('mcq');
    if (this.typeTF.checked)    types.push('true-false');
    if (this.typeBlank.checked) types.push('fill-blank');

    if (types.length === 0) {
      this.processingSection.hidden = true;
      this.uploadSection.hidden = false;
      this.showError('하나 이상의 문제 유형을 선택해주세요.');
      return;
    }

    const options = {
      maxQuestions: parseInt(this.questionCount.value, 10) || 10,
      types,
    };

    // Small delay to let the UI update
    await new Promise((r) => setTimeout(r, 50));

    const quizData = this.quizGenerator.generate(this.extractedText, options);

    if (!quizData.questions || quizData.questions.length === 0) {
      this.processingSection.hidden = true;
      this.uploadSection.hidden = false;
      this.showError(
        '충분한 내용을 추출하지 못했습니다. 더 선명한 이미지나 텍스트가 많은 PDF를 사용해보세요.'
      );
      return;
    }

    this.currentQuiz = quizData;

    // Show text preview (first 500 chars)
    const preview = quizData.sourceText.slice(0, 500);
    this.textPreview.textContent = preview + (quizData.sourceText.length > 500 ? '…' : '');
    this.textPreviewSection.hidden = false;

    // Create renderer and render quiz
    this.quizRenderer = new QuizRenderer(this.quizContainer, this.quizResultEl);
    this.quizRenderer.renderQuiz(quizData);

    this.setProgress(100, '완료!');

    // Show quiz section
    await new Promise((r) => setTimeout(r, 200));
    this.processingSection.hidden = true;
    this.uploadSection.hidden     = true;
    this.quizSection.hidden       = false;

    // Smooth scroll to quiz
    this.quizSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── UI Helpers ──────────────────────────────────────────────────────────────

  setProgress(percent, message) {
    if (this.progressFill) {
      this.progressFill.style.width = percent + '%';
    }
    if (this.statusText) {
      this.statusText.textContent = message || '';
    }
  }

  showError(message) {
    this.hideError();
    const errDiv = document.createElement('div');
    errDiv.id = 'error-message';
    errDiv.className = 'error-message';
    errDiv.textContent = message;
    // Insert after drop-zone
    this.dropZone.insertAdjacentElement('afterend', errDiv);
  }

  hideError() {
    const existing = document.getElementById('error-message');
    if (existing) existing.remove();
  }

  resetAll() {
    this.currentFile   = null;
    this.extractedText = '';
    this.currentQuiz   = null;
    this.quizRenderer  = null;

    this.fileInput.value = '';
    this.generateBtn.disabled = true;

    const titleEl = this.dropZone.querySelector('.drop-zone-title');
    if (titleEl) {
      titleEl.textContent = '파일을 여기에 드래그하거나 클릭하여 업로드';
    }
    this.dropZone.classList.remove('file-selected', 'drag-over');

    this.quizContainer.innerHTML = '';
    if (this.quizResultEl) this.quizResultEl.hidden = true;

    this.hideError();
    this.setProgress(0, '처리 중...');

    this.processingSection.hidden  = true;
    this.textPreviewSection.hidden = true;
    this.quizSection.hidden        = true;
    this.uploadSection.hidden      = false;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Boot
const app = new App();
