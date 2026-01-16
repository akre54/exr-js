// PIZ compression for EXR
// PIZ compression uses wavelet transform + Huffman coding.
// Best for noisy/photographic images, typically 35-55% of uncompressed size.
// Algorithm:
// 1. Convert to u16 values (treating f16 as raw bits, f32/u32 as two u16s)
// 2. Build bitmap of used values
// 3. Create lookup tables to compress value range
// 4. Apply Haar wavelet transform to each channel
// 5. Huffman encode the result

import { SampleType } from '../../core/types.js';
import { waveletEncode, waveletDecode } from './wavelet.js';
import { huffmanCompress, huffmanDecompress } from './huffman.js';

const U16_RANGE = 1 << 16; // 65536
const BITMAP_SIZE = U16_RANGE >> 3; // 8192 bytes

// Build a bitmap of which u16 values are present in the data
// @param {Uint16Array} data
// @returns {{minNonZero: number, maxNonZero: number, bitmap: Uint8Array}}
function bitmapFromData(data) {
  const bitmap = new Uint8Array(BITMAP_SIZE);

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    bitmap[value >> 3] |= 1 << (value & 7);
  }

  // Zero is not explicitly stored in bitmap; we assume data always contains zeros
  bitmap[0] &= ~1;

  // Find min and max non-zero indices in bitmap
  let minNonZero = -1;
  let maxNonZero = -1;

  for (let i = 0; i < BITMAP_SIZE; i++) {
    if (bitmap[i] !== 0) {
      if (minNonZero === -1) minNonZero = i;
      maxNonZero = i;
    }
  }

  if (minNonZero === -1) {
    minNonZero = 0;
    maxNonZero = 0;
  }

  return { minNonZero, maxNonZero, bitmap };
}

// Build forward lookup table from bitmap (compress value range)
// @param {Uint8Array} bitmap
// @returns {{maxValue: number, table: Uint16Array}}
function forwardLookupTableFromBitmap(bitmap) {
  const table = new Uint16Array(U16_RANGE);
  let count = 0;

  for (let index = 0; index < U16_RANGE; index++) {
    if (index === 0 || (bitmap[index >> 3] & (1 << (index & 7))) !== 0) {
      table[index] = count;
      count++;
    }
  }

  return { maxValue: count - 1, table };
}

// Build reverse lookup table from bitmap (expand value range)
// @param {Uint8Array} bitmap
// @returns {{maxValue: number, table: Uint16Array}}
function reverseLookupTableFromBitmap(bitmap) {
  const table = [];

  for (let index = 0; index < U16_RANGE; index++) {
    if (index === 0 || (bitmap[index >> 3] & (1 << (index & 7))) !== 0) {
      table.push(index);
    }
  }

  const maxValue = table.length - 1;

  // Pad to full u16 range
  while (table.length < U16_RANGE) {
    table.push(0);
  }

  return { maxValue, table: new Uint16Array(table) };
}

// Apply a lookup table to transform data values
// @param {Uint16Array} data
// @param {Uint16Array} table
function applyLookupTable(data, table) {
  for (let i = 0; i < data.length; i++) {
    data[i] = table[data[i]];
  }
}

// Channel metadata for PIZ compression
class ChannelData {
  constructor(tmpStartIndex, resolution, ySampling, samplesPerPixel) {
    this.tmpStartIndex = tmpStartIndex;
    this.tmpEndIndex = tmpStartIndex;
    this.resolution = resolution; // { x, y }
    this.ySampling = ySampling;
    this.samplesPerPixel = samplesPerPixel; // 1 for f16, 2 for f32/u32
  }
}

