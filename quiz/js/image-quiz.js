// ImageQuiz – label-covering quiz for anatomy diagrams
// All labels detected via Tesseract.js are covered with black boxes.
// One box at a time is the "current question" (amber highlight).
// Clicking a box or pressing "정답 확인" reveals that label.

class ImageQuiz {
  constructor() {
    this.labels        = [];   // [{id, text, bbox, revealed, answered}]
    this.currentIndex  = 0;
    this.score         = { correct: 0, wrong: 0 };
    this.onProgress    = null; // (percent:number) => void

    // Internal
    this._imageUrl        = null;
    this._naturalW        = 0;
    this._naturalH        = 0;
    this._imageEl         = null;
    this._overlayEl       = null;
    this._boxes           = [];   // parallel array of <div> elements
    this._resizeObserver  = null;
  }

  // ─── Processing ──────────────────────────────────────────────────────────────

  /**
   * Run OCR on the file and store label data.
   * @param {File} file
   * @param {string} [language='kor+eng']
   * @returns {Promise<number>} number of labels detected
   */
  async processImage(file, language) {
    // Clean up previous URL
    if (this._imageUrl) {
      URL.revokeObjectURL(this._imageUrl);
      this._imageUrl = null;
    }

    this._imageUrl = URL.createObjectURL(file);
    language = language || 'kor+eng';

    // Get natural dimensions
    await new Promise((resolve, reject) => {
      const tmp = new Image();
      tmp.onload  = () => { this._naturalW = tmp.naturalWidth; this._naturalH = tmp.naturalHeight; resolve(); };
      tmp.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
      tmp.src = this._imageUrl;
    });

    // OCR with word-level bounding boxes
    const result = await Tesseract.recognize(this._imageUrl, language, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof this.onProgress === 'function') {
          this.onProgress(Math.round(m.progress * 100));
        }
      }
    });

    // Filter and store labels
    this.labels = result.data.words
      .filter(w => w.text.trim().length > 0 && w.confidence > 35)
      .map((w, i) => ({
        id:       i,
        text:     w.text.trim(),
        bbox:     { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
        revealed: false,
        answered: null, // null | 'correct' | 'wrong'
      }));

    this.currentIndex = 0;
    this.score = { correct: 0, wrong: 0 };
    return this.labels.length;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  /**
   * Render the image with label boxes into the given container element.
   * @param {HTMLElement} containerEl
   */
  render(containerEl) {
    // Disconnect previous observer
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }

    containerEl.innerHTML = '';

    // ── Image + overlay wrapper ──
    const wrapper = document.createElement('div');
    wrapper.className = 'iq-image-container';

    const img = document.createElement('img');
    img.className = 'iq-anatomy-image';
    img.src = this._imageUrl;
    img.alt = '해부도';
    img.draggable = false;
    this._imageEl = img;

    const overlay = document.createElement('div');
    overlay.className = 'iq-overlay';
    this._overlayEl = overlay;

    wrapper.appendChild(img);
    wrapper.appendChild(overlay);
    containerEl.appendChild(wrapper);

    // ── Create one box per label ──
    this._boxes = this.labels.map((label, i) => {
      const box = document.createElement('div');
      box.className = 'iq-label-box';
      box.dataset.index = i;
      box.title = '클릭하면 정답을 확인합니다';

      // Hidden answer text (shown when revealed)
      const revealSpan = document.createElement('span');
      revealSpan.className = 'iq-label-text';
      revealSpan.textContent = label.text;
      box.appendChild(revealSpan);

      box.addEventListener('click', () => this._onBoxClick(i));
      overlay.appendChild(box);
      return box;
    });

    // Position boxes once image loads, then on every resize
    const position = () => this._positionAll();
    if (img.complete && img.naturalWidth > 0) {
      position();
    } else {
      img.addEventListener('load', position, { once: true });
    }

    this._resizeObserver = new ResizeObserver(position);
    this._resizeObserver.observe(img);

    this._syncBoxStates();
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  _onBoxClick(index) {
    // Clicking any box reveals it
    this._reveal(index);
  }

  _positionAll() {
    if (!this._imageEl || !this._naturalW) return;
    const dw = this._imageEl.offsetWidth;
    const dh = this._imageEl.offsetHeight;
    if (!dw || !dh) return;

    const sx = dw / this._naturalW;
    const sy = dh / this._naturalH;
    const pad = 3; // px padding around each word

    this.labels.forEach((label, i) => {
      const box = this._boxes[i];
      if (!box) return;
      box.style.left   = (label.bbox.x0 * sx - pad) + 'px';
      box.style.top    = (label.bbox.y0 * sy - pad) + 'px';
      box.style.width  = ((label.bbox.x1 - label.bbox.x0) * sx + pad * 2) + 'px';
      box.style.height = ((label.bbox.y1 - label.bbox.y0) * sy + pad * 2) + 'px';
    });
  }

  _reveal(index) {
    if (index < 0 || index >= this.labels.length) return;
    this.labels[index].revealed = true;
    this._syncBoxStates();
  }

  _syncBoxStates() {
    this.labels.forEach((label, i) => {
      const box = this._boxes[i];
      if (!box) return;

      box.classList.remove('iq-current', 'iq-revealed', 'iq-answered-correct', 'iq-answered-wrong');

      if (label.revealed) {
        box.classList.add('iq-revealed');
        if (label.answered === 'correct') box.classList.add('iq-answered-correct');
        if (label.answered === 'wrong')   box.classList.add('iq-answered-wrong');
      } else if (i === this.currentIndex) {
        box.classList.add('iq-current');
      }
    });
  }

  // ─── Public quiz API ─────────────────────────────────────────────────────────

  /** Reveal the current question's label. */
  revealCurrent() {
    this._reveal(this.currentIndex);
  }

  /**
   * Record a self-marked answer for the given index.
   * @param {number} index
   * @param {boolean} correct
   */
  markAnswer(index, correct) {
    const label = this.labels[index];
    if (!label || label.answered !== null) return;
    label.answered = correct ? 'correct' : 'wrong';
    if (correct) this.score.correct++;
    else         this.score.wrong++;
    this._syncBoxStates();
  }

  /** Move to the next label. Returns false if already at end. */
  goNext() {
    if (this.currentIndex >= this.labels.length - 1) return false;
    this.currentIndex++;
    this._syncBoxStates();
    return true;
  }

  /** Move to the previous label. Returns false if already at start. */
  goPrev() {
    if (this.currentIndex <= 0) return false;
    this.currentIndex--;
    this._syncBoxStates();
    return true;
  }

  /** Hide all boxes and reset score/index. */
  reset() {
    this.labels.forEach(l => { l.revealed = false; l.answered = null; });
    this.score = { correct: 0, wrong: 0 };
    this.currentIndex = 0;
    this._syncBoxStates();
  }

  /** Returns the current label object (or null). */
  getCurrentLabel() {
    return this.labels[this.currentIndex] || null;
  }

  get totalLabels()       { return this.labels.length; }
  get isCurrentRevealed() { return !!(this.labels[this.currentIndex] && this.labels[this.currentIndex].revealed); }
  get isCurrentAnswered() { return !!(this.labels[this.currentIndex] && this.labels[this.currentIndex].answered !== null); }

  /** Clean up resources. */
  destroy() {
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
    if (this._imageUrl)       { URL.revokeObjectURL(this._imageUrl); this._imageUrl = null; }
    this.labels  = [];
    this._boxes  = [];
    this._imageEl   = null;
    this._overlayEl = null;
  }
}
