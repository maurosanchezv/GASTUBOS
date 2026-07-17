// gastubos/frontend/src/utils/escPosBuilder.js
// --- ESC/POS Binary Command Builder ---
import { LOGO_TUBOS_SVG, LOGO_PMS_SVG } from './logosSvg.js';

export class EscPosBuilder {
  constructor() {
    this.buffer = [];
  }

  addBytes(bytes) {
    if (Array.isArray(bytes)) {
      this.buffer.push(...bytes);
    } else if (bytes instanceof Uint8Array || ArrayBuffer.isView(bytes)) {
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

  addRasterImage(pixels, width, height) {
    const widthBytes = width / 8;
    const imageBytes = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < widthBytes; x++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = x * 8 + bit;
          const pixelIndex = (y * width + pixelX) * 4;
          const r = pixels[pixelIndex];
          const g = pixels[pixelIndex + 1];
          const b = pixels[pixelIndex + 2];
          const a = pixels[pixelIndex + 3];
          
          let isBlack = 0;
          if (a > 50) {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            if (gray < 128) {
              isBlack = 1;
            }
          }
          byte = (byte << 1) | isBlack;
        }
        imageBytes.push(byte);
      }
    }

    const xL = widthBytes % 256;
    const xH = Math.floor(widthBytes / 256);
    const yL = height % 256;
    const yH = Math.floor(height / 256);

    this.addBytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    this.addBytes(imageBytes);
    return this;
  }

  getBuffer() {
    return new Uint8Array(this.buffer);
  }
}

export function generarLogoEscPos() {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      
      // Fondo blanco obligatorio
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      let loadedCount = 0;
      const imgTubos = new Image();
      const imgPms = new Image();
      
      const onImageLoaded = () => {
        loadedCount++;
        if (loadedCount === 2) {
          try {
            // Dibujar ambos lado a lado
            // Margen izquierdo = 42px, Logo 1 (70px ancho), gap = 40px, Logo 2 (189px ancho), margen derecho = 43px. Total = 384px.
            ctx.drawImage(imgTubos, 42, 5, 70, 70);
            ctx.drawImage(imgPms, 152, 5, 189, 70);
            
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            const builder = new EscPosBuilder();
            builder.addRasterImage(imgData.data, canvas.width, canvas.height);
            
            resolve(builder.getBuffer());
          } catch (err) {
            reject(err);
          }
        }
      };
      
      const onError = (err) => {
        reject(new Error("Error al cargar las imágenes SVG del logo: " + err));
      };
      
      imgTubos.onload = onImageLoaded;
      imgTubos.onerror = onError;
      imgPms.onload = onImageLoaded;
      imgPms.onerror = onError;
      
      imgTubos.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LOGO_TUBOS_SVG);
      imgPms.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LOGO_PMS_SVG);
    } catch (e) {
      reject(e);
    }
  });
}
