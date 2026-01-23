// RLE (Run-Length Encoding) compression for EXR
// RLE compression produces slightly smaller files that can be read/written quickly.
// Compressed size is usually 60-75% of uncompressed.
// Works best for images with large flat areas (masks, abstract graphics).
// Format:
// - Positive count (0-127): Repeat the next byte (count + 1) times
// - Negative count (-1 to -127): Copy the next (-count) bytes literally

import {
  postprocessAfterDecompression,
  preprocessForCompression,
} from './optimize.js'

const MIN_RUN_LENGTH = 3
const MAX_RUN_LENGTH = 127

// Compress data using RLE
// @param {Uint8Array} data - Uncompressed data (in native/little endian)
// @returns {Uint8Array} - Compressed data
export function compressRLE(data) {
  if (data.length === 0) {
    return new Uint8Array(0)
  }

  // Make a copy and preprocess
  const processed = new Uint8Array(data)
  preprocessForCompression(processed)

  // Worst case: no compression + overhead
  const output = []
  let runStart = 0
  let runEnd = 1

  while (runStart < processed.length) {
    // Look for a run of identical bytes
    while (
      runEnd < processed.length &&
      processed[runStart] === processed[runEnd] &&
      runEnd - runStart - 1 < MAX_RUN_LENGTH
    ) {
      runEnd++
    }

    if (runEnd - runStart >= MIN_RUN_LENGTH) {
      // Emit a run: positive count means repeat
      // count = (runEnd - runStart - 1), so 0 = 1 repeat, 127 = 128 repeats
      output.push((runEnd - runStart - 1) & 0xff)
      output.push(processed[runStart])
      runStart = runEnd
    } else {
      // Look for a literal sequence (non-repeating bytes)
      while (
        runEnd < processed.length &&
        runEnd - runStart < MAX_RUN_LENGTH &&
        // Check if next 3 bytes are not all the same (would be a run)
        (runEnd + 1 >= processed.length ||
          processed[runEnd] !== processed[runEnd + 1] ||
          runEnd + 2 >= processed.length ||
          processed[runEnd + 1] !== processed[runEnd + 2])
      ) {
        runEnd++
      }

      // Emit literals: negative count means copy
      // count = (runStart - runEnd), e.g., -3 means copy 3 bytes
      const _literalCount = runEnd - runStart
      output.push((runStart - runEnd) & 0xff) // This gives negative value as unsigned
      for (let i = runStart; i < runEnd; i++) {
        output.push(processed[i])
      }

      runStart = runEnd
      runEnd = runStart + 1
    }
  }

  return new Uint8Array(output)
}

// Decompress RLE data
// @param {Uint8Array} compressed - Compressed data
// @param {number} expectedSize - Expected uncompressed size
// @returns {Uint8Array} - Decompressed data
export function decompressRLE(compressed, expectedSize) {
  const output = new Uint8Array(expectedSize)
  let inPos = 0
  let outPos = 0

  while (inPos < compressed.length && outPos < expectedSize) {
    // Read count as signed byte
    const count = (compressed[inPos++] << 24) >> 24 // Sign extend

    if (count < 0) {
      // Literal: copy -count bytes
      const literalCount = -count
      for (let i = 0; i < literalCount && outPos < expectedSize; i++) {
        output[outPos++] = compressed[inPos++]
      }
    } else {
      // Run: repeat next byte (count + 1) times
      const repeatCount = count + 1
      const value = compressed[inPos++]
      for (let i = 0; i < repeatCount && outPos < expectedSize; i++) {
        output[outPos++] = value
      }
    }
  }

  // Reverse the preprocessing
  postprocessAfterDecompression(output)

  return output
}
