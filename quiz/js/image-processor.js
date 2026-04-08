// Image Processor - uses Tesseract.js loaded via CDN (Tesseract global)

class ImageProcessor {
  constructor() {
    this.onProgress = null;
  }

  /**
   * Build a Tesseract logger that maps status/progress to this.onProgress (0-100).
   * @returns {function}
   */
  _buildLogger() {
    return (info) => {
      if (typeof this.onProgress !== 'function') return;
      if (info.status === 'recognizing text') {
        // info.progress is 0–1 during recognition
        const percent = Math.round(info.progress * 100);
        this.onProgress(percent);
      }
    };
  }

  /**
   * Clean raw Tesseract output: collapse excess whitespace while preserving
   * paragraph breaks.
   * @param {string} text
   * @returns {string}
   */
  _cleanText(text) {
    if (!text) return '';
    return text
      .replace(/[ \t]+/g, ' ')        // collapse spaces/tabs on each line
      .replace(/\n{3,}/g, '\n\n')      // at most one blank line between paragraphs
      .trim();
  }

  /**
   * Extract text from an image File using Tesseract.js.
   * @param {File} file
   * @param {string} [language='kor+eng']
   * @returns {Promise<string>}
   */
  async extractText(file, language = 'kor+eng') {
    const validation = this.validateImageFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const url = URL.createObjectURL(file);
    try {
      const result = await Tesseract.recognize(url, language, {
        logger: this._buildLogger(),
      });
      return this._cleanText(result.data.text);
    } catch (err) {
      throw new Error('이미지에서 텍스트를 추출하는 데 실패했습니다: ' + err.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Extract text from an HTMLCanvasElement using Tesseract.js.
   * @param {HTMLCanvasElement} canvas
   * @param {string} [language='kor+eng']
   * @returns {Promise<string>}
   */
  async extractTextFromCanvas(canvas, language = 'kor+eng') {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('유효한 캔버스 요소가 제공되지 않았습니다.');
    }

    try {
      const result = await Tesseract.recognize(canvas, language, {
        logger: this._buildLogger(),
      });
      return this._cleanText(result.data.text);
    } catch (err) {
      throw new Error('캔버스에서 텍스트를 추출하는 데 실패했습니다: ' + err.message);
    }
  }

  /**
   * Return the list of supported OCR languages.
   * @returns {Array<{value: string, label: string}>}
   */
  getSupportedLanguages() {
    return [
      { value: 'kor+eng', label: '한국어 + 영어' },
      { value: 'eng',     label: '영어' },
      { value: 'kor',     label: '한국어' },
    ];
  }

  /**
   * Validate that a file is an acceptable image for OCR.
   * @param {File} file
   * @returns {{ valid: boolean, error?: string }}
   */
  validateImageFile(file) {
    if (!file) {
      return { valid: false, error: '파일이 제공되지 않았습니다.' };
    }
    if (!file.type.startsWith('image/')) {
      return { valid: false, error: '이미지 파일만 처리할 수 있습니다. (예: JPG, PNG, WEBP 등)' };
    }
    const maxSize = 50 * 1024 * 1024; // 50 MB
    if (file.size > maxSize) {
      return { valid: false, error: '파일 크기가 너무 큽니다. 50MB 이하의 이미지만 허용됩니다.' };
    }
    return { valid: true };
  }
}
