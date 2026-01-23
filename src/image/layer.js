// Layer data structure

import { Encoding, LayerAttributes } from '../meta/header.js'

// Single layer with channels and encoding
export class Layer {
  constructor(size, attributes, encoding, channelData) {
    this.size = size
    this.attributes = attributes
    this.encoding = encoding
    this.channelData = channelData
  }

  // Create a layer
  static create(
    size,
    channelData,
    encoding = Encoding.FAST_LOSSLESS,
    attributes = new LayerAttributes(),
  ) {
    return new Layer(size, attributes, encoding, channelData)
  }

  // Create a named layer
  static named(name, size, channelData, encoding = Encoding.FAST_LOSSLESS) {
    return new Layer(size, LayerAttributes.named(name), encoding, channelData)
  }
}
