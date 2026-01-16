// IEEE 754 Half-precision (16-bit) floating point conversion
// Format: 1 sign bit, 5 exponent bits, 10 mantissa bits
// Bias: 15
// Range: ~6.1e-5 to 65504

// Reusable typed arrays for bit manipulation
const f32View = new Float32Array(1);
const u32View = new Uint32Array(f32View.buffer);

// Convert 32-bit float to 16-bit half-precision
// @param {number} value - 32-bit float
// @returns {number} - 16-bit half-precision as unsigned integer
export function floatToHalf(value) {
  f32View[0] = value;
  const bits = u32View[0];

  // Extract components
  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;

  // Handle special cases
  if (exp === 0) {
    // Zero or denormalized (too small for f16)
    return sign; // Flush to signed zero
  }

  if (exp === 255) {
    // Infinity or NaN
    if (mantissa === 0) {
      return sign | 0x7c00; // Infinity
    }
    // NaN - preserve some mantissa bits
    return sign | 0x7c00 | (mantissa >>> 13);
  }

  // Normalized number
  // Convert exponent from bias-127 to bias-15
  let newExp = exp - 127 + 15;

  if (newExp >= 31) {
    // Overflow to infinity
    return sign | 0x7c00;
  }

  if (newExp <= 0) {
    // Denormalized in f16 or underflow
    if (newExp < -10) {
      // Too small, flush to zero
      return sign;
    }

    // Denormalized: shift mantissa right
    const shift = 1 - newExp;
    const denormMantissa = (mantissa | 0x800000) >>> (13 + shift);
    return sign | denormMantissa;
  }

  // Normal case: truncate mantissa to 10 bits
  return sign | (newExp << 10) | (mantissa >>> 13);
}

// Convert 32-bit float to 16-bit half-precision with rounding
// @param {number} value - 32-bit float
// @returns {number} - 16-bit half-precision as unsigned integer
export function floatToHalfRounded(value) {
  f32View[0] = value;
  const bits = u32View[0];

  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;

  if (exp === 0) {
    return sign;
  }

  if (exp === 255) {
    if (mantissa === 0) {
      return sign | 0x7c00;
    }
    return sign | 0x7c00 | (mantissa >>> 13);
  }

  let newExp = exp - 127 + 15;

  if (newExp >= 31) {
    return sign | 0x7c00;
  }

  if (newExp <= 0) {
    if (newExp < -10) {
      return sign;
    }
    const shift = 1 - newExp;
    const denormMantissa = (mantissa | 0x800000) >>> (13 + shift);
    return sign | denormMantissa;
  }

  // Round to nearest even
  const truncatedMantissa = mantissa >>> 13;
  const remainder = mantissa & 0x1fff;

  // Round up if remainder > 0.5 or remainder == 0.5 and result would be odd
  if (remainder > 0x1000 || (remainder === 0x1000 && (truncatedMantissa & 1))) {
    const result = sign | (newExp << 10) | truncatedMantissa;
    return result + 1; // This handles carry into exponent correctly
  }

  return sign | (newExp << 10) | truncatedMantissa;
}

// Convert 16-bit half-precision to 32-bit float
// @param {number} half - 16-bit half-precision as unsigned integer
// @returns {number} - 32-bit float
export function halfToFloat(half) {
  const sign = (half & 0x8000) >>> 15;
  const exp = (half & 0x7c00) >>> 10;
  const mantissa = half & 0x03ff;

  if (exp === 0) {
    if (mantissa === 0) {
      // Zero
      u32View[0] = sign << 31;
      return f32View[0];
    }
    // Denormalized - convert to normalized f32
    let e = -14;
    let m = mantissa;
    while ((m & 0x400) === 0) {
      m <<= 1;
      e--;
    }
    m &= 0x3ff;
    u32View[0] = (sign << 31) | ((e + 127) << 23) | (m << 13);
    return f32View[0];
  }

  if (exp === 31) {
    if (mantissa === 0) {
      // Infinity
      u32View[0] = (sign << 31) | 0x7f800000;
      return f32View[0];
    }
    // NaN
    u32View[0] = (sign << 31) | 0x7f800000 | (mantissa << 13);
    return f32View[0];
  }

  // Normalized number
  const newExp = exp - 15 + 127;
  u32View[0] = (sign << 31) | (newExp << 23) | (mantissa << 13);
  return f32View[0];
}

// Check if a value can be represented exactly in half-precision
// @param {number} value - 32-bit float
// @returns {boolean}
export function isExactHalf(value) {
  const half = floatToHalf(value);
  const back = halfToFloat(half);
  return Object.is(value, back);
}

// Clamp a value to the half-precision representable range
// @param {number} value
// @returns {number}
export function clampToHalfRange(value) {
  if (Number.isNaN(value)) return value;
  if (value > 65504) return 65504;
  if (value < -65504) return -65504;
  // Values very close to zero get flushed
  if (Math.abs(value) < 6.103515625e-5 && value !== 0) {
    return value > 0 ? 6.103515625e-5 : -6.103515625e-5;
  }
  return value;
}

// Convert a Float32Array to half-precision Uint16Array
// @param {Float32Array} floats
// @returns {Uint16Array}
export function float32ArrayToHalf(floats) {
  const result = new Uint16Array(floats.length);
  for (let i = 0; i < floats.length; i++) {
    result[i] = floatToHalf(floats[i]);
  }
  return result;
}

// Convert a half-precision Uint16Array to Float32Array
// @param {Uint16Array} halves
// @returns {Float32Array}
export function halfToFloat32Array(halves) {
  const result = new Float32Array(halves.length);
  for (let i = 0; i < halves.length; i++) {
    result[i] = halfToFloat(halves[i]);
  }
  return result;
}
