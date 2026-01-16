// ZIP compression for EXR (ZIP1 and ZIP16)
// ZIP compression uses zlib deflate to compress pixel data.
// - ZIP1: Compresses one scanline at a time
// - ZIP16: Compresses 16 scanlines at a time (better compression)
// This compression method is lossless and produces small files,
// but is slower than RLE.
// In browser environments without pako, falls back to uncompressed storage.

import { preprocessForCompression, postprocessAfterDecompression } from './optimize.js';
import { getZlib } from '../io/zlib.js';

// Compression level for ZIP (4 is a good balance of speed and size)
const ZIP_COMPRESSION_LEVEL = 4;

// Compress data using ZIP (zlib deflate)
// @param {Uint8Array} data - Uncompressed data
// @returns {Uint8Array} - Compressed data
export function compressZIP(data) {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  // Make a copy and preprocess
  const processed = new Uint8Array(data);
  preprocessForCompression(processed);

  const zlib = getZlib();
  if (!zlib) {
    // No zlib available - return preprocessed but uncompressed
    // The file format allows this (decompressor checks sizes)
    return processed;
  }

  // Compress with zlib deflate
  const compressed = zlib.deflate(processed, ZIP_COMPRESSION_LEVEL);

  return new Uint8Array(compressed);
}

// Decompress ZIP data
// @param {Uint8Array} compressed - Compressed data
// @param {number} expectedSize - Expected uncompressed size
// @returns {Uint8Array} - Decompressed data
export function decompressZIP(compressed, expectedSize) {
  // If sizes match, data was stored uncompressed (compression made it bigger)
  if (compressed.length === expectedSize) {
    const result = new Uint8Array(compressed);
    postprocessAfterDecompression(result);
    return result;
  }

  const zlib = getZlib();
  if (!zlib) {
    throw new Error('zlib not available for ZIP decompression. Include pako library in browser.');
  }

  // Decompress with zlib inflate
  const decompressed = zlib.inflate(compressed);

  // Verify size
  if (decompressed.length !== expectedSize) {
    throw new Error(
      `ZIP decompression size mismatch: got ${decompressed.length}, expected ${expectedSize}`
    );
  }

  const result = new Uint8Array(decompressed);

  // Reverse the preprocessing
  postprocessAfterDecompression(result);

  return result;
}
