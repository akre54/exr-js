# API Reference

Complete API documentation for exrjs.

## Table of Contents

- [Simple Functions](#simple-functions)
- [EXRWriter](#exrwriter)
- [LayerBuilder](#layerbuilder)
- [Core Types](#core-types)
- [Low-Level API](#low-level-api)

## Simple Functions

### writeRgbaFile()

Write an RGBA image to a file.

```javascript
async function writeRgbaFile(
  path: string | null,
  width: number,
  height: number,
  pixels: PixelCallback | Float32Array,
  encoding?: Encoding
): Promise<ArrayBuffer | void>
```

**Parameters:**
- `path` - File path (Node.js) or `null` to return ArrayBuffer
- `width` - Image width in pixels
- `height` - Image height in pixels
- `pixels` - Pixel data as callback `(index) => [r, g, b, a]` or interleaved Float32Array
- `encoding` - Optional encoding settings (defaults to `Encoding.FAST_LOSSLESS`)

**Returns:**
- `Promise<ArrayBuffer>` if path is null
- `Promise<void>` if path is provided (writes to file)

**Example:**
```javascript
import { writeRgbaFile, Encoding, Compression } from 'exrjs';

// With callback
await writeRgbaFile('output.exr', 512, 512, (index) => {
  const x = index % 512;
  const y = Math.floor(index / 512);
  return [x / 512, y / 512, 0.5, 1.0];
});

// With Float32Array
const pixels = new Float32Array(512 * 512 * 4);
for (let i = 0; i < 512 * 512; i++) {
  pixels[i * 4] = 1.0;     // R
  pixels[i * 4 + 1] = 0.5; // G
  pixels[i * 4 + 2] = 0.0; // B
  pixels[i * 4 + 3] = 1.0; // A
}
await writeRgbaFile('output.exr', 512, 512, pixels);

// With custom encoding
const encoding = new Encoding(Compression.PIZ, Blocks.ScanLines, LineOrder.Increasing);
await writeRgbaFile('output.exr', 512, 512, pixels, encoding);
```

---

### writeRgbFile()

Write an RGB image to a file (no alpha channel).

```javascript
async function writeRgbFile(
  path: string | null,
  width: number,
  height: number,
  pixels: PixelCallback | Float32Array,
  encoding?: Encoding
): Promise<ArrayBuffer | void>
```

**Parameters:**
Same as `writeRgbaFile()` but pixels return `[r, g, b]` or Float32Array with 3 components per pixel.

**Example:**
```javascript
// With callback
await writeRgbFile('normal.exr', 256, 256, (index) => {
  const x = index % 256;
  const y = Math.floor(index / 256);
  const nx = (x / 256) * 2 - 1;
  const ny = (y / 256) * 2 - 1;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return [nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz];
});
```

---

## EXRWriter

High-level builder for creating multi-layer EXR files.

### Constructor

```javascript
new EXRWriter(width: number, height: number)
```

**Parameters:**
- `width` - Image width in pixels
- `height` - Image height in pixels

**Example:**
```javascript
const writer = new EXRWriter(1920, 1080);
```

---

### addLayer()

Add a layer to the image.

```javascript
addLayer(name: string, options?: object): LayerBuilder
```

**Parameters:**
- `name` - Layer name (e.g., "beauty", "normal", "depth")
- `options` - Optional configuration object
  - `encoding` - Encoding settings (default: `Encoding.FAST_LOSSLESS`)

**Returns:** `LayerBuilder` for configuring the layer

**Example:**
```javascript
writer.addLayer('beauty')
  .rgba(pixels)
  .compression(Compression.PIZ)
  .end();
```

---

### write()

Write the EXR file.

```javascript
async write(filename?: string | null): Promise<ArrayBuffer | void>
```

**Parameters:**
- `filename` - Optional filename. If omitted or null, returns ArrayBuffer

**Returns:**
- `Promise<ArrayBuffer>` if filename is null/omitted
- `Promise<void>` if filename is provided (writes to file)

**Example:**
```javascript
// Write to file
await writer.write('render.exr');

// Get as ArrayBuffer
const buffer = await writer.write();
const blob = new Blob([buffer]);
```

---

## LayerBuilder

Builder for configuring a single layer. Obtained from `EXRWriter.addLayer()`.

### rgba()

Set RGBA pixel data for this layer.

```javascript
rgba(data: PixelCallback | Float32Array): LayerBuilder
```

**Parameters:**
- `data` - Pixel data as callback `(index) => [r, g, b, a]` or interleaved Float32Array

**Returns:** `this` for chaining

**Example:**
```javascript
writer.addLayer('beauty')
  .rgba((index) => [1, 0.5, 0, 1])
  .end();
```

---

### rgb()

Set RGB pixel data (no alpha channel).

```javascript
rgb(data: PixelCallback | Float32Array): LayerBuilder
```

**Parameters:**
- `data` - Pixel data as callback `(index) => [r, g, b]` or interleaved Float32Array

**Returns:** `this` for chaining

---

### channel()

Add a single custom channel.

```javascript
channel(
  name: string,
  sampleType: string,
  data: Float32Array | Uint32Array | Uint16Array
): LayerBuilder
```

**Parameters:**
- `name` - Channel name (e.g., "Z", "ID", "mask")
- `sampleType` - Sample type: `SampleType.F16`, `SampleType.F32`, or `SampleType.U32`
- `data` - Typed array with sample data

**Returns:** `this` for chaining

**Example:**
```javascript
const depthData = new Float32Array(width * height);
// ... fill depthData ...

writer.addLayer('depth')
  .channel('Z', SampleType.F32, depthData)
  .compression(Compression.PXR24)
  .end();
```

---

### compression()

Set compression method for this layer.

```javascript
compression(method: number): LayerBuilder
```

**Parameters:**
- `method` - Compression method from `Compression` enum

**Returns:** `this` for chaining

**Example:**
```javascript
writer.addLayer('beauty')
  .rgba(pixels)
  .compression(Compression.PIZ)
  .end();
```

---

### tiled()

Use tiled storage for this layer.

```javascript
tiled(tileWidth?: number, tileHeight?: number): LayerBuilder
```

**Parameters:**
- `tileWidth` - Tile width in pixels (default: 64)
- `tileHeight` - Tile height in pixels (default: 64)

**Returns:** `this` for chaining

**Example:**
```javascript
writer.addLayer('beauty')
  .rgba(pixels)
  .tiled(128, 128)
  .end();
```

---

### scanlines()

Use scanline storage for this layer (default).

```javascript
scanlines(): LayerBuilder
```

**Returns:** `this` for chaining

---

### sampleType()

Set sample type for RGB/RGBA channels.

```javascript
sampleType(type: string): LayerBuilder
```

**Parameters:**
- `type` - Sample type: `SampleType.F16`, `SampleType.F32`, or `SampleType.U32`

**Returns:** `this` for chaining

**Example:**
```javascript
writer.addLayer('beauty')
  .rgba(pixels)
  .sampleType(SampleType.F16)  // Use half precision
  .end();
```

---

### end()

Finish configuring this layer and return to the writer.

```javascript
end(): EXRWriter
```

**Returns:** The parent `EXRWriter`

**Example:**
```javascript
writer.addLayer('layer1').rgba(pixels1).end()
      .addLayer('layer2').rgb(pixels2).end();
```

---

## Core Types

### Vec2

2D vector for dimensions and coordinates.

```javascript
class Vec2 {
  constructor(x: number, y: number)
  x: number
  y: number
  area(): number
  add(other: Vec2): Vec2
  sub(other: Vec2): Vec2
  mul(scalar: number): Vec2
  div(scalar: number): Vec2
}
```

**Example:**
```javascript
const size = new Vec2(1920, 1080);
const area = size.area(); // 2073600
```

---

### IntegerBounds

Rectangle bounds for data windows and display windows.

```javascript
class IntegerBounds {
  constructor(position: Vec2, size: Vec2)
  position: Vec2
  size: Vec2

  static fromDimensions(width: number, height: number): IntegerBounds
}
```

**Example:**
```javascript
const bounds = IntegerBounds.fromDimensions(1920, 1080);
```

---

### SampleType

Pixel sample data types.

```javascript
SampleType.F16  // 16-bit half float
SampleType.F32  // 32-bit float
SampleType.U32  // 32-bit unsigned integer
```

---

### Compression

Compression methods.

```javascript
Compression.NONE    // No compression
Compression.RLE     // Run-length encoding
Compression.ZIP1    // Zlib per scanline
Compression.ZIP16   // Zlib per 16 scanlines
Compression.PIZ     // Wavelet + Huffman
Compression.PXR24   // 32-bit to 24-bit float
Compression.B44     // 4x4 block (lossy for F16)
Compression.B44A    // B44 with flat area optimization
```

---

### Blocks

Storage organization modes.

```javascript
Blocks.ScanLines  // Sequential scanline storage

Blocks.Tiles(tileSize: Vec2)  // Tiled storage
// Example: Blocks.Tiles(new Vec2(64, 64))

Blocks.Tiles(tileSize: Vec2, levelMode: LevelMode, roundingMode: RoundingMode)
// Tiled with mip/rip maps
// Example: Blocks.Tiles(new Vec2(64, 64), LevelMode.MipMap, RoundingMode.Down)
```

---

### LevelMode

Multi-resolution mode for tiled images.

```javascript
LevelMode.Singular  // No multi-resolution
LevelMode.MipMap    // Mip maps (square levels)
LevelMode.RipMap    // Rip maps (independent X/Y levels)
```

---

### RoundingMode

Rounding mode for calculating mip levels.

```javascript
RoundingMode.Down  // Round down (standard)
RoundingMode.Up    // Round up
```

---

### LineOrder

Scanline ordering.

```javascript
LineOrder.Increasing   // Top to bottom
LineOrder.Decreasing   // Bottom to top
LineOrder.Unspecified  // No specified order (for tiles)
```

---

### Encoding

Complete encoding configuration.

```javascript
class Encoding {
  constructor(
    compression: number,
    blocks: Blocks,
    lineOrder: LineOrder
  )

  // Predefined encodings
  static FAST_LOSSLESS: Encoding  // ZIP16, scanlines
  static SMALL_LOSSLESS: Encoding // PIZ, scanlines
  static SMALL_LOSSY: Encoding    // PXR24, scanlines
  static UNCOMPRESSED: Encoding   // NONE, scanlines
}
```

**Example:**
```javascript
// Use predefined
const encoding = Encoding.FAST_LOSSLESS;

// Custom encoding
const encoding = new Encoding(
  Compression.PIZ,
  Blocks.Tiles(new Vec2(128, 128)),
  LineOrder.Unspecified
);

// With mip maps
const encoding = new Encoding(
  Compression.ZIP16,
  Blocks.Tiles(new Vec2(64, 64), LevelMode.MipMap, RoundingMode.Down),
  LineOrder.Unspecified
);
```

---

## Low-Level API

For advanced use cases requiring complete control.

### Image

Top-level image container.

```javascript
class Image {
  constructor(attributes: ImageAttributes, layers: Layer[])

  static fromLayer(layer: Layer): Image
  static fromChannels(size: Vec2, channels: Channels, encoding: Encoding): Image

  write(): ImageWriter
}
```

**Example:**
```javascript
const image = Image.fromChannels(
  new Vec2(512, 512),
  SpecificChannels.rgba(pixels),
  Encoding.FAST_LOSSLESS
);

await image.write().toFile('output.exr');
```

---

### Layer

A single layer in a multi-layer image.

```javascript
class Layer {
  constructor(
    size: Vec2,
    attributes: LayerAttributes,
    encoding: Encoding,
    channelData: Channels
  )

  static create(size: Vec2, channelData: Channels, encoding: Encoding, attributes: LayerAttributes): Layer
}
```

---

### Channels

Channel data types.

#### SpecificChannels

Helper for creating standard RGB/RGBA channels.

```javascript
class SpecificChannels {
  static rgb(pixels: PixelCallback | Float32Array, sampleType?: string): SpecificChannels
  static rgba(pixels: PixelCallback | Float32Array, sampleType?: string): SpecificChannels
}
```

#### AnyChannels

Custom channel list.

```javascript
class AnyChannels {
  constructor(channels: AnyChannel[])
}

class AnyChannel {
  constructor(name: string, samples: FlatSamples)
}
```

**Example:**
```javascript
const channels = new AnyChannels([
  new AnyChannel('R', FlatSamples.f32(redData)),
  new AnyChannel('G', FlatSamples.f32(greenData)),
  new AnyChannel('B', FlatSamples.f32(blueData)),
  new AnyChannel('Z', FlatSamples.f32(depthData))
]);
```

---

### FlatSamples

Sample data containers.

```javascript
class FlatSamples {
  static f16(data: Uint16Array | Float32Array): FlatSamples
  static f32(data: Float32Array | Function): FlatSamples
  static u32(data: Uint32Array): FlatSamples
}
```

**Example:**
```javascript
const redSamples = FlatSamples.f32(new Float32Array(width * height));
const depthSamples = FlatSamples.f32((index) => index / (width * height));
```

---

### ImageWriter

Handles writing images to files or buffers.

```javascript
class ImageWriter {
  async toFile(path: string): Promise<void>
  async toArrayBuffer(): Promise<ArrayBuffer>
}
```

**Example:**
```javascript
const writer = image.write();

// Write to file
await writer.toFile('output.exr');

// Get as buffer
const buffer = await writer.toArrayBuffer();
```

---

## Type Definitions

### PixelCallback

```javascript
type PixelCallback = (index: number) => number[]
```

Function that returns pixel values for a given index.
- For RGB: returns `[r, g, b]`
- For RGBA: returns `[r, g, b, a]`

The index is a flat array index calculated as: `y * width + x`

**Example:**
```javascript
const pixels = (index) => {
  const x = index % width;
  const y = Math.floor(index / width);
  return [x / width, y / height, 0.5, 1.0];
};
```

---

## Error Handling

All async functions may throw errors. Common error types:

```javascript
try {
  await writeRgbaFile('output.exr', width, height, pixels);
} catch (error) {
  if (error.message.includes('compression')) {
    // Compression error (e.g., missing pako in browser)
  } else if (error.message.includes('write')) {
    // File write error
  }
  console.error('Failed to write EXR:', error);
}
```

Common errors:
- Missing compression library (pako) in browser
- Invalid dimensions (width/height must be > 0)
- Invalid pixel data (wrong array size, wrong return values)
- File system errors (Node.js only)
