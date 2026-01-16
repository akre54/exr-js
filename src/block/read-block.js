// Block Reading - read and decompress pixel blocks from EXR files

import { BinaryReader } from '../io/binary-reader.js';
import { Vec2, bytesPerSample, SampleType } from '../core/types.js';
import { decompressBlock } from '../compression/index.js';
import { halfToFloat } from '../lib/half.js';

// Read chunk info for a scanline block
// @typedef {Object} ScanlineChunkInfo
// @property {number} yCoordinate - Starting Y coordinate of the block
// @property {number} dataSize - Size of compressed data in bytes
// @property {Uint8Array} data - Compressed (or uncompressed) pixel data

// Read chunk info for a tile
// @typedef {Object} TileChunkInfo
// @property {number} tileX - Tile X index
// @property {number} tileY - Tile Y index
// @property {number} levelX - Mip/rip level X
// @property {number} levelY - Mip/rip level Y
// @property {number} dataSize - Size of compressed data in bytes
// @property {Uint8Array} data - Compressed (or uncompressed) pixel data

// Read a scanline chunk from the reader
// @param {BinaryReader} reader
// @returns {ScanlineChunkInfo}
export function readScanlineChunk(reader) {
  const yCoordinate = reader.readI32();
  const dataSize = reader.readI32();
  const data = reader.readBytesView(dataSize);

  return { yCoordinate, dataSize, data };
}

// Read a tile chunk from the reader
// @param {BinaryReader} reader
// @returns {TileChunkInfo}
export function readTileChunk(reader) {
  const tileX = reader.readI32();
  const tileY = reader.readI32();
  const levelX = reader.readI32();
  const levelY = reader.readI32();
  const dataSize = reader.readI32();
  const data = reader.readBytesView(dataSize);

  return { tileX, tileY, levelX, levelY, dataSize, data };
}

// Read a chunk from the reader (for multi-part files)
// @param {BinaryReader} reader
// @param {boolean} isTiled
// @returns {{ partNumber: number, chunk: ScanlineChunkInfo | TileChunkInfo }}
export function readMultiPartChunk(reader, isTiled) {
  const partNumber = reader.readU32();
  const chunk = isTiled ? readTileChunk(reader) : readScanlineChunk(reader);
  return { partNumber, chunk };
}

// Build compression context from channel list
// @param {import('../meta/attributes.js').ChannelList} channelList
// @param {number} width - Block width in pixels
// @param {number} height - Block height in scanlines
// @returns {import('../compression/index.js').CompressionContext}
export function buildCompressionContext(channelList, width, height) {
  return {
    channels: channelList.list.map((ch) => ({
      name: ch.name,
      sampleType: ch.sampleType,
      bytesPerSample: ch.bytesPerSample,
    })),
    width,
    height,
  };
}

// Calculate expected uncompressed size for a block
// @param {import('../meta/attributes.js').ChannelList} channelList
// @param {number} width - Block width in pixels
// @param {number} height - Block height in scanlines
// @returns {number}
export function calculateUncompressedSize(channelList, width, height) {
  const bytesPerPixel = channelList.bytesPerPixel;
  return width * height * bytesPerPixel;
}

// Decompress a chunk's data
// @param {Uint8Array} compressedData
// @param {number} compression - Compression method
// @param {import('../meta/attributes.js').ChannelList} channelList
// @param {number} width - Block width
// @param {number} height - Block height
// @returns {Uint8Array} - Decompressed data
export function decompressChunkData(compressedData, compression, channelList, width, height) {
  const expectedSize = calculateUncompressedSize(channelList, width, height);
  const context = buildCompressionContext(channelList, width, height);

  return decompressBlock(compression, compressedData, expectedSize, context);
}

// Reconstructed pixel data for a block
// @typedef {Object} ReconstructedPixels
// @property {Map<string, Float32Array|Uint32Array>} channels - Per-channel pixel data
// @property {number} width - Block width
// @property {number} height - Block height

// Reconstruct pixel data from decompressed block data
// EXR block data format:
// For each scanline in block:
//   For each channel (in alphabetical order):
//     For each pixel in scanline:
//       Sample bytes (1-4 bytes depending on type)
// @param {Uint8Array} decompressedData
// @param {import('../meta/attributes.js').ChannelList} channelList
// @param {number} width - Block width in pixels
// @param {number} height - Block height in scanlines
// @returns {ReconstructedPixels}
export function reconstructBlockPixels(decompressedData, channelList, width, height) {
  const channels = new Map();
  const view = new DataView(decompressedData.buffer, decompressedData.byteOffset, decompressedData.byteLength);

  // Initialize channel arrays
  const pixelCount = width * height;
  for (const ch of channelList.list) {
    // Always return Float32Array for ease of use (convert F16 on read)
    if (ch.sampleType === SampleType.U32) {
      channels.set(ch.name, new Uint32Array(pixelCount));
    } else {
      channels.set(ch.name, new Float32Array(pixelCount));
    }
  }

  let offset = 0;

  // Read data: for each scanline, for each channel, for each pixel
  for (let y = 0; y < height; y++) {
    for (const ch of channelList.list) {
      const channelData = channels.get(ch.name);

      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;

        switch (ch.sampleType) {
          case SampleType.F16:
            // Read 16-bit half and convert to float
            channelData[pixelIndex] = halfToFloat(view.getUint16(offset, true));
            offset += 2;
            break;

          case SampleType.F32:
            channelData[pixelIndex] = view.getFloat32(offset, true);
            offset += 4;
            break;

          case SampleType.U32:
            channelData[pixelIndex] = view.getUint32(offset, true);
            offset += 4;
            break;
        }
      }
    }
  }

  return { channels, width, height };
}

