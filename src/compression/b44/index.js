// B44/B44A compression for EXR
// B44 is a lossy compression method for f16 channels only.
// - Compresses 4x4 pixel blocks of f16 data to 14 bytes (from 32 bytes)
// - f32 and u32 channels are stored uncompressed
// - B44A variant compresses uniform blocks to 3 bytes
// Fast enough for real-time playback. File size is predictable
// (depends only on resolution, not content).

import { SampleType } from '../../core/types.js';

const BLOCK_SAMPLE_COUNT = 4;
const BIAS = 0x20;
const SIX_BITS = 0x3f;

// Shift and round a value
// @param {number} x
// @param {number} shift
// @returns {number}
function shiftAndRound(x, shift) {
  const x2 = x << 1;
  const a = (1 << shift) - 1;
  const shiftPlus1 = shift + 1;
  const b = (x2 >> shiftPlus1) & 1;
  return (x2 + a + b) >> shiftPlus1;
}

// Pack a 4x4 block of 16-bit pixels into 14 or 3 bytes
// @param {Uint16Array} s - 16 pixel values
// @param {Uint8Array} b - Output buffer (at least 14 bytes)
// @param {boolean} optimizeFlatFields - Use 3-byte encoding for flat blocks
// @returns {number} - Number of bytes written (3 or 14)
function pack(s, b, optimizeFlatFields) {
  const t = new Uint16Array(16);

  // Transform values to put negatives below positives
  for (let i = 0; i < 16; i++) {
    if ((s[i] & 0x7c00) === 0x7c00) {
      // Infinity or NaN
      t[i] = 0x8000;
    } else if ((s[i] & 0x8000) !== 0) {
      // Negative
      t[i] = (~s[i]) & 0xffff;
    } else {
      // Positive
      t[i] = s[i] | 0x8000;
    }
  }

  // Find max value
  let tMax = t[0];
  for (let i = 1; i < 16; i++) {
    if (t[i] > tMax) tMax = t[i];
  }

  // Find shift value such that all differences fit in 6 bits with bias
  let shift = -1;
  const d = new Int32Array(16);
  const r = new Int32Array(15);
  let rMin, rMax;

  do {
    shift++;

    // Compute absolute differences from max, shifted and rounded
    for (let i = 0; i < 16; i++) {
      d[i] = shiftAndRound(tMax - t[i], shift);
    }

    // Convert to running differences with bias
    r[0] = d[0] - d[4] + BIAS;
    r[1] = d[4] - d[8] + BIAS;
    r[2] = d[8] - d[12] + BIAS;

    r[3] = d[0] - d[1] + BIAS;
    r[4] = d[4] - d[5] + BIAS;
    r[5] = d[8] - d[9] + BIAS;
    r[6] = d[12] - d[13] + BIAS;

    r[7] = d[1] - d[2] + BIAS;
    r[8] = d[5] - d[6] + BIAS;
    r[9] = d[9] - d[10] + BIAS;
    r[10] = d[13] - d[14] + BIAS;

    r[11] = d[2] - d[3] + BIAS;
    r[12] = d[6] - d[7] + BIAS;
    r[13] = d[10] - d[11] + BIAS;
    r[14] = d[14] - d[15] + BIAS;

    rMin = r[0];
    rMax = r[0];
    for (let i = 1; i < 15; i++) {
      if (r[i] < rMin) rMin = r[i];
      if (r[i] > rMax) rMax = r[i];
    }
  } while (rMin < 0 || rMax > 0x3f);

  // Check for flat field (B44A optimization)
  if (rMin === BIAS && rMax === BIAS && optimizeFlatFields) {
    // All pixels have same value - encode in 3 bytes
    b[0] = (t[0] >>> 8) & 0xff;
    b[1] = t[0] & 0xff;
    b[2] = 0xfc; // Special marker for 3-byte encoding
    return 3;
  }

  // Pack t[0], shift, and r[0..14] into 14 bytes
  b[0] = (t[0] >>> 8) & 0xff;
  b[1] = t[0] & 0xff;

  b[2] = ((shift << 2) | (r[0] >>> 4)) & 0xff;
  b[3] = ((r[0] << 4) | (r[1] >>> 2)) & 0xff;
  b[4] = ((r[1] << 6) | r[2]) & 0xff;

  b[5] = ((r[3] << 2) | (r[4] >>> 4)) & 0xff;
  b[6] = ((r[4] << 4) | (r[5] >>> 2)) & 0xff;
  b[7] = ((r[5] << 6) | r[6]) & 0xff;

  b[8] = ((r[7] << 2) | (r[8] >>> 4)) & 0xff;
  b[9] = ((r[8] << 4) | (r[9] >>> 2)) & 0xff;
  b[10] = ((r[9] << 6) | r[10]) & 0xff;

  b[11] = ((r[11] << 2) | (r[12] >>> 4)) & 0xff;
  b[12] = ((r[12] << 4) | (r[13] >>> 2)) & 0xff;
  b[13] = ((r[13] << 6) | r[14]) & 0xff;

  return 14;
}

