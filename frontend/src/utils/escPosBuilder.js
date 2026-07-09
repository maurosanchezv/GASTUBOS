// gastubos/frontend/src/utils/escPosBuilder.js
// --- ESC/POS Binary Command Builder ---

export class EscPosBuilder {
  constructor() {
    this.buffer = [];
  }

  addBytes(bytes) {
    if (Array.isArray(bytes)) {
      this.buffer.push(...bytes);
    } else {
      this.buffer.push(bytes);
    }
    return this;
  }

  addText(text) {
    const cleanText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N");
    for (let i = 0; i < cleanText.length; i++) {
      this.buffer.push(cleanText.charCodeAt(i));
    }
    return this;
  }

  addTextLine(text = '') {
    this.addText(text);
    this.buffer.push(13, 10); // CR, LF para asegurar el retorno de carro y salto de línea físico
    return this;
  }

  initialize() {
    return this.addBytes([0x1B, 0x40]);
  }

  alignCenter() {
    return this.addBytes([0x1B, 0x61, 0x01]);
  }

  alignLeft() {
    return this.addBytes([0x1B, 0x61, 0x00]);
  }

  alignRight() {
    return this.addBytes([0x1B, 0x61, 0x02]);
  }

  boldOn() {
    return this.addBytes([0x1B, 0x45, 0x01]);
  }

  boldOff() {
    return this.addBytes([0x1B, 0x45, 0x00]);
  }

  doubleSizeOn() {
    return this.addBytes([0x1D, 0x21, 0x11]);
  }

  doubleSizeOff() {
    return this.addBytes([0x1D, 0x21, 0x00]);
  }

  feed(lines = 3) {
    return this.addBytes([0x1B, 0x64, lines]);
  }

  addQRCode(data) {
    // 1. Método Epson Estándar (GS ( k) - para impresoras de escritorio standard
    this.addBytes([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x03]); // Tamaño 3
    this.addBytes([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30]); // ECC L
    
    const dataLength = data.length;
    const totalLength = dataLength + 3;
    const pL = totalLength % 256;
    const pH = Math.floor(totalLength / 256);

    this.addBytes([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]);
    for (let i = 0; i < dataLength; i++) {
      this.buffer.push(data.charCodeAt(i));
    }
    this.addBytes([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]); // Imprimir

    // 2. Método ESC Z (1B 5A) - utilizado por impresoras portátiles HPRT / Rongta / Genéricas
    // Comando: ESC Z [m] [n] [k] [dL] [dH] [datos]
    // m = 2 (QR code), n = 2 (ECC Level M), k = 4 (tamaño de módulo)
    const dL = dataLength % 256;
    const dH = Math.floor(dataLength / 256);
    this.addBytes([0x1B, 0x5A, 0x02, 0x02, 0x04, dL, dH]);
    for (let i = 0; i < dataLength; i++) {
      this.buffer.push(data.charCodeAt(i));
    }

    return this;
  }

  getBuffer() {
    return new Uint8Array(this.buffer);
  }
}
