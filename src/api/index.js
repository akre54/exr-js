// Public API for exr-js

import { Vec2, IntegerBounds, SampleType, Compression, LineOrder, Blocks } from '../core/types.js';
import { Image } from '../image/image.js';
import { Layer } from '../image/layer.js';
import { SpecificChannels, AnyChannels, AnyChannel, FlatSamples } from '../image/channels.js';
import { Encoding, LayerAttributes, ImageAttributes } from '../meta/header.js';
import { ChannelDescription } from '../meta/attributes.js';

// Re-export core types
export { Vec2, IntegerBounds, SampleType, Compression, LineOrder, Blocks } from '../core/types.js';
export { Image } from '../image/image.js';
export { Layer } from '../image/layer.js';
export { SpecificChannels, AnyChannels, AnyChannel, FlatSamples } from '../image/channels.js';
export { Encoding, LayerAttributes, ImageAttributes } from '../meta/header.js';
export { ChannelDescription, ChannelList } from '../meta/attributes.js';

// Reading API
export { readRgbaFile, readRgbFile, EXRReader } from './read.js';

// Write an RGBA image to a file
// @param {string|null} path - File path (Node) or null for ArrayBuffer
// @param {number} width
// @param {number} height
// @param {Function|Float32Array} pixels - (index) => [r,g,b,a] or interleaved Float32Array
// @param {Encoding} encoding
// @returns {Promise<ArrayBuffer|void>}
export async function writeRgbaFile(path, width, height, pixels, encoding = Encoding.FAST_LOSSLESS) {
  const channels = SpecificChannels.rgba(pixels);
  const image = Image.fromChannels(new Vec2(width, height), channels, encoding);

  if (path) {
    return image.write().toFile(path);
  }
  return image.write().toArrayBuffer();
}

// Write an RGB image to a file
// @param {string|null} path - File path (Node) or null for ArrayBuffer
// @param {number} width
// @param {number} height
// @param {Function|Float32Array} pixels - (index) => [r,g,b] or interleaved Float32Array
// @param {Encoding} encoding
// @returns {Promise<ArrayBuffer|void>}
export async function writeRgbFile(path, width, height, pixels, encoding = Encoding.FAST_LOSSLESS) {
  const channels = SpecificChannels.rgb(pixels);
  const image = Image.fromChannels(new Vec2(width, height), channels, encoding);

  if (path) {
    return image.write().toFile(path);
  }
  return image.write().toArrayBuffer();
}

// High-level EXR writer for render passes
export class EXRWriter {
  // @param {number} width
// @param {number} height
  constructor(width, height) {
    this.width = width;
    this.height = height;
    // @type {LayerBuilder[]}
    this._layers = [];
  }

  // Add a render pass layer
// @param {string} name - Layer name
// @param {object} options
// @returns {LayerBuilder}
  addLayer(name, options = {}) {
    const builder = new LayerBuilder(this, name, options);
    return builder;
  }

  // Build and write the EXR
// @param {string|null} filenameOrNull - Filename or null for ArrayBuffer
// @returns {Promise<ArrayBuffer|void>}
  async write(filenameOrNull = null) {
    const image = this._buildImage();

    if (filenameOrNull) {
      return image.write().toFile(filenameOrNull);
    }
    return image.write().toArrayBuffer();
  }

  // Build the Image object
// @returns {Image}
  _buildImage() {
    const size = new Vec2(this.width, this.height);
    const layers = this._layers.map((builder) => builder._build(size));

    if (layers.length === 1) {
      return Image.fromLayer(layers[0]);
    }

    const displayWindow = IntegerBounds.fromDimensions(this.width, this.height);
    return new Image(new ImageAttributes(displayWindow), layers);
  }
}

// Builder for a single layer
class LayerBuilder {
  // @param {EXRWriter} writer
// @param {string} name
// @param {object} options
  constructor(writer, name, options) {
    this._writer = writer;
    this._name = name;
    this._encoding = options.encoding || Encoding.FAST_LOSSLESS;
    this._channelDescriptions = [];
    this._pixelSource = null;
    this._isRgba = false;
    this._isRgb = false;
    this._sampleType = SampleType.F32;
  }

  // Set RGBA channels
// @param {Float32Array|Function} data
// @returns {LayerBuilder}
  rgba(data) {
    this._isRgba = true;
    this._pixelSource = data;
    return this;
  }

  // Set RGB channels
// @param {Float32Array|Function} data
// @returns {LayerBuilder}
  rgb(data) {
    this._isRgb = true;
    this._pixelSource = data;
    return this;
  }

  // Add a single channel
// @param {string} name - Channel name
// @param {string} sampleType - Sample type (SampleType.F16, F32, or U32)
// @param {Float32Array|Uint32Array|Uint16Array} data - Sample data
// @returns {LayerBuilder}
  channel(name, sampleType, data) {
    this._channelDescriptions.push({ name, sampleType, data });
    return this;
  }

  // Set compression method
// @param {number} compression - Compression type from Compression enum
// @returns {LayerBuilder}
  compression(compression) {
    this._encoding = new Encoding(compression, this._encoding.blocks, this._encoding.lineOrder);
    return this;
  }

  // Use tiled storage
// @param {number} tileWidth - Tile width (default 64)
// @param {number} tileHeight - Tile height (default 64)
// @returns {LayerBuilder}
  tiled(tileWidth = 64, tileHeight = 64) {
    this._encoding = new Encoding(
      this._encoding.compression,
      Blocks.Tiles(new Vec2(tileWidth, tileHeight)),
      LineOrder.Unspecified
    );
    return this;
  }

  // Use scanline storage
// @returns {LayerBuilder}
  scanlines() {
    this._encoding = new Encoding(
      this._encoding.compression,
      Blocks.ScanLines,
      LineOrder.Increasing
    );
    return this;
  }

  // Set sample type for RGB/RGBA channels
// @param {string} sampleType - SampleType.F16, F32, or U32
// @returns {LayerBuilder}
  sampleType(sampleType) {
    this._sampleType = sampleType;
    return this;
  }

  // Complete this layer and return to writer
// @returns {EXRWriter}
  end() {
    this._writer._layers.push(this);
    return this._writer;
  }

  // Build the Layer object
// @param {Vec2} size
// @returns {Layer}
  _build(size) {
    let channelData;

    if (this._isRgba) {
      channelData = SpecificChannels.rgba(this._pixelSource, this._sampleType);
    } else if (this._isRgb) {
      channelData = SpecificChannels.rgb(this._pixelSource, this._sampleType);
    } else {
      // Build from individual channels
      const channels = this._channelDescriptions.map(({ name, sampleType, data }) => {
        let samples;
        if (sampleType === SampleType.F16 || data instanceof Uint16Array) {
          samples = FlatSamples.f16(data);
        } else if (sampleType === SampleType.U32 || data instanceof Uint32Array) {
          samples = FlatSamples.u32(data);
        } else {
          samples = FlatSamples.f32(data);
        }
        return new AnyChannel(name, samples);
      });
      channelData = new AnyChannels(channels);
    }

    return new Layer(size, LayerAttributes.named(this._name), this._encoding, channelData);
  }
}
