/**
 * Haar wavelet encoding and decoding for PIZ compression
 *
 * The wavelet transform operates on 2D data, processing pixels in a
 * hierarchical manner. Each level processes pairs of values:
 * - Encode: (a, b) -> (average, difference)
 * - Decode: (avg, diff) -> (a, b)
 *
 * Two modes are supported:
 * - 14-bit: For values < 16384 (faster, simpler math)
 * - 16-bit: For full 16-bit values (requires modular arithmetic)
 */

const BIT_COUNT = 16;
const OFFSET = 1 << (BIT_COUNT - 1); // 32768
const MOD_MASK = (1 << BIT_COUNT) - 1; // 65535

/**
 * Check if a value fits in 14 bits
 * @param {number} value
 * @returns {boolean}
 */
function is14Bit(value) {
  return value < (1 << 14);
}

/**
 * 14-bit encoding: simple average and difference
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]} [average, difference]
 */
function encode14bit(a, b) {
  // Convert to signed for arithmetic
  const as = a > 32767 ? a - 65536 : a;
  const bs = b > 32767 ? b - 65536 : b;

  const m = (as + bs) >> 1;
  const d = as - bs;

  // Convert back to unsigned 16-bit
  return [(m & 0xffff), (d & 0xffff)];
}

/**
 * 14-bit decoding
 * @param {number} l - low (average)
 * @param {number} h - high (difference)
 * @returns {[number, number]} [a, b]
 */
function decode14bit(l, h) {
  // Convert to signed
  const ls = l > 32767 ? l - 65536 : l;
  const hs = h > 32767 ? h - 65536 : h;

  const hi = hs;
  const ai = ls + (hi & 1) + (hi >> 1);

  const a = ai;
  const b = ai - hi;

  return [(a & 0xffff), (b & 0xffff)];
}

/**
 * 16-bit encoding with modular arithmetic
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]} [average, difference]
 */
function encode16bit(a, b) {
  const aOffset = (a + OFFSET) & MOD_MASK;
  let m = (aOffset + b) >> 1;
  let d = aOffset - b;

  if (d < 0) {
    m = (m + OFFSET) & MOD_MASK;
  }
  d = d & MOD_MASK;

  return [m, d];
}

/**
 * 16-bit decoding with modular arithmetic
 * @param {number} l - low (average)
 * @param {number} h - high (difference)
 * @returns {[number, number]} [a, b]
 */
function decode16bit(l, h) {
  const m = l;
  const d = h;

  const b = (m - (d >> 1)) & MOD_MASK;
  const a = (d + b - OFFSET) & MOD_MASK;

  return [a, b];
}

/**
 * Encode (compress) a 2D buffer with Haar wavelet transform
 *
 * @param {Uint16Array} buffer - Data to transform (modified in place)
 * @param {number} countX - Width
 * @param {number} countY - Height
 * @param {number} offsetX - X stride (usually 1 for single channel, or samples_per_pixel for interleaved)
 * @param {number} offsetY - Y stride (usually width * samples_per_pixel)
 * @param {number} maxValue - Maximum value in buffer (determines 14-bit vs 16-bit mode)
 */
export function waveletEncode(buffer, countX, countY, offsetX, offsetY, maxValue) {
  const count = Math.min(countX, countY);
  const encode = is14Bit(maxValue) ? encode14bit : encode16bit;

  let p = 1;
  let p2 = 2;

  while (p2 <= count) {
    const offset1X = offsetX * p;
    const offset1Y = offsetY * p;
    const offset2X = offsetX * p2;
    const offset2Y = offsetY * p2;

    const endY = offsetY * (countY - p2);

    // Process 2x2 blocks
    let posY = 0;
    while (posY <= endY) {
      let posX = posY;
      const endX = posX + offsetX * (countX - p2);

      while (posX <= endX) {
        const posRight = posX + offset1X;
        const posTop = posX + offset1Y;
        const posTopRight = posTop + offset1X;

        let [center, right] = encode(buffer[posX], buffer[posRight]);
        let [top, topRight] = encode(buffer[posTop], buffer[posTopRight]);

        [center, top] = encode(center, top);
        [right, topRight] = encode(right, topRight);

        buffer[posX] = center;
        buffer[posTop] = top;
        buffer[posRight] = right;
        buffer[posTopRight] = topRight;

        posX += offset2X;
      }

      // Handle remaining odd pixel column
      if (countX & p) {
        const posTop = posX + offset1Y;
        const [center, top] = encode(buffer[posX], buffer[posTop]);
        buffer[posX] = center;
        buffer[posTop] = top;
      }

      posY += offset2Y;
    }

    // Handle remaining odd row
    if (countY & p) {
      let posX = posY;
      const endX = posY + offsetX * (countX - p2);

      while (posX <= endX) {
        const posRight = posX + offset1X;
        const [center, right] = encode(buffer[posX], buffer[posRight]);
        buffer[posRight] = right;
        buffer[posX] = center;
        posX += offset2X;
      }
    }

    p = p2;
    p2 <<= 1;
  }
}

/**
 * Decode (decompress) a 2D buffer with inverse Haar wavelet transform
 *
 * @param {Uint16Array} buffer - Data to transform (modified in place)
 * @param {number} countX - Width
 * @param {number} countY - Height
 * @param {number} offsetX - X stride
 * @param {number} offsetY - Y stride
 * @param {number} maxValue - Maximum value (determines 14-bit vs 16-bit mode)
 */
export function waveletDecode(buffer, countX, countY, offsetX, offsetY, maxValue) {
  const count = Math.min(countX, countY);
  const decode = is14Bit(maxValue) ? decode14bit : decode16bit;

  // Find max level
  let p = 1;
  while (p <= count) {
    p <<= 1;
  }
  p >>= 1;
  let p2 = p;
  p >>= 1;

  while (p >= 1) {
    const offset1X = offsetX * p;
    const offset1Y = offsetY * p;
    const offset2X = offsetX * p2;
    const offset2Y = offsetY * p2;

    const endY = offsetY * (countY - p2);

    let posY = 0;
    while (posY <= endY) {
      let posX = posY;
      const endX = posX + offsetX * (countX - p2);

      while (posX <= endX) {
        const posRight = posX + offset1X;
        const posTop = posX + offset1Y;
        const posTopRight = posTop + offset1X;

        let [center, top] = decode(buffer[posX], buffer[posTop]);
        let [right, topRight] = decode(buffer[posRight], buffer[posTopRight]);

        [center, right] = decode(center, right);
        [top, topRight] = decode(top, topRight);

        buffer[posX] = center;
        buffer[posTop] = top;
        buffer[posRight] = right;
        buffer[posTopRight] = topRight;

        posX += offset2X;
      }

      // Decode remaining odd x value
      if (countX & p) {
        const posTop = posX + offset1Y;
        const [center, top] = decode(buffer[posX], buffer[posTop]);
        buffer[posX] = center;
        buffer[posTop] = top;
      }

      posY += offset2Y;
    }

    // Decode remaining odd row
    if (countY & p) {
      let posX = posY;
      const endX = posX + offsetX * (countX - p2);

      while (posX <= endX) {
        const posRight = posX + offset1X;
        const [center, right] = decode(buffer[posX], buffer[posRight]);
        buffer[posX] = center;
        buffer[posRight] = right;
        posX += offset2X;
      }
    }

    p2 = p;
    p >>= 1;
  }
}
