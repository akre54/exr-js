// Layer data structure

import { Vec2 } from '../core/types.js';
import { LayerAttributes, Encoding } from '../meta/header.js';

// Single layer with channels and encoding
export class Layer {
  // @param {Vec2} size - Layer resolution
// @param {LayerAttributes} attributes - Layer attributes
// @param {Encoding} encoding - Compression and block settings
// @param {import('./channels.js').AnyChannels|import('./channels.js').SpecificChannels} channelData
  constructor(size, attributes, encoding, channelData) {
    this.size = size;
    this.attributes = attributes;
    this.encoding = encoding;
    this.channelData = channelData;
  }

  // Create a layer
// @param {Vec2} size
// @param {import('./channels.js').AnyChannels|import('./channels.js').SpecificChannels} channelData
// @param {Encoding} encoding
// @param {LayerAttributes} attributes
// @returns {Layer}
  static create(size, channelData, encoding = Encoding.FAST_LOSSLESS, attributes = new LayerAttributes()) {
    return new Layer(size, attributes, encoding, channelData);
  }

  // Create a named layer
// @param {string} name
// @param {Vec2} size
// @param {import('./channels.js').AnyChannels|import('./channels.js').SpecificChannels} channelData
// @param {Encoding} encoding
// @returns {Layer}
  static named(name, size, channelData, encoding = Encoding.FAST_LOSSLESS) {
    return new Layer(size, LayerAttributes.named(name), encoding, channelData);
  }
}
