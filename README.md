# exrjs

A modern JavaScript library for reading and writing OpenEXR images with multi-part support, render passes (AOVs), and advanced compression.

## Features

- **Read and write EXR** - Full encode/decode support for OpenEXR files
- **Multi-layer support** - Complex EXR files with multiple render passes
- **All compression methods** - NONE, RLE, ZIP1, ZIP16, PIZ, PXR24, B44, B44A
- **Tiled and scanline storage** - Flexible image organization
- **Mip maps and rip maps** - Automatic generation of multi-resolution images
- **High dynamic range** - Full support for F16, F32, and U32 sample types
- **Browser and Node.js** - Works in both environments
- **Zero I/O dependencies** - Returns raw bytes; you handle file I/O

## Installation

```bash
npm install exrjs
```

## Quick Start

### Encode RGBA Image

```javascript
import { encodeRgba } from 'exrjs';
import { writeFileSync } from 'fs';

// Encode a simple gradient
const buffer = encodeRgba(512, 512, (index) => {
  const x = index % 512;
  const y = Math.floor(index / 512);
  return [x / 512, y / 512, 0.5, 1.0]; // [R, G, B, A]
});

// Write to file (you handle I/O)
writeFileSync('output.exr', new Uint8Array(buffer));
```

### Decode EXR Image

```javascript
import { decodeRgba } from 'exrjs';
import { readFileSync } from 'fs';

// Read file and decode
const fileData = readFileSync('image.exr');
const { width, height, pixels } = decodeRgba(fileData);

console.log(`Image: ${width}x${height}, ${pixels.length} values`);
```

### Multi-layer Render Passes

```javascript
import { EXRWriter, Compression, SampleType } from 'exrjs';
import { writeFileSync } from 'fs';

const writer = new EXRWriter(1920, 1080);

// Beauty pass
writer.addLayer('beauty')
  .rgba(beautyPixels)
  .compression(Compression.PIZ)
  .tiled(64, 64)
  .end();

// Normal pass
writer.addLayer('normal')
  .rgb(normalPixels)
  .compression(Compression.ZIP16)
  .end();

// Depth pass
writer.addLayer('depth')
  .channel('Z', SampleType.F32, depthData)
  .compression(Compression.PXR24)
  .end();

const buffer = writer.encode();
writeFileSync('render.exr', new Uint8Array(buffer));
```

## API Overview

### Simple API

For basic use cases:

```javascript
// Encode RGBA image to ArrayBuffer
const buffer = encodeRgba(width, height, pixels, encoding);

// Encode RGB image to ArrayBuffer
const buffer = encodeRgb(width, height, pixels, encoding);

// Decode EXR to RGBA pixel data
const { width, height, pixels } = decodeRgba(buffer);

// Decode EXR to RGB pixel data
const { width, height, pixels } = decodeRgb(buffer);
```

The `pixels` parameter can be:
- A callback function: `(index) => [r, g, b, a]`
- A Float32Array with interleaved values

### Builder API

For render passes and complex images:

```javascript
const writer = new EXRWriter(width, height);

writer.addLayer('layerName')
  .rgba(pixels)              // or .rgb(pixels)
  .compression(Compression.PIZ)
  .tiled(64, 64)            // or .scanlines()
  .sampleType(SampleType.F16)
  .end();

const buffer = writer.encode();
```

### Reader API

For detailed access to EXR contents:

```javascript
import { EXRReader } from 'exrjs';
import { readFileSync } from 'fs';

const reader = new EXRReader(readFileSync('multipass.exr'));

// Get metadata
console.log(`Layers: ${reader.getLayerCount()}`);
console.log(`Names: ${reader.getLayerNames()}`);

// Read specific layers
const beauty = reader.readRgba(0);      // First layer as RGBA
const depth = reader.readChannel('Z', 1); // Z channel from second layer
```

### Advanced API

For complete control:

```javascript
import { Image, Layer, SpecificChannels, Encoding, Vec2 } from 'exrjs';

const channels = SpecificChannels.rgba(pixels);
const image = Image.fromChannels(
  new Vec2(width, height),
  channels,
  Encoding.FAST_LOSSLESS
);

const buffer = image.write().toArrayBuffer();
```

## Compression Methods

| Method | Description | Best For |
|--------|-------------|----------|
| `NONE` | No compression | Fast writing, large files |
| `RLE` | Run-length encoding | Solid colors, masks |
| `ZIP1` | Zlib per scanline | General purpose |
| `ZIP16` | Zlib per 16 scanlines | General purpose, better ratio |
| `PIZ` | Wavelet + Huffman | Natural images, best ratio |
| `PXR24` | 32-bit float to 24-bit | Normals, positions |
| `B44` | 4x4 block compression | F16 data, fast decompression |
| `B44A` | B44 with flat areas | F16 data with solid regions |

Quick recommendation: Use `Compression.PIZ` for beauty passes and `Compression.ZIP16` for data passes.

## Sample Types

- **F16** (half float) - 16-bit, range +/-65504, ~3 decimal digits
- **F32** (float) - 32-bit, standard floating point
- **U32** (unsigned int) - 32-bit integers (0 to 4,294,967,295)

## Storage Modes

### Scanlines
```javascript
.scanlines()  // Default, best for sequential access
```

### Tiles
```javascript
.tiled(64, 64)  // Best for random access, mip maps
```

### Mip Maps

```javascript
import { Blocks, LevelMode, RoundingMode, Vec2 } from 'exrjs';

// Automatic mip map generation
const encoding = new Encoding(
  Compression.PIZ,
  Blocks.Tiles(new Vec2(64, 64), LevelMode.MipMap, RoundingMode.Down),
  LineOrder.Unspecified
);
```

## Browser Usage

The library works in browsers. All functions return `ArrayBuffer` - you handle downloads:

```javascript
import { encodeRgba, decodeRgba } from 'exrjs';

// Encode an image
const buffer = encodeRgba(512, 512, pixels);

// Download as file
const blob = new Blob([buffer], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'render.exr';
a.click();
URL.revokeObjectURL(url);

// Decode an uploaded file
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const buffer = await file.arrayBuffer();
  const { width, height, pixels } = decodeRgba(buffer);
  // Use the pixel data...
});
```

## Demo

Try the interactive demo: [https://your-username.github.io/exrjs/](https://your-username.github.io/exrjs/)

## Performance Tips

1. **Use appropriate compression**: PIZ gives best ratios but is slower; ZIP16 is a good balance
2. **Tile size**: 64x64 is standard; larger tiles = better compression, slower random access
3. **Sample types**: F16 uses half the memory of F32; use U32 for integer data
4. **Avoid unnecessary conversions**: Pass Float32Array directly instead of callbacks when possible

## License

MIT

## Contributing

Issues and pull requests welcome!

## Credits

Based on the excellent [exrs](https://github.com/johannesvollmer/exrs) Rust library by johannesvollmer.
