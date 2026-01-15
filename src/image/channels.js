/**
 * Channel data structures for EXR images
 */

import { Vec2, SampleType, bytesPerSample } from '../core/types.js';
import { ChannelDescription, ChannelList } from '../meta/attributes.js';
import { floatToHalf } from '../lib/half.js';

/**
 * Flat sample storage (one value per pixel per channel)
 */
export class FlatSamples {
  /**
   * @param {string} sampleType
   * @param {Float32Array|Uint32Array|Uint16Array} data
   */
  constructor(sampleType, data) {
    this.sampleType = sampleType;
    this.data = data;
  }

  /**
   * Create F16 samples
   * @param {Uint16Array} data - Half-precision data as raw bits
   */
  static f16(data) {
    return new FlatSamples(SampleType.F16, data);
  }

  /**
   * Create F32 samples
   * @param {Float32Array} data
   */
  static f32(data) {
    return new FlatSamples(SampleType.F32, data);
  }

  /**
   * Create U32 samples
   * @param {Uint32Array} data
   */
  static u32(data) {
    return new FlatSamples(SampleType.U32, data);
  }

  get length() {
    return this.data.length;
  }

  /**
   * Get value at index
   * @param {number} index
   * @returns {number}
   */
  valueAt(index) {
    return this.data[index];
  }

  /**
   * Get the raw bytes for a sample at the given index (little-endian)
   * @param {number} index
   * @returns {Uint8Array}
   */
  getBytesAt(index) {
    const bytes = bytesPerSample(this.sampleType);
    const result = new Uint8Array(bytes);
    const view = new DataView(result.buffer);

    switch (this.sampleType) {
      case SampleType.F16:
        view.setUint16(0, this.data[index], true);
        break;
      case SampleType.F32:
        view.setFloat32(0, this.data[index], true);
        break;
      case SampleType.U32:
        view.setUint32(0, this.data[index], true);
        break;
    }

    return result;
  }
}

/**
 * Single channel with name and sample data
 */
export class AnyChannel {
  /**
   * @param {string} name
   * @param {FlatSamples} samples
   * @param {boolean} quantizeLinearly
   * @param {Vec2} sampling
   */
  constructor(name, samples, quantizeLinearly = null, sampling = new Vec2(1, 1)) {
    this.name = name;
    this.samples = samples;
    this.quantizeLinearly = quantizeLinearly ?? !['R', 'G', 'B', 'Y', 'L'].includes(name);
    this.sampling = sampling;
  }

  /**
   * Get channel description
   * @returns {ChannelDescription}
   */
  toDescription() {
    return new ChannelDescription(this.name, this.samples.sampleType, this.quantizeLinearly, this.sampling);
  }
}

/**
 * Dynamic channel collection
 */
export class AnyChannels {
  /**
   * @param {AnyChannel[]} list
   */
  constructor(list) {
    // Sort alphabetically
    this.list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    this._channelMap = new Map(this.list.map((ch) => [ch.name, ch]));
  }

  /**
   * Get the channel list for metadata
   * @returns {ChannelList}
   */
  getChannelList() {
    return new ChannelList(this.list.map((ch) => ch.toDescription()));
  }

  /**
   * Get sample bytes for a channel at a pixel index
   * @param {string} channelName
   * @param {number} pixelIndex
   * @returns {Uint8Array}
   */
  getSampleBytes(channelName, pixelIndex) {
    const channel = this._channelMap.get(channelName);
    return channel.samples.getBytesAt(pixelIndex);
  }
}

/**
 * Fixed channel configuration with pixel accessor
 */
export class SpecificChannels {
  /**
   * @param {ChannelDescription[]} channels - Channel descriptions in order
   * @param {Function|Float32Array} pixels - Pixel accessor or interleaved data
   */
  constructor(channels, pixels) {
    // Sort channels alphabetically for storage order
    this._originalChannels = channels;
    this._sortedChannels = [...channels].sort((a, b) => a.name.localeCompare(b.name));
    this._channelIndices = new Map(channels.map((ch, i) => [ch.name, i]));
    this.pixels = pixels;
  }

  /**
   * Create RGB channels
   * @param {Function|Float32Array} pixels - (pos) => [r, g, b] or interleaved Float32Array
   * @param {string} sampleType
   */
  static rgb(pixels, sampleType = SampleType.F32) {
    return new SpecificChannels(
      [
        ChannelDescription.named('R', sampleType),
        ChannelDescription.named('G', sampleType),
        ChannelDescription.named('B', sampleType),
      ],
      pixels
    );
  }

  /**
   * Create RGBA channels
   * @param {Function|Float32Array} pixels - (pos) => [r, g, b, a] or interleaved Float32Array
   * @param {string} sampleType
   */
  static rgba(pixels, sampleType = SampleType.F32) {
    return new SpecificChannels(
      [
        ChannelDescription.named('R', sampleType),
        ChannelDescription.named('G', sampleType),
        ChannelDescription.named('B', sampleType),
        new ChannelDescription('A', sampleType, true), // Alpha is linear
      ],
      pixels
    );
  }

  /**
   * Builder for custom channels
   */
  static build() {
    return new SpecificChannelsBuilder();
  }

  /**
   * Get the channel list for metadata
   * @returns {ChannelList}
   */
  getChannelList() {
    return new ChannelList(this._sortedChannels);
  }

  /**
   * Get sample bytes for a channel at a pixel index
   * @param {string} channelName
   * @param {number} pixelIndex
   * @returns {Uint8Array}
   */
  getSampleBytes(channelName, pixelIndex) {
    const channelIndex = this._channelIndices.get(channelName);
    const channelDesc = this._originalChannels[channelIndex];
    const bytes = bytesPerSample(channelDesc.sampleType);
    const result = new Uint8Array(bytes);
    const view = new DataView(result.buffer);

    let value;

    if (typeof this.pixels === 'function') {
      // Callback-based: pixels(pixelIndex) returns array of values
      const values = this.pixels(pixelIndex);
      value = values[channelIndex];
    } else if (this.pixels instanceof Float32Array) {
      // Interleaved Float32Array
      const numChannels = this._originalChannels.length;
      value = this.pixels[pixelIndex * numChannels + channelIndex];
    } else {
      throw new Error('Unsupported pixel data type');
    }

    switch (channelDesc.sampleType) {
      case SampleType.F16:
        view.setUint16(0, floatToHalf(value), true);
        break;
      case SampleType.F32:
        view.setFloat32(0, value, true);
        break;
      case SampleType.U32:
        view.setUint32(0, value >>> 0, true);
        break;
    }

    return result;
  }
}

/**
 * Builder for SpecificChannels
 */
export class SpecificChannelsBuilder {
  constructor() {
    this._channels = [];
  }

  /**
   * Add a channel
   * @param {string} name
   * @param {string} sampleType
   * @returns {SpecificChannelsBuilder}
   */
  withChannel(name, sampleType = SampleType.F32) {
    this._channels.push(ChannelDescription.named(name, sampleType));
    return this;
  }

  /**
   * Set pixel accessor and build
   * @param {Function|Float32Array} pixels
   * @returns {SpecificChannels}
   */
  withPixels(pixels) {
    return new SpecificChannels(this._channels, pixels);
  }

  /**
   * Set pixel function and build
   * @param {Function} fn - (pixelIndex) => [values...]
   * @returns {SpecificChannels}
   */
  withPixelFn(fn) {
    return new SpecificChannels(this._channels, fn);
  }
}
