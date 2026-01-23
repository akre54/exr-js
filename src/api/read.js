// High-level EXR Reading API
// Simple functions and EXRReader class for reading EXR files.

import {
  channelsToRgb,
  channelsToRgba,
  readLayerPixels,
} from '../block/read-block.js'
import { BinaryReader } from '../io/binary-reader.js'
import { readFromFile } from '../io/platform.js'
import {
  calculateChunkCount,
  readMeta,
  readOffsetTable,
} from '../meta/read-header.js'

// Result from reading an EXR file
// @typedef {Object} EXRReadResult
// @property {number} width - Image width in pixels
// @property {number} height - Image height in pixels
// @property {Float32Array} pixels - Interleaved pixel data (RGBA or RGB)
// @property {import('../core/types.js').IntegerBounds} dataWindow - Data window bounds
// @property {import('../core/types.js').IntegerBounds} displayWindow - Display window bounds
// @property {number} compression - Compression method used
// @property {Map<string, any>} attributes - Custom attributes

// Read an EXR file and return RGBA pixel data
// @param {string|ArrayBuffer|Uint8Array} input - File path (Node.js) or buffer
// @returns {Promise<EXRReadResult>}
// @example
// // Node.js
// const { width, height, pixels } = await readRgbaFile('image.exr');
// @example
// // Browser
// const buffer = await fetch('image.exr').then(r => r.arrayBuffer());
// const { width, height, pixels } = await readRgbaFile(buffer);
export async function readRgbaFile(input) {
  const buffer = await resolveInput(input)
  const reader = new EXRReader(buffer)

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

// Read an EXR file and return RGB pixel data (no alpha)
// @param {string|ArrayBuffer|Uint8Array} input - File path (Node.js) or buffer
// @returns {Promise<EXRReadResult>}
export async function readRgbFile(input) {
  const buffer = await resolveInput(input)
  const reader = new EXRReader(buffer)

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

// Resolve input to ArrayBuffer
// @param {string|ArrayBuffer|Uint8Array} input
// @returns {Promise<ArrayBuffer>}
async function resolveInput(input) {
  if (typeof input === 'string') {
    return await readFromFile(input)
  }
  if (input instanceof Uint8Array) {
    return input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    )
  }
  return input
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

  // Create an EXRReader from a file path (Node.js only)
  // @param {string} path
  // @returns {Promise<EXRReader>}
  static async fromFile(path) {
    const buffer = await readFromFile(path)
    return new EXRReader(buffer)
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
