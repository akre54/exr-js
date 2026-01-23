// Channel data structures for EXR images

import { bytesPerSample, SampleType, Vec2 } from '../core/types.js'
import { floatToHalf } from '../lib/half.js'
import { ChannelDescription, ChannelList } from '../meta/attributes.js'

// Flat sample storage (one value per pixel per channel)
export class FlatSamples {
  constructor(sampleType, data) {
    this.sampleType = sampleType
    this.data = data
  }

  // Create F16 samples
  static f16(data) {
    return new FlatSamples(SampleType.F16, data)
  }

  // Create F32 samples
  static f32(data) {
    return new FlatSamples(SampleType.F32, data)
  }

  // Create U32 samples
  static u32(data) {
    return new FlatSamples(SampleType.U32, data)
  }

  get length() {
    return this.data.length
  }

  // Get value at index
  valueAt(index) {
    return this.data[index]
  }

  // Get the raw bytes for a sample at the given index (little-endian)
  getBytesAt(index) {
    const bytes = bytesPerSample(this.sampleType)
    const result = new Uint8Array(bytes)
    const view = new DataView(result.buffer)

    switch (this.sampleType) {
      case SampleType.F16:
        view.setUint16(0, this.data[index], true)
        break
      case SampleType.F32:
        view.setFloat32(0, this.data[index], true)
        break
      case SampleType.U32:
        view.setUint32(0, this.data[index], true)
        break
    }

    return result
  }
}

// Single channel with name and sample data
export class AnyChannel {
  constructor(
    name,
    samples,
    quantizeLinearly = null,
    sampling = new Vec2(1, 1),
  ) {
    this.name = name
    this.samples = samples
    this.quantizeLinearly =
      quantizeLinearly ?? !['R', 'G', 'B', 'Y', 'L'].includes(name)
    this.sampling = sampling
  }

  // Get channel description
  toDescription() {
    return new ChannelDescription(
      this.name,
      this.samples.sampleType,
      this.quantizeLinearly,
      this.sampling,
    )
  }
}

// Dynamic channel collection
export class AnyChannels {
  constructor(list) {
    // Sort alphabetically
    this.list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    this._channelMap = new Map(this.list.map((ch) => [ch.name, ch]))
  }

  // Get the channel list for metadata
  getChannelList() {
    return new ChannelList(this.list.map((ch) => ch.toDescription()))
  }

  // Get sample bytes for a channel at a pixel index
  getSampleBytes(channelName, pixelIndex) {
    const channel = this._channelMap.get(channelName)
    return channel.samples.getBytesAt(pixelIndex)
  }
}

// Fixed channel configuration with pixel accessor
export class SpecificChannels {
  constructor(channels, pixels) {
    // Sort channels alphabetically for storage order
    this._originalChannels = channels
    this._sortedChannels = [...channels].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    this._channelIndices = new Map(channels.map((ch, i) => [ch.name, i]))
    this.pixels = pixels
  }

  // Create RGB channels
  static rgb(pixels, sampleType = SampleType.F32) {
    return new SpecificChannels(
      [
        ChannelDescription.named('R', sampleType),
        ChannelDescription.named('G', sampleType),
        ChannelDescription.named('B', sampleType),
      ],
      pixels,
    )
  }

  // Create RGBA channels
  static rgba(pixels, sampleType = SampleType.F32) {
    return new SpecificChannels(
      [
        ChannelDescription.named('R', sampleType),
        ChannelDescription.named('G', sampleType),
        ChannelDescription.named('B', sampleType),
        new ChannelDescription('A', sampleType, true), // Alpha is linear
      ],
      pixels,
    )
  }

  // Builder for custom channels
  static build() {
    return new SpecificChannelsBuilder()
  }

  // Get the channel list for metadata
  getChannelList() {
    return new ChannelList(this._sortedChannels)
  }

  // Get sample bytes for a channel at a pixel index
  getSampleBytes(channelName, pixelIndex) {
    const channelIndex = this._channelIndices.get(channelName)
    const channelDesc = this._originalChannels[channelIndex]
    const bytes = bytesPerSample(channelDesc.sampleType)
    const result = new Uint8Array(bytes)
    const view = new DataView(result.buffer)

    let value

    if (typeof this.pixels === 'function') {
      // Callback-based: pixels(pixelIndex) returns array of values
      const values = this.pixels(pixelIndex)
      value = values[channelIndex]
    } else if (this.pixels instanceof Float32Array) {
      // Interleaved Float32Array
      const numChannels = this._originalChannels.length
      value = this.pixels[pixelIndex * numChannels + channelIndex]
    } else {
      throw new Error('Unsupported pixel data type')
    }

    switch (channelDesc.sampleType) {
      case SampleType.F16:
        view.setUint16(0, floatToHalf(value), true)
        break
      case SampleType.F32:
        view.setFloat32(0, value, true)
        break
      case SampleType.U32:
        view.setUint32(0, value >>> 0, true)
        break
    }

    return result
  }
}

// Builder for SpecificChannels
export class SpecificChannelsBuilder {
  constructor() {
    this._channels = []
  }

  // Add a channel
  withChannel(name, sampleType = SampleType.F32) {
    this._channels.push(ChannelDescription.named(name, sampleType))
    return this
  }

  // Set pixel accessor and build
  withPixels(pixels) {
    return new SpecificChannels(this._channels, pixels)
  }

  // Set pixel function and build
  withPixelFn(fn) {
    return new SpecificChannels(this._channels, fn)
  }
}
