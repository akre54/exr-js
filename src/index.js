// exr-js - JavaScript library for reading and writing OpenEXR images
// @example Simple RGBA export
// ```javascript
// import { writeRgbaFile } from 'exr-js';
// await writeRgbaFile('output.exr', 1920, 1080, (index) => {
//   const x = index % 1920;
//   const y = Math.floor(index / 1920);
//   return [x / 1920, y / 1080, 0.5, 1.0]; // RGBA
// });
// ```
// @example Reading an EXR file
// ```javascript
// import { readRgbaFile, EXRReader } from 'exr-js';
// // Simple API
// const { width, height, pixels } = await readRgbaFile('image.exr');
// // Advanced API
// const reader = await EXRReader.fromFile('multipass.exr');
// const beauty = reader.readRgba(0);
// const depth = reader.readChannel('Z', 1);
// ```
// @example Multi-layer render passes
// ```javascript
// import { EXRWriter, Compression } from 'exr-js';
// const writer = new EXRWriter(1920, 1080);
// writer.addLayer('beauty')
//   .rgba(beautyPixels)
//   .compression(Compression.PIZ)
//   .end();
// writer.addLayer('depth')
//   .channel('Z', 'f32', depthPixels)
//   .end();
// await writer.write('render.exr');
// ```

// Main API - Writing
export {
  writeRgbaFile,
  writeRgbFile,
  EXRWriter,
} from './api/index.js';

// Main API - Reading
export {
  readRgbaFile,
  readRgbFile,
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