// Read all blocks for a layer into a single pixel buffer
// @param {BinaryReader} reader
// @param {import('../meta/read-header.js').ParsedHeader} header
// @param {bigint[]} offsets - Chunk offsets
// @param {boolean} isMultiPart
// @param {number} layerIndex - Layer index for multi-part files
// @returns {Map<string, Float32Array|Uint32Array>} - Per-channel pixel data for entire layer
export function readLayerPixels(reader, header, offsets, isMultiPart, layerIndex = 0) {
  const channelList = header.channels;
  const dataWindow = header.dataWindow;
  const width = dataWindow.size.x;
  const height = dataWindow.size.y;
  const compression = header.compression;
  const isTiled = header.isTiled;
  const linesPerBlock = header.scanLinesPerBlock;

  // Initialize output channel arrays
  const pixelCount = width * height;
  const outputChannels = new Map();

  for (const ch of channelList.list) {
    if (ch.sampleType === SampleType.U32) {
      outputChannels.set(ch.name, new Uint32Array(pixelCount));
    } else {
      outputChannels.set(ch.name, new Float32Array(pixelCount));
    }
  }

  // Read each chunk
  for (const offset of offsets) {
    reader.setPosition(Number(offset));

    let chunk;
    let partNumber = layerIndex;

    if (isMultiPart) {
      const result = readMultiPartChunk(reader, isTiled);
      partNumber = result.partNumber;
      chunk = result.chunk;

      // Skip chunks from other layers
      if (partNumber !== layerIndex) {
        continue;
      }
    } else {
      chunk = isTiled ? readTileChunk(reader) : readScanlineChunk(reader);
    }

    // Calculate block dimensions
    let blockX, blockY, blockWidth, blockHeight;

    if (isTiled) {
      const tileSize = header.tiles.tileSize;
      blockX = chunk.tileX * tileSize.x;
      blockY = chunk.tileY * tileSize.y;
      blockWidth = Math.min(tileSize.x, width - blockX);
      blockHeight = Math.min(tileSize.y, height - blockY);
    } else {
      blockX = 0;
      blockY = chunk.yCoordinate - dataWindow.position.y;
      blockWidth = width;
      blockHeight = Math.min(linesPerBlock, height - blockY);
    }

    // Decompress and reconstruct
    const decompressed = decompressChunkData(chunk.data, compression, channelList, blockWidth, blockHeight);
    const pixels = reconstructBlockPixels(decompressed, channelList, blockWidth, blockHeight);

    // Copy to output arrays
    for (const [channelName, channelData] of pixels.channels) {
      const outputData = outputChannels.get(channelName);

      for (let localY = 0; localY < blockHeight; localY++) {
        const globalY = blockY + localY;
        if (globalY >= height) break;

        for (let localX = 0; localX < blockWidth; localX++) {
          const globalX = blockX + localX;
          if (globalX >= width) break;

          const localIndex = localY * blockWidth + localX;
          const globalIndex = globalY * width + globalX;
          outputData[globalIndex] = channelData[localIndex];
        }
      }
    }
  }

  return outputChannels;
}

// Convert separate channel data to interleaved RGBA
// @param {Map<string, Float32Array>} channels
// @param {number} width
// @param {number} height
// @returns {Float32Array} - Interleaved RGBA data
export function channelsToRgba(channels, width, height) {
  const pixelCount = width * height;
  const rgba = new Float32Array(pixelCount * 4);

  // Find channels (case-insensitive, try common names)
  const rChannel = channels.get('R') || channels.get('r') || channels.get('red');
  const gChannel = channels.get('G') || channels.get('g') || channels.get('green');
  const bChannel = channels.get('B') || channels.get('b') || channels.get('blue');
  const aChannel = channels.get('A') || channels.get('a') || channels.get('alpha');

  for (let i = 0; i < pixelCount; i++) {
    rgba[i * 4 + 0] = rChannel ? rChannel[i] : 0;
    rgba[i * 4 + 1] = gChannel ? gChannel[i] : 0;
    rgba[i * 4 + 2] = bChannel ? bChannel[i] : 0;
    rgba[i * 4 + 3] = aChannel ? aChannel[i] : 1;
  }

  return rgba;
}

// Convert separate channel data to interleaved RGB
// @param {Map<string, Float32Array>} channels
// @param {number} width
// @param {number} height
// @returns {Float32Array} - Interleaved RGB data
export function channelsToRgb(channels, width, height) {
  const pixelCount = width * height;
  const rgb = new Float32Array(pixelCount * 3);

  const rChannel = channels.get('R') || channels.get('r') || channels.get('red');
  const gChannel = channels.get('G') || channels.get('g') || channels.get('green');
  const bChannel = channels.get('B') || channels.get('b') || channels.get('blue');

  for (let i = 0; i < pixelCount; i++) {
    rgb[i * 3 + 0] = rChannel ? rChannel[i] : 0;
    rgb[i * 3 + 1] = gChannel ? gChannel[i] : 0;
    rgb[i * 3 + 2] = bChannel ? bChannel[i] : 0;
  }

  return rgb;
}