// Unpack a 14-byte block into 4x4 16-bit pixels
// @param {Uint8Array} b - 14 input bytes
// @param {Uint16Array} s - 16 output pixels
function unpack14(b, s) {
  s[0] = (b[0] << 8) | b[1];

  const shift = b[2] >>> 2;
  const bias = 0x20 << shift;

  s[4] = (s[0] + ((((b[2] << 4) | (b[3] >>> 4)) & SIX_BITS) << shift) - bias) & 0xffff;
  s[8] = (s[4] + ((((b[3] << 2) | (b[4] >>> 6)) & SIX_BITS) << shift) - bias) & 0xffff;
  s[12] = (s[8] + ((b[4] & SIX_BITS) << shift) - bias) & 0xffff;

  s[1] = (s[0] + ((b[5] >>> 2) << shift) - bias) & 0xffff;
  s[5] = (s[4] + ((((b[5] << 4) | (b[6] >>> 4)) & SIX_BITS) << shift) - bias) & 0xffff;
  s[9] = (s[8] + ((((b[6] << 2) | (b[7] >>> 6)) & SIX_BITS) << shift) - bias) & 0xffff;
  s[13] = (s[12] + ((b[7] & SIX_BITS) << shift) - bias) & 0xffff;

  s[2] = (s[1] + ((b[8] >>> 2) << shift) - bias) & 0xffff;
  s[6] = (s[5] + ((((b[8] << 4) | (b[9] >>> 4)) & SIX_BITS) << shift) - bias) & 0xffff;
  s[10] = (s[9] + ((((b[9] << 2) | (b[10] >>> 6)) & SIX_BITS) << shift) - bias) & 0xffff;
  s[14] = (s[13] + ((b[10] & SIX_BITS) << shift) - bias) & 0xffff;

  s[3] = (s[2] + ((b[11] >>> 2) << shift) - bias) & 0xffff;
  s[7] = (s[6] + ((((b[11] << 4) | (b[12] >>> 4)) & SIX_BITS) << shift) - bias) & 0xffff;
  s[11] = (s[10] + ((((b[12] << 2) | (b[13] >>> 6)) & SIX_BITS) << shift) - bias) & 0xffff;
  s[15] = (s[14] + ((b[13] & SIX_BITS) << shift) - bias) & 0xffff;

  // Reverse the transform
  for (let i = 0; i < 16; i++) {
    if ((s[i] & 0x8000) !== 0) {
      s[i] &= 0x7fff;
    } else {
      s[i] = (~s[i]) & 0xffff;
    }
  }
}

// Unpack a 3-byte flat block into 4x4 identical pixels
// @param {Uint8Array} b - 3 input bytes
// @param {Uint16Array} s - 16 output pixels
function unpack3(b, s) {
  let value = (b[0] << 8) | b[1];

  // Reverse the transform
  if ((value & 0x8000) !== 0) {
    value &= 0x7fff;
  } else {
    value = (~value) & 0xffff;
  }

  s.fill(value);
}

