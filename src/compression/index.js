/**
 * Compression module - EXR compression methods
 *
 * Supported compression methods:
 * - Uncompressed: No compression, fastest I/O
 * - RLE: Run-length encoding, fast with moderate compression
 * - ZIP1: zlib per scanline, slow but small
 * - ZIP16: zlib per 16 scanlines, better compression than ZIP1
 * - PIZ: Wavelet + Huffman, best for noisy images
 * - PXR24: Lossy for f32, lossless for f16/u32
 * - B44/B44A: Lossy block compression for f16
 */

import { Compression } from '../core/types.js';
import { compressRLE, decompressRLE } from './rle.js';
import { compressZIP, decompressZIP } from './zip.js';
import { compressPXR24, decompressPXR24 } from './pxr24.js';
import { compressPIZ, decompressPIZ } from './piz/index.js';
import { compressB44, decompressB44 } from './b44/index.js';

export { compressRLE, decompressRLE } from './rle.js';
export { compressZIP, decompressZIP } from './zip.js';
export { compressPXR24, decompressPXR24, f32ToF24, f24ToF32 } from './pxr24.js';
export { compressPIZ, decompressPIZ } from './piz/index.js';
export { compressB44, decompressB44 } from './b44/index.js';
export * from './optimize.js';

/**
 * Compression context for channel-aware compression methods
 * @typedef {Object} CompressionContext
 * @property {Array<{name: string, sampleType: number}>} channels - Channel list
 * @property {number} width - Block width in pixels
 * @property {number} height - Block height in scanlines
 */

/**
 * Compress a block of pixel data
 *
 * @param {number} method - Compression method (from Compression enum)
 * @param {Uint8Array} uncompressedLE - Little-endian uncompressed data
 * @param {CompressionContext} [context] - Optional context for channel-aware compression
 * @returns {Uint8Array} - Compressed data (or uncompressed if compression didn't help)
 */
export function compressBlock(method, uncompressedLE, context = null) {
  if (uncompressedLE.length === 0) {
    return uncompressedLE;
  }

  let compressed;

  switch (method) {
    case Compression.Uncompressed:
      return uncompressedLE;

    case Compression.RLE:
      compressed = compressRLE(uncompressedLE);
      break;

    case Compression.ZIP1:
    case Compression.ZIP16:
      compressed = compressZIP(uncompressedLE);
      break;

    case Compression.PIZ:
      if (!context) {
        throw new Error('PIZ compression requires channel context');
      }
      compressed = compressPIZ(
        uncompressedLE,
        context.channels,
        context.width,
        context.height
      );
      break;

    case Compression.PXR24:
      if (!context) {
        throw new Error('PXR24 compression requires channel context');
      }
      compressed = compressPXR24(
        uncompressedLE,
        context.channels,
        context.width,
        context.height
      );
      break;

    case Compression.B44:
      if (!context) {
        throw new Error('B44 compression requires channel context');
      }
      compressed = compressB44(
        uncompressedLE,
        context.channels,
        context.width,
        context.height,
        false // B44: don't optimize flat fields
      );
      break;

    case Compression.B44A:
      if (!context) {
        throw new Error('B44A compression requires channel context');
      }
      compressed = compressB44(
        uncompressedLE,
        context.channels,
        context.width,
        context.height,
        true // B44A: optimize flat fields
      );
      break;

    default:
      throw new Error(`Unknown compression method: ${method}`);
  }

  // If compressed is larger than uncompressed, return uncompressed
  // The decompressor will detect this by comparing sizes
  if (compressed.length >= uncompressedLE.length) {
    return uncompressedLE;
  }

  return compressed;
}

/**
 * Decompress a block of pixel data
 *
 * @param {number} method - Compression method
 * @param {Uint8Array} compressedLE - Compressed data (little-endian)
 * @param {number} expectedSize - Expected uncompressed size
 * @param {CompressionContext} [context] - Optional context for channel-aware decompression
 * @returns {Uint8Array} - Decompressed data
 */
export function decompressBlock(method, compressedLE, expectedSize, context = null) {
  // If the compressed size equals expected size, data was stored uncompressed
  if (compressedLE.length === expectedSize) {
    return compressedLE;
  }

  switch (method) {
    case Compression.Uncompressed:
      return compressedLE;

    case Compression.RLE:
      return decompressRLE(compressedLE, expectedSize);

    case Compression.ZIP1:
    case Compression.ZIP16:
      return decompressZIP(compressedLE, expectedSize);

    case Compression.PIZ:
      if (!context) {
        throw new Error('PIZ decompression requires channel context');
      }
      return decompressPIZ(compressedLE, context.channels, context.width, context.height, expectedSize);

    case Compression.PXR24:
      if (!context) {
        throw new Error('PXR24 decompression requires channel context');
      }
      return decompressPXR24(compressedLE, context.channels, context.width, context.height, expectedSize);

    case Compression.B44:
    case Compression.B44A:
      if (!context) {
        throw new Error('B44 decompression requires channel context');
      }
      return decompressB44(compressedLE, context.channels, context.width, context.height, expectedSize);

    default:
      throw new Error(`Unknown compression method: ${method}`);
  }
}

/**
 * Get the name of a compression method
 * @param {number} method
 * @returns {string}
 */
export function compressionName(method) {
  switch (method) {
    case Compression.Uncompressed:
      return 'none';
    case Compression.RLE:
      return 'rle';
    case Compression.ZIP1:
      return 'zips';
    case Compression.ZIP16:
      return 'zip';
    case Compression.PIZ:
      return 'piz';
    case Compression.PXR24:
      return 'pxr24';
    case Compression.B44:
      return 'b44';
    case Compression.B44A:
      return 'b44a';
    default:
      return 'unknown';
  }
}
