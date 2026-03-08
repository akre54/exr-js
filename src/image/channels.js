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

  // Write bytes for a range of samples directly into target buffer (batch operation)
  writeBytesTo(startIndex, count, target, targetOffset) {
    const bytes = bytesPerSample(this.sampleType)
    const totalBytes = count * bytes

    // Direct copy from underlying typed array buffer
    const sourceBytes = new Uint8Array(
      this.data.buffer,
      this.data.byteOffset + startIndex * bytes,
      totalBytes,
    )
    target.set(sourceBytes, targetOffset)
  }

  // Get all values as Float32Array (for mip level generation)
  toFloat32Array(halfToFloatFn) {
    switch (this.sampleType) {
      case SampleType.F32:
        // Already float32, return copy
        return new Float32Array(this.data)
      case SampleType.F16: {
        // Convert from half-float
        const result = new Float32Array(this.data.length)
        for (let i = 0; i < this.data.length; i++) {
          result[i] = halfToFloatFn(this.data[i])
        }
        return result
      }
      case SampleType.U32: {
        // Convert from uint32
        const result = new Float32Array(this.data.length)
        for (let i = 0; i < this.data.length; i++) {
          result[i] = this.data[i]
        }
        return result
      }
      default:
        return new Float32Array(this.data)
    }
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

  // Write scanline bytes for a channel directly into target buffer (batch operation)
  writeScanlineBytes(
    channelName,
    startPixelIndex,
    pixelCount,
    target,
    targetOffset,
  ) {
    const channel = this._channelMap.get(channelName)
    channel.samples.writeBytesTo(
      startPixelIndex,
      pixelCount,
      target,
      targetOffset,
    )
  }

  // Get all values for a channel as Float32Array (for mip level generation)
  getChannelAsFloat32(channelName, halfToFloatFn, _pixelCount) {
    const channel = this._channelMap.get(channelName)
    return channel.samples.toFloat32Array(halfToFloatFn)
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

  // Write scanline bytes for a channel directly into target buffer (batch operation)
  writeScanlineBytes(
    channelName,
    startPixelIndex,
    pixelCount,
    target,
    targetOffset,
  ) {
    const channelIndex = this._channelIndices.get(channelName)
    const channelDesc = this._originalChannels[channelIndex]
    const bytes = bytesPerSample(channelDesc.sampleType)
    const numChannels = this._originalChannels.length
    const view = new DataView(
      target.buffer,
      target.byteOffset + targetOffset,
      pixelCount * bytes,
    )

    if (typeof this.pixels === 'function') {
      // Callback-based pixels
      switch (channelDesc.sampleType) {
        case SampleType.F16:
          for (let i = 0; i < pixelCount; i++) {
            const values = this.pixels(startPixelIndex + i)
            view.setUint16(i * 2, floatToHalf(values[channelIndex]), true)
          }
          break
        case SampleType.F32:
          for (let i = 0; i < pixelCount; i++) {
            const values = this.pixels(startPixelIndex + i)
            view.setFloat32(i * 4, values[channelIndex], true)
          }
          break
        case SampleType.U32:
          for (let i = 0; i < pixelCount; i++) {
            const values = this.pixels(startPixelIndex + i)
            view.setUint32(i * 4, values[channelIndex] >>> 0, true)
          }
          break
      }
    } else if (this.pixels instanceof Float32Array) {
      // Interleaved Float32Array
      switch (channelDesc.sampleType) {
        case SampleType.F16:
          for (let i = 0; i < pixelCount; i++) {
            const value =
              this.pixels[(startPixelIndex + i) * numChannels + channelIndex]
            view.setUint16(i * 2, floatToHalf(value), true)
          }
          break
        case SampleType.F32:
          for (let i = 0; i < pixelCount; i++) {
            const value =
              this.pixels[(startPixelIndex + i) * numChannels + channelIndex]
            view.setFloat32(i * 4, value, true)
          }
          break
        case SampleType.U32:
          for (let i = 0; i < pixelCount; i++) {
            const value =
              this.pixels[(startPixelIndex + i) * numChannels + channelIndex]
            view.setUint32(i * 4, value >>> 0, true)
          }
          break
      }
    } else {
      throw new Error('Unsupported pixel data type')
    }
  }

  // Get all values for a channel as Float32Array (for mip level generation)
  getChannelAsFloat32(channelName, _halfToFloatFn, pixelCount) {
    const channelIndex = this._channelIndices.get(channelName)
    const numChannels = this._originalChannels.length

    if (typeof this.pixels === 'function') {
      // Callback-based: need to call for each pixel
      if (pixelCount === undefined) {
        throw new Error('pixelCount required for callback-based pixels')
      }
      const result = new Float32Array(pixelCount)
      for (let i = 0; i < pixelCount; i++) {
        const values = this.pixels(i)
        result[i] = values[channelIndex]
      }
      return result
    }

    if (!(this.pixels instanceof Float32Array)) {
      throw new Error(
        'getChannelAsFloat32 only supported for Float32Array pixels',
      )
    }

    // Count pixels (Float32Array length / num channels)
    const count = pixelCount ?? this.pixels.length / numChannels
    const result = new Float32Array(count)

    // Extract channel values with stride
    for (let i = 0; i < count; i++) {
      const value = this.pixels[i * numChannels + channelIndex]
      result[i] = value
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