// Compress data using B44/B44A
// @param {Uint8Array} data - Uncompressed pixel data (little-endian)
// @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
// @param {number} width - Block width
// @param {number} height - Block height
// @param {boolean} optimizeFlatFields - Use B44A (3-byte encoding for flat blocks)
// @returns {Uint8Array} - Compressed data
export function compressB44(data, channels, width, height, optimizeFlatFields = false) {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  // Build channel metadata
  const channelDataList = [];
  let tmpEndIndex = 0;

  for (const channel of channels) {
    const bytesPerSample =
      channel.sampleType === SampleType.F16 ? 2 : 4;

    const channelData = {
      tmpStartIndex: tmpEndIndex,
      tmpEndIndex: tmpEndIndex,
      sampleType: channel.sampleType,
      width,
      height,
    };

    tmpEndIndex += width * height * bytesPerSample;
    channelDataList.push(channelData);
  }

  // Reorganize input data by channel (from interleaved scanlines)
  const tmp = new Uint8Array(data.length);
  const inputView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let readOffset = 0;

  for (let y = 0; y < height; y++) {
    for (const channelData of channelDataList) {
      const bytesPerSample =
        channelData.sampleType === SampleType.F16 ? 2 : 4;
      const bytesPerLine = width * bytesPerSample;

      for (let i = 0; i < bytesPerLine; i++) {
        tmp[channelData.tmpEndIndex + i] = data[readOffset++];
      }
      channelData.tmpEndIndex += bytesPerLine;
    }
  }

  // Estimate output size and allocate
  const output = [];
  const blockBuf = new Uint8Array(14);

  for (const channelData of channelDataList) {
    // F32 and U32 are copied uncompressed
    if (channelData.sampleType !== SampleType.F16) {
      const byteCount =
        channelData.width * channelData.height * 4;
      for (let i = 0; i < byteCount; i++) {
        output.push(tmp[channelData.tmpStartIndex + i]);
      }
      continue;
    }

    // F16: compress in 4x4 blocks
    const xSampleCount = channelData.width;
    const ySampleCount = channelData.height;
    const xByteCount = xSampleCount * 2;
    const cdStart = channelData.tmpStartIndex;

    for (let y = 0; y < ySampleCount; y += BLOCK_SAMPLE_COUNT) {
      // Calculate row offsets
      let row0 = cdStart + y * xByteCount;
      let row1 = row0 + xByteCount;
      let row2 = row1 + xByteCount;
      let row3 = row2 + xByteCount;

      // Handle edge cases at bottom of image
      if (y + 3 >= ySampleCount) {
        if (y + 1 >= ySampleCount) row1 = row0;
        if (y + 2 >= ySampleCount) row2 = row1;
        row3 = row2;
      }

      for (let x = 0; x < xSampleCount; x += BLOCK_SAMPLE_COUNT) {
        const s = new Uint16Array(16);

        // Handle edge cases at right of image
        if (x + 3 >= xSampleCount) {
          const n = xSampleCount - x;
          for (let i = 0; i < BLOCK_SAMPLE_COUNT; i++) {
            const j = Math.min(i, n - 1) * 2;
            s[i + 0] = tmp[row0 + j] | (tmp[row0 + j + 1] << 8);
            s[i + 4] = tmp[row1 + j] | (tmp[row1 + j + 1] << 8);
            s[i + 8] = tmp[row2 + j] | (tmp[row2 + j + 1] << 8);
            s[i + 12] = tmp[row3 + j] | (tmp[row3 + j + 1] << 8);
          }
        } else {
          // Read 4 pixels from each row
          for (let i = 0; i < 4; i++) {
            s[i] = tmp[row0 + i * 2] | (tmp[row0 + i * 2 + 1] << 8);
            s[i + 4] = tmp[row1 + i * 2] | (tmp[row1 + i * 2 + 1] << 8);
            s[i + 8] = tmp[row2 + i * 2] | (tmp[row2 + i * 2 + 1] << 8);
            s[i + 12] = tmp[row3 + i * 2] | (tmp[row3 + i * 2 + 1] << 8);
          }
        }

        // Move to next block
        row0 += BLOCK_SAMPLE_COUNT * 2;
        row1 += BLOCK_SAMPLE_COUNT * 2;
        row2 += BLOCK_SAMPLE_COUNT * 2;
        row3 += BLOCK_SAMPLE_COUNT * 2;

        // Compress block
        const packedSize = pack(s, blockBuf, optimizeFlatFields);
        for (let i = 0; i < packedSize; i++) {
          output.push(blockBuf[i]);
        }
      }
    }
  }

  return new Uint8Array(output);
}

