// PDF Processor - uses PDF.js loaded via CDN (pdfjsLib global)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class PDFProcessor {
  constructor() {
    this.onProgress = null;
  }

  /**
   * Read a File as an ArrayBuffer.
   * @param {File} file
   * @returns {Promise<ArrayBuffer>}
   */
  _readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Extract all text from a PDF file.
   * @param {File} file
   * @returns {Promise<string>}
   */
  async extractText(file) {
    if (!file) {
      throw new Error('파일이 제공되지 않았습니다.');
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('PDF 파일만 처리할 수 있습니다.');
    }

    let arrayBuffer;
    try {
      arrayBuffer = await this._readAsArrayBuffer(file);
    } catch (err) {
      throw new Error('PDF 파일을 읽는 데 실패했습니다: ' + err.message);
    }

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (err) {
      throw new Error('PDF 문서를 불러오는 데 실패했습니다: ' + err.message);
    }

    const totalPages = pdf.numPages;
    const pageTexts = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (typeof this.onProgress === 'function') {
        this.onProgress(pageNum, totalPages);
      }

      let page;
      try {
        page = await pdf.getPage(pageNum);
      } catch (err) {
        throw new Error(`${pageNum}페이지를 가져오는 데 실패했습니다: ` + err.message);
      }

      let textContent;
      try {
        textContent = await page.getTextContent();
      } catch (err) {
        throw new Error(`${pageNum}페이지의 텍스트를 추출하는 데 실패했습니다: ` + err.message);
      }

      const pageText = textContent.items
        .map((item) => item.str)
        .join(' ');

      pageTexts.push(pageText);
    }

    return pageTexts.join('\n\n');
  }

  /**
   * Return the total number of pages in a PDF file.
   * @param {File} file
   * @returns {Promise<number>}
   */
  async getPageCount(file) {
    if (!file) {
      throw new Error('파일이 제공되지 않았습니다.');
    }

    let arrayBuffer;
    try {
      arrayBuffer = await this._readAsArrayBuffer(file);
    } catch (err) {
      throw new Error('PDF 파일을 읽는 데 실패했습니다: ' + err.message);
    }

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (err) {
      throw new Error('PDF 문서를 불러오는 데 실패했습니다: ' + err.message);
    }

    return pdf.numPages;
  }

  /**
   * Return a Korean progress string for the given page.
   * @param {number} pageNum
   * @param {number} totalPages
   * @returns {string}
   */
  formatProgress(pageNum, totalPages) {
    return `페이지 ${pageNum}/${totalPages} 처리 중...`;
  }
}
