// High-level EXR Reading API
// Simple functions and EXRReader class for reading EXR files.

import { BinaryReader } from '../io/binary-reader.js';
import { readMeta, calculateChunkCount, readOffsetTable } from '../meta/read-header.js';
import { readLayerPixels, channelsToRgba, channelsToRgb } from '../block/read-block.js';

// Result from decoding an EXR buffer
// @typedef {Object} EXRDecodeResult
// @property {number} width - Image width in pixels
// @property {number} height - Image height in pixels
// @property {Float32Array} pixels - Interleaved pixel data (RGBA or RGB)
// @property {import('../core/types.js').IntegerBounds} dataWindow - Data window bounds
// @property {import('../core/types.js').IntegerBounds} displayWindow - Display window bounds
// @property {number} compression - Compression method used
// @property {Map<string, any>} attributes - Custom attributes

// Resolve input to ArrayBuffer
// @param {ArrayBuffer|Uint8Array} input
// @returns {ArrayBuffer}
function toArrayBuffer(input) {
  if (input instanceof Uint8Array) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }
  return input;
}

// Decode an EXR buffer and return RGBA pixel data
// @param {ArrayBuffer|Uint8Array} buffer - EXR file data
// @returns {EXRDecodeResult}
// @example
// const buffer = fs.readFileSync('image.exr');
// const { width, height, pixels } = decodeRgba(buffer);
export function decodeRgba(buffer) {
  const reader = new EXRReader(toArrayBuffer(buffer));

  const width = reader.getWidth()
  const height = reader.getHeight()
  const pixels = reader.readRgba()

  return {
    width,
    height,
    pixels,
    dataWindow: reader.getDataWindow(),
    displayWindow: reader.getDisplayWindow(),
    compression: reader.getCompression(),
    attributes: reader.getAttributes(),
  }
}

// Decode an EXR buffer and return RGB pixel data (no alpha)
// @param {ArrayBuffer|Uint8Array} buffer - EXR file data
// @returns {EXRDecodeResult}
export function decodeRgb(buffer) {
  const reader = new EXRReader(toArrayBuffer(buffer));

  const width = reader.getWidth()
  const height = reader.getHeight()
  const pixels = reader.readRgb()

  return {
    width,
    height,
    pixels,
    dataWindow: reader.getDataWindow(),
    displayWindow: reader.getDisplayWindow(),
    compression: reader.getCompression(),
    attributes: reader.getAttributes(),
  }
}

// EXR Reader class for detailed access to EXR file contents
export class EXRReader {
  // Create an EXRReader from an ArrayBuffer
  // @param {ArrayBuffer|Uint8Array} buffer
  constructor(buffer) {
    this._reader = new BinaryReader(buffer)
    this._meta = readMeta(this._reader)
    this._offsetTables = []
    this._pixelCache = new Map() // Cache layer pixel data

    // Read offset tables for each header
    for (let i = 0; i < this._meta.headers.length; i++) {
      const header = this._meta.headers[i]
      const chunkCount = calculateChunkCount(header)
      const offsets = readOffsetTable(this._reader, chunkCount)
      this._offsetTables.push(offsets)
    }
  }

  // Create an EXRReader from an ArrayBuffer
  // @param {ArrayBuffer} buffer
  // @returns {EXRReader}
  static fromArrayBuffer(buffer) {
    return new EXRReader(buffer)
  }

  // ==================== Metadata Access ====================

  // Get the number of layers in the file
  // @returns {number}
  getLayerCount() {
    return this._meta.headers.length
  }

  // Get layer names
  // @returns {string[]}
  getLayerNames() {
    return this._meta.headers.map((h, i) => h.name || `layer${i}`)
  }

  // Get header for a layer
  // @param {number} layerIndex
  // @returns {import('../meta/read-header.js').ParsedHeader}
  getHeader(layerIndex = 0) {
    return this._meta.headers[layerIndex]
  }

  // Get channel names for a layer
  // @param {number} layerIndex
  // @returns {string[]}
  getChannelNames(layerIndex = 0) {
    const header = this._meta.headers[layerIndex]
    return header.channels.list.map((ch) => ch.name)
  }

  // Get image width for a layer
  // @param {number} layerIndex
  // @returns {number}
  getWidth(layerIndex = 0) {
    return this._meta.headers[layerIndex].width
  }

  // Get image height for a layer
  // @param {number} layerIndex
  // @returns {number}
  getHeight(layerIndex = 0) {
    return this._meta.headers[layerIndex].height
  }

  // Get data window for a layer
  // @param {number} layerIndex
  // @returns {import('../core/types.js').IntegerBounds}
  getDataWindow(layerIndex = 0) {
    return this._meta.headers[layerIndex].dataWindow
  }

  // Get display window for a layer
  // @param {number} layerIndex
  // @returns {import('../core/types.js').IntegerBounds}
  getDisplayWindow(layerIndex = 0) {
    return this._meta.headers[layerIndex].displayWindow
  }

  // Get compression method for a layer
  // @param {number} layerIndex
  // @returns {number}
  getCompression(layerIndex = 0) {
    return this._meta.headers[layerIndex].compression
  }

  // Get custom attributes for a layer
  // @param {number} layerIndex
  // @returns {Map<string, any>}
  getAttributes(layerIndex = 0) {
    return this._meta.headers[layerIndex].customAttributes
  }

  // Check if the file is multi-part
  // @returns {boolean}
  isMultiPart() {
    return this._meta.isMultiPart
  }

  // Check if a layer is tiled
  // @param {number} layerIndex
  // @returns {boolean}
  isTiled(layerIndex = 0) {
    return this._meta.headers[layerIndex].isTiled
  }

  // ==================== Pixel Data Reading ====================

  // Read all channels from a layer
  // @param {number} layerIndex
  // @returns {Map<string, Float32Array|Uint32Array>}
  readLayer(layerIndex = 0) {
    // Check cache
    const cacheKey = `layer_${layerIndex}`
    if (this._pixelCache.has(cacheKey)) {
      return this._pixelCache.get(cacheKey)
    }

    const header = this._meta.headers[layerIndex]
    const offsets = this._offsetTables[layerIndex]

    const channels = readLayerPixels(
      this._reader,
      header,
      offsets,
      this._meta.isMultiPart,
      layerIndex,
    )

    // Cache the result
    this._pixelCache.set(cacheKey, channels)
    return channels
  }

  // Read a single channel from a layer
  // @param {string} channelName
  // @param {number} layerIndex
  // @returns {Float32Array|Uint32Array|null}
  readChannel(channelName, layerIndex = 0) {
    const channels = this.readLayer(layerIndex)
    return channels.get(channelName) || null
  }

  // Read interleaved RGBA data from a layer
  // @param {number} layerIndex
  // @returns {Float32Array}
  readRgba(layerIndex = 0) {
    const channels = this.readLayer(layerIndex)
    const header = this._meta.headers[layerIndex]
    return channelsToRgba(channels, header.width, header.height)
  }

  // Read interleaved RGB data from a layer
  // @param {number} layerIndex
  // @returns {Float32Array}
  readRgb(layerIndex = 0) {
    const channels = this.readLayer(layerIndex)
    const header = this._meta.headers[layerIndex]
    return channelsToRgb(channels, header.width, header.height)
  }

  // Clear the pixel cache to free memory
  clearCache() {
    this._pixelCache.clear()
  }
}