// Compress data using PIZ
// @param {Uint8Array} data - Uncompressed pixel data (little-endian)
// @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
// @param {number} width - Block width
// @param {number} height - Block height
// @returns {Uint8Array} - Compressed data
export function compressPIZ(data, channels, width, height) {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  // Convert bytes to u16 array
  const u16Count = data.length / 2;
  const tmp = new Uint16Array(u16Count);

  // Build channel metadata and read data into tmp buffer
  const channelDataList = [];
  let tmpEndIndex = 0;

  for (const channel of channels) {
    // Calculate samples per pixel (f16 = 1, f32/u32 = 2 u16s)
    const samplesPerPixel =
      channel.sampleType === SampleType.F16 ? 1 : 2;

    const channelData = new ChannelData(
      tmpEndIndex,
      { x: width, y: height },
      1, // sampling (TODO: support subsampling)
      samplesPerPixel
    );

    tmpEndIndex += width * height * samplesPerPixel;
    channelDataList.push(channelData);
  }

  // Read input bytes into tmp, reordering by channel
  const inputView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let readOffset = 0;

  for (let y = 0; y < height; y++) {
    for (const channelData of channelDataList) {
      const u16sPerLine = channelData.resolution.x * channelData.samplesPerPixel;
      const target = tmp.subarray(
        channelData.tmpEndIndex,
        channelData.tmpEndIndex + u16sPerLine
      );

      for (let i = 0; i < u16sPerLine; i++) {
        target[i] = inputView.getUint16(readOffset, true); // little-endian
        readOffset += 2;
      }

      channelData.tmpEndIndex += u16sPerLine;
    }
  }

  // Build bitmap and lookup table
  const { minNonZero, maxNonZero, bitmap } = bitmapFromData(tmp);
  const { maxValue, table } = forwardLookupTableFromBitmap(bitmap);

  // Apply lookup table to compress value range
  applyLookupTable(tmp, table);

  // Apply wavelet transform to each channel
  for (const channelData of channelDataList) {
    for (let offset = 0; offset < channelData.samplesPerPixel; offset++) {
      // Get the slice for this channel
      const u16Count = channelData.resolution.x * channelData.resolution.y * channelData.samplesPerPixel;
      const channelStart = channelData.tmpStartIndex;

      waveletEncode(
        tmp.subarray(channelStart + offset, channelStart + u16Count),
        channelData.resolution.x,
        channelData.resolution.y,
        channelData.samplesPerPixel,
        channelData.resolution.x * channelData.samplesPerPixel,
        maxValue
      );
    }
  }

  // Huffman compress
  const huffmanCompressed = huffmanCompress(tmp);

  // Build output
  // Format: [minNonZero: u16][maxNonZero: u16][bitmap...][huffmanLength: i32][huffmanData...]
  const output = new Uint8Array(
    4 + // minNonZero + maxNonZero
      (minNonZero <= maxNonZero ? maxNonZero - minNonZero + 1 : 0) +
      4 + // huffman length
      huffmanCompressed.length
  );

  let writeOffset = 0;

  // Write minNonZero (u16 LE)
  output[writeOffset++] = minNonZero & 0xff;
  output[writeOffset++] = (minNonZero >> 8) & 0xff;

  // Write maxNonZero (u16 LE)
  output[writeOffset++] = maxNonZero & 0xff;
  output[writeOffset++] = (maxNonZero >> 8) & 0xff;

  // Write bitmap slice
  if (minNonZero <= maxNonZero) {
    for (let i = minNonZero; i <= maxNonZero; i++) {
      output[writeOffset++] = bitmap[i];
    }
  }

  // Write huffman length (i32 LE)
  const huffmanLen = huffmanCompressed.length;
  output[writeOffset++] = huffmanLen & 0xff;
  output[writeOffset++] = (huffmanLen >> 8) & 0xff;
  output[writeOffset++] = (huffmanLen >> 16) & 0xff;
  output[writeOffset++] = (huffmanLen >> 24) & 0xff;

  // Write huffman data
  output.set(huffmanCompressed, writeOffset);

  return output;
}

// Decompress PIZ data
// @param {Uint8Array} compressed - Compressed data
// @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
// @param {number} width - Block width
// @param {number} height - Block height
// @param {number} expectedSize - Expected uncompressed size in bytes
// @returns {Uint8Array} - Decompressed data
export function decompressPIZ(compressed, channels, width, height, expectedSize) {
  if (compressed.length === 0) {
    return new Uint8Array(0);
  }

  const expectedU16Count = expectedSize / 2;
  let readOffset = 0;

  // Read minNonZero (u16 LE)
  const minNonZero = compressed[readOffset] | (compressed[readOffset + 1] << 8);
  readOffset += 2;

  // Read maxNonZero (u16 LE)
  const maxNonZero = compressed[readOffset] | (compressed[readOffset + 1] << 8);
  readOffset += 2;

  if (maxNonZero >= BITMAP_SIZE || minNonZero >= BITMAP_SIZE) {
    throw new Error('Invalid PIZ compression data');
  }

  // Read bitmap
  const bitmap = new Uint8Array(BITMAP_SIZE);
  if (minNonZero <= maxNonZero) {
    for (let i = minNonZero; i <= maxNonZero; i++) {
      bitmap[i] = compressed[readOffset++];
    }
  }

  // Build reverse lookup table
  const { maxValue, table: lookupTable } = reverseLookupTableFromBitmap(bitmap);

  // Read huffman length (i32 LE)
  const huffmanLen =
    compressed[readOffset] |
    (compressed[readOffset + 1] << 8) |
    (compressed[readOffset + 2] << 16) |
    (compressed[readOffset + 3] << 24);
  readOffset += 4;

  // Decompress huffman
  const huffmanData = compressed.subarray(readOffset, readOffset + huffmanLen);
  const tmp = huffmanDecompress(huffmanData, expectedU16Count);

  // Build channel metadata
  const channelDataList = [];
  let tmpIndex = 0;

  for (const channel of channels) {
    const samplesPerPixel =
      channel.sampleType === SampleType.F16 ? 1 : 2;

    const channelData = new ChannelData(
      tmpIndex,
      { x: width, y: height },
      1,
      samplesPerPixel
    );

    tmpIndex += width * height * samplesPerPixel;
    channelDataList.push(channelData);
  }

  // Apply inverse wavelet transform to each channel
  for (const channelData of channelDataList) {
    const u16Count = channelData.resolution.x * channelData.resolution.y * channelData.samplesPerPixel;

    for (let offset = 0; offset < channelData.samplesPerPixel; offset++) {
      waveletDecode(
        tmp.subarray(channelData.tmpStartIndex + offset, channelData.tmpStartIndex + u16Count),
        channelData.resolution.x,
        channelData.resolution.y,
        channelData.samplesPerPixel,
        channelData.resolution.x * channelData.samplesPerPixel,
        maxValue
      );
    }
  }

  // Apply reverse lookup table to expand value range
  applyLookupTable(tmp, lookupTable);

  // Convert back to bytes
  const output = new Uint8Array(expectedSize);
  const outputView = new DataView(output.buffer);
  let writeOffset = 0;

  for (let y = 0; y < height; y++) {
    for (const channelData of channelDataList) {
      const u16sPerLine = channelData.resolution.x * channelData.samplesPerPixel;

      for (let i = 0; i < u16sPerLine; i++) {
        outputView.setUint16(writeOffset, tmp[channelData.tmpEndIndex + i], true);
        writeOffset += 2;
      }

      channelData.tmpEndIndex += u16sPerLine;
    }
  }

  return output;
}
