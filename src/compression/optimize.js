/**
 * Byte optimization utilities for EXR compression
 *
 * EXR compression uses two preprocessing steps before the actual compression:
 * 1. Byte separation (de-interleaving): Separate even and odd bytes
 * 2. Delta encoding: Store differences between consecutive bytes
 *
 * These steps improve compression ratios by grouping similar bytes together
 * and reducing the entropy of the data.
 */

/**
 * Separate bytes such that even-indexed bytes go to the first half,
 * odd-indexed bytes go to the second half.
 *
 * Example: [A0, A1, B0, B1, C0, C1] -> [A0, B0, C0, A1, B1, C1]
 *
 * This is called "de-interleaving" and is the inverse of interleaving.
 * It groups the high bytes and low bytes of multi-byte values together,
 * which typically have similar patterns and compress better.
 *
 * @param {Uint8Array} data - Data to separate (modified in place)
 */
export function separateBytesFragments(data) {
  if (data.length <= 1) return;

  const temp = new Uint8Array(data.length);
  const halfLen = Math.ceil(data.length / 2);

  // Even indices go to first half, odd indices go to second half
  let firstIdx = 0;
  let secondIdx = halfLen;

  for (let i = 0; i < data.length; i++) {
    if (i % 2 === 0) {
      temp[firstIdx++] = data[i];
    } else {
      temp[secondIdx++] = data[i];
    }
  }

  data.set(temp);
}

/**
 * Interleave bytes - the inverse of separateBytesFragments.
 *
 * Example: [A0, B0, C0, A1, B1, C1] -> [A0, A1, B0, B1, C0, C1]
 *
 * @param {Uint8Array} data - Data to interleave (modified in place)
 */
export function interleaveByteBlocks(data) {
  if (data.length <= 1) return;

  const temp = new Uint8Array(data.length);
  const halfLen = Math.ceil(data.length / 2);

  let outIdx = 0;
  const secondHalfLen = data.length - halfLen;

  for (let i = 0; i < secondHalfLen; i++) {
    temp[outIdx++] = data[i]; // First half
    temp[outIdx++] = data[halfLen + i]; // Second half
  }

  // Handle odd length - last element from first half
  if (data.length % 2 === 1) {
    temp[outIdx] = data[halfLen - 1];
  }

  data.set(temp);
}

/**
 * Convert sample values to differences.
 * Each byte becomes the difference from the previous byte, plus 128 (bias).
 *
 * This is delta encoding: value[i] = original[i] - original[i-1] + 128
 * The first byte is unchanged.
 *
 * The bias of 128 centers the differences around 128 instead of 0,
 * which works better with unsigned bytes.
 *
 * @param {Uint8Array} data - Data to convert (modified in place)
 */
export function samplesToDifferences(data) {
  if (data.length <= 1) return;

  // Process from end to start so we don't overwrite values we need
  let prev = data[data.length - 1];
  for (let i = data.length - 1; i >= 1; i--) {
    const current = data[i];
    const previous = data[i - 1];
    // Difference with bias, wrapped to u8
    data[i] = (current - previous + 128) & 0xff;
  }
  // First byte stays unchanged
}

/**
 * Convert differences back to sample values.
 * The inverse of samplesToDifferences.
 *
 * @param {Uint8Array} data - Data to convert (modified in place)
 */
export function differencesToSamples(data) {
  if (data.length <= 1) return;

  let prev = data[0];
  for (let i = 1; i < data.length; i++) {
    const diff = data[i];
    const sample = (prev + diff - 128) & 0xff;
    data[i] = sample;
    prev = sample;
  }
}

/**
 * Apply both preprocessing steps for compression:
 * 1. Separate bytes (de-interleave)
 * 2. Delta encode
 *
 * @param {Uint8Array} data - Data to preprocess (modified in place)
 */
export function preprocessForCompression(data) {
  separateBytesFragments(data);
  samplesToDifferences(data);
}

/**
 * Reverse both preprocessing steps after decompression:
 * 1. Reverse delta encoding
 * 2. Interleave bytes
 *
 * @param {Uint8Array} data - Data to postprocess (modified in place)
 */
export function postprocessAfterDecompression(data) {
  differencesToSamples(data);
  interleaveByteBlocks(data);
}
