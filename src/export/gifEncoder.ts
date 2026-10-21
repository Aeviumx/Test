/**
 * Standalone GIF89a Animated Encoder with 6x6x6 + Grayscale 256-color palette and LZW compression
 */
export function encodeAnimatedGif(
  frames: ImageData[],
  width: number,
  height: number,
  fps: number
): Blob {
  const out: number[] = [];
  const writeBytes = (...bytes: number[]) => {
    for (const b of bytes) out.push(b & 0xff);
  };
  const writeU16 = (val: number) => {
    out.push(val & 0xff, (val >> 8) & 0xff);
  };
  const writeAscii = (str: string) => {
    for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xff);
  };

  // Build 256-color global palette (6x6x6 RGB cube = 216 colors + 40 grayscale ramp)
  const palette = new Uint8Array(256 * 3);
  let pIdx = 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette[pIdx * 3] = Math.round((r * 255) / 5);
        palette[pIdx * 3 + 1] = Math.round((g * 255) / 5);
        palette[pIdx * 3 + 2] = Math.round((b * 255) / 5);
        pIdx++;
      }
    }
  }
  while (pIdx < 256) {
    const v = Math.round(((pIdx - 216) * 255) / 39);
    palette[pIdx * 3] = v;
    palette[pIdx * 3 + 1] = v;
    palette[pIdx * 3 + 2] = v;
    pIdx++;
  }

  // Header: GIF89a
  writeAscii('GIF89a');
  writeU16(width);
  writeU16(height);
  writeBytes(0xf7, 0, 0); // Global color table flag (256 colors)
  for (let i = 0; i < palette.length; i++) {
    out.push(palette[i]);
  }

  // Netscape 2.0 Application Extension for infinite looping
  writeBytes(0x21, 0xff, 0x0b);
  writeAscii('NETSCAPE2.0');
  writeBytes(0x03, 0x01, 0x00, 0x00, 0x00);

  const delayCs = Math.max(2, Math.round(100 / Math.max(1, fps)));

  for (const frame of frames) {
    // Graphic Control Extension
    writeBytes(0x21, 0xf9, 0x04, 0x00);
    writeU16(delayCs);
    writeBytes(0x00, 0x00);

    // Image Descriptor
    writeBytes(0x2c);
    writeU16(0);
    writeU16(0);
    writeU16(width);
    writeU16(height);
    writeBytes(0x00);

    // Quantize pixels to 0..215
    const pixels = frame.data;
    const numPixels = width * height;
    const indexed = new Uint8Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
      const r = Math.round((pixels[i * 4] * 5) / 255);
      const g = Math.round((pixels[i * 4 + 1] * 5) / 255);
      const b = Math.round((pixels[i * 4 + 2] * 5) / 255);
      indexed[i] = r * 36 + g * 6 + b;
    }

    // LZW encode
    const minCodeSize = 8;
    writeBytes(minCodeSize);
    const lzwBytes = lzwEncode(indexed, minCodeSize);
    let offset = 0;
    while (offset < lzwBytes.length) {
      const chunkLen = Math.min(255, lzwBytes.length - offset);
      writeBytes(chunkLen);
      for (let i = 0; i < chunkLen; i++) {
        out.push(lzwBytes[offset + i]);
      }
      offset += chunkLen;
    }
    writeBytes(0x00); // Block terminator
  }

  writeBytes(0x3b); // GIF Trailer
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

function lzwEncode(indexed: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  const bytes: number[] = [];
  let bitBuf = 0;
  let bitCount = 0;

  const emitCode = (code: number) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  let table = new Map<number, number>();
  emitCode(clearCode);

  if (indexed.length === 0) {
    emitCode(eoiCode);
    if (bitCount > 0) bytes.push(bitBuf & 0xff);
    return new Uint8Array(bytes);
  }

  let prefix = indexed[0];
  for (let i = 1; i < indexed.length; i++) {
    const k = indexed[i];
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
    } else {
      emitCode(prefix);
      if (nextCode < 4096) {
        table.set(key, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
      } else {
        emitCode(clearCode);
        table = new Map<number, number>();
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
      }
      prefix = k;
    }
  }

  emitCode(prefix);
  emitCode(eoiCode);
  if (bitCount > 0) {
    bytes.push(bitBuf & 0xff);
  }
  return new Uint8Array(bytes);
}