// Decompress B44/B44A data
// @param {Uint8Array} compressed - Compressed data
// @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
// @param {number} width - Block width
// @param {number} height - Block height
// @param {number} expectedSize - Expected uncompressed size in bytes
// @returns {Uint8Array} - Decompressed data
export function decompressB44(compressed, channels, width, height, expectedSize) {
  if (compressed.length === 0) {
    return new Uint8Array(0);
  }

  // Build channel metadata
  const channelDataList = [];
  let tmpIndex = 0;

  for (const channel of channels) {
    const bytesPerSample =
      channel.sampleType === SampleType.F16 ? 2 : 4;

    const channelData = {
      tmpStartIndex: tmpIndex,
      tmpEndIndex: tmpIndex,
      sampleType: channel.sampleType,
      width,
      height,
    };

    tmpIndex += width * height * bytesPerSample;
    channelDataList.push(channelData);
  }

  // Temporary buffer for decompressed channel data
  const tmp = new Uint8Array(expectedSize);
  let inIdx = 0;

  for (const channelData of channelDataList) {
    // F32 and U32 are copied directly
    if (channelData.sampleType !== SampleType.F16) {
      const byteCount = channelData.width * channelData.height * 4;

      if (inIdx + byteCount > compressed.length) {
        throw new Error('Not enough B44 data');
      }

      for (let i = 0; i < byteCount; i++) {
        tmp[channelData.tmpStartIndex + i] = compressed[inIdx++];
      }
      continue;
    }

    // F16: decompress 4x4 blocks
    const xSampleCount = channelData.width;
    const ySampleCount = channelData.height;
    const xByteCount = xSampleCount * 2;
    const cdStart = channelData.tmpStartIndex;

    for (let y = 0; y < ySampleCount; y += BLOCK_SAMPLE_COUNT) {
      let row0 = cdStart + y * xByteCount;
      let row1 = row0 + xByteCount;
      let row2 = row1 + xByteCount;
      let row3 = row2 + xByteCount;

      for (let x = 0; x < xSampleCount; x += BLOCK_SAMPLE_COUNT) {
        const s = new Uint16Array(16);

        if (inIdx + 3 > compressed.length) {
          throw new Error('Not enough B44 data');
        }

        // Check if this is a 3-byte or 14-byte block
        if (compressed[inIdx + 2] >= 13 << 2) {
          // 3-byte block (flat field)
          unpack3(compressed.subarray(inIdx, inIdx + 3), s);
          inIdx += 3;
        } else {
          // 14-byte block
          if (inIdx + 14 > compressed.length) {
            throw new Error('Not enough B44 data');
          }
          unpack14(compressed.subarray(inIdx, inIdx + 14), s);
          inIdx += 14;
        }

        // Calculate how many samples to copy (handle edge cases)
        const xRestingSampleCount = Math.min(BLOCK_SAMPLE_COUNT, xSampleCount - x);

        // Copy to output rows
        const copyRow = (srcOffset, dstOffset, count) => {
          for (let i = 0; i < count; i++) {
            tmp[dstOffset + i * 2] = s[srcOffset + i] & 0xff;
            tmp[dstOffset + i * 2 + 1] = (s[srcOffset + i] >>> 8) & 0xff;
          }
        };

        if (y + 3 < ySampleCount) {
          copyRow(0, row0, xRestingSampleCount);
          copyRow(4, row1, xRestingSampleCount);
          copyRow(8, row2, xRestingSampleCount);
          copyRow(12, row3, xRestingSampleCount);
        } else {
          copyRow(0, row0, xRestingSampleCount);
          if (y + 1 < ySampleCount) {
            copyRow(4, row1, xRestingSampleCount);
          }
          if (y + 2 < ySampleCount) {
            copyRow(8, row2, xRestingSampleCount);
          }
        }

        row0 += BLOCK_SAMPLE_COUNT * 2;
        row1 += BLOCK_SAMPLE_COUNT * 2;
        row2 += BLOCK_SAMPLE_COUNT * 2;
        row3 += BLOCK_SAMPLE_COUNT * 2;
      }
    }
  }

  // Interleave back to scanline order
  const output = new Uint8Array(expectedSize);
  let writeOffset = 0;

  for (let y = 0; y < height; y++) {
    for (const channelData of channelDataList) {
      const bytesPerSample =
        channelData.sampleType === SampleType.F16 ? 2 : 4;
      const bytesPerLine = width * bytesPerSample;

      for (let i = 0; i < bytesPerLine; i++) {
        output[writeOffset++] = tmp[channelData.tmpEndIndex + i];
      }
      channelData.tmpEndIndex += bytesPerLine;
    }
  }

  return output;
}
