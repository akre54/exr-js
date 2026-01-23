// exrjs - JavaScript library for reading and writing OpenEXR images
// @example Simple RGBA export
// ```javascript
// import { writeRgbaFile } from 'exrjs';
// await writeRgbaFile('output.exr', 1920, 1080, (index) => {
//   const x = index % 1920;
//   const y = Math.floor(index / 1920);
//   return [x / 1920, y / 1080, 0.5, 1.0]; // RGBA
// });
// ```
// @example Reading an EXR file
// ```javascript
// import { readRgbaFile, EXRReader } from 'exrjs';
// // Simple API
// const { width, height, pixels } = await readRgbaFile('image.exr');
// // Advanced API
// const reader = await EXRReader.fromFile('multipass.exr');
// const beauty = reader.readRgba(0);
// const depth = reader.readChannel('Z', 1);
// ```
// @example Multi-layer render passes
// ```javascript
// import { EXRWriter, Compression } from 'exrjs';
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
  EXRWriter,
  writeRgbaFile,
  writeRgbFile,
} from './api/index.js'

// Main API - Reading
export {
  EXRReader,
  readRgbaFile,
  readRgbFile,
} from './api/read.js'

// Core types
export {
  Blocks,
  Compression,
  IntegerBounds,
  LevelMode,
  LineOrder,
  RoundingMode,
  SampleType,
  Vec2,
} from './core/types.js'
export {
  AnyChannel,
  AnyChannels,
  FlatSamples,
  SpecificChannels,
} from './image/channels.js'
// Image structures
export { Image } from './image/image.js'
export { Layer } from './image/layer.js'
// I/O utilities
export { BinaryReader } from './io/binary-reader.js'
export { BinaryWriter } from './io/binary-writer.js'

// Half-precision float utilities
export {
  float32ArrayToHalf,
  floatToHalf,
  halfToFloat,
  halfToFloat32Array,
} from './lib/half.js'
export {
  ChannelDescription,
  ChannelList,
} from './meta/attributes.js'
// Metadata
export {
  Encoding,
  ImageAttributes,
  LayerAttributes,
} from './meta/header.js'

// Reading metadata
export { ParsedHeader, ParsedMeta, readMeta } from './meta/read-header.js'
