// exrjs - JavaScript library for reading and writing OpenEXR images
// @example Simple RGBA encoding
// ```javascript
// import { encodeRgba } from 'exrjs';
// import { writeFileSync } from 'fs';
// const buffer = encodeRgba(1920, 1080, (index) => {
//   const x = index % 1920;
//   const y = Math.floor(index / 1920);
//   return [x / 1920, y / 1080, 0.5, 1.0]; // RGBA
// });
// writeFileSync('output.exr', new Uint8Array(buffer));
// ```
// @example Reading an EXR file
// ```javascript
// import { decodeRgba, EXRReader } from 'exrjs';
// import { readFileSync } from 'fs';
// // Simple API
// const fileData = readFileSync('image.exr');
// const { width, height, pixels } = decodeRgba(fileData);
// // Advanced API
// const reader = new EXRReader(readFileSync('multipass.exr'));
// const beauty = reader.readRgba(0);
// const depth = reader.readChannel('Z', 1);
// ```
// @example Multi-layer render passes
// ```javascript
// import { EXRWriter, Compression } from 'exrjs';
// import { writeFileSync } from 'fs';
// const writer = new EXRWriter(1920, 1080);
// writer.addLayer('beauty')
//   .rgba(beautyPixels)
//   .compression(Compression.PIZ)
//   .end();
// writer.addLayer('depth')
//   .channel('Z', 'f32', depthPixels)
//   .end();
// const buffer = writer.encode();
// writeFileSync('render.exr', new Uint8Array(buffer));
// ```

// Main API - Writing
export {
  encodeRgba,
  encodeRgb,
  EXRWriter,
} from './api/index.js';

// Main API - Reading
export {
  decodeRgba,
  decodeRgb,
  EXRReader,
} from './api/read.js';

// Core types
export {
  Vec2,
  IntegerBounds,
  SampleType,
  Compression,
  LineOrder,
  Blocks,
  LevelMode,
  RoundingMode,
} from './core/types.js';

// Image structures
export {
  Image,
} from './image/image.js';

export {
  Layer,
} from './image/layer.js';

export {
  SpecificChannels,
  AnyChannels,
  AnyChannel,
  FlatSamples,
} from './image/channels.js';

// Metadata
export {
  Encoding,
  LayerAttributes,
  ImageAttributes,
} from './meta/header.js';

export {
  ChannelDescription,
  ChannelList,
} from './meta/attributes.js';

// Half-precision float utilities
export {
  floatToHalf,
  halfToFloat,
  float32ArrayToHalf,
  halfToFloat32Array,
} from './lib/half.js';

// I/O utilities
export { BinaryReader } from './io/binary-reader.js';
export { BinaryWriter } from './io/binary-writer.js';

// Reading metadata
export { ParsedHeader, ParsedMeta, readMeta } from './meta/read-header.js';
