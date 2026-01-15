# exr-js

A modern JavaScript library for writing OpenEXR images with multi-part support, render passes (AOVs), and advanced compression.

## Features

- **Multi-layer support** - Write complex EXR files with multiple render passes
- **All compression methods** - NONE, RLE, ZIP1, ZIP16, PIZ, PXR24, B44, B44A
- **Tiled and scanline storage** - Flexible image organization
- **Mip maps and rip maps** - Automatic generation of multi-resolution images
- **High dynamic range** - Full support for F16, F32, and U32 sample types
- **Browser and Node.js** - Works in both environments
- **Simple API** - Easy to use for common cases, powerful for advanced needs

## Installation

```bash
npm install exr-js
```

For browser usage with ZIP/PXR24 compression, include [pako](https://github.com/nodeca/pako):

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"></script>
<script type="module" src="your-app.js"></script>
```

## Quick Start

### Simple RGBA Image

```javascript
import { writeRgbaFile } from 'exr-js';

// Write a simple gradient
await writeRgbaFile('output.exr', 512, 512, (index) => {
  const x = index % 512;
  const y = Math.floor(index / 512);
  return [x / 512, y / 512, 0.5, 1.0]; // [R, G, B, A]
});
```

### Multi-layer Render Passes

```javascript
import { EXRWriter, Compression, SampleType } from 'exr-js';

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

await writer.write('render.exr');
```

## API Overview

### Simple API

For basic use cases, use the convenience functions:

```javascript
// Write RGBA image
await writeRgbaFile(path, width, height, pixels, encoding);

// Write RGB image
await writeRgbFile(path, width, height, pixels, encoding);
```

The `pixels` parameter can be:
- A callback function: `(index) => [r, g, b, a]`
- A Float32Array with interleaved values

### Builder API

For render passes and complex images, use the builder:

```javascript
const writer = new EXRWriter(width, height);

writer.addLayer('layerName')
  .rgba(pixels)              // or .rgb(pixels)
  .compression(Compression.PIZ)
  .tiled(64, 64)            // or .scanlines()
  .sampleType(SampleType.F16)
  .end();

await writer.write('output.exr');
```

### Advanced API

For complete control, use the low-level API:

```javascript
import { Image, Layer, SpecificChannels, Encoding } from 'exr-js';

const channels = SpecificChannels.rgba(pixels);
const image = Image.fromChannels(
  new Vec2(width, height),
  channels,
  Encoding.FAST_LOSSLESS
);

await image.write().toFile('output.exr');
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

- **F16** (half float) - 16-bit, range ±65504, ~3 decimal digits
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
import { Blocks, LevelMode, RoundingMode } from 'exr-js';

// Automatic mip map generation
const encoding = new Encoding(
  Compression.PIZ,
  Blocks.Tiles(new Vec2(64, 64), LevelMode.MipMap, RoundingMode.Down),
  LineOrder.Unspecified
);
```

## Browser Usage

The library works in browsers with automatic fallbacks:

```javascript
import { EXRWriter } from 'exr-js';

const writer = new EXRWriter(512, 512);
writer.addLayer('beauty').rgba(pixels).end();

// Get as ArrayBuffer
const buffer = await writer.write();

// Download file
const blob = new Blob([buffer], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'render.exr';
a.click();
```

Note: Some compression methods require `pako` for browser environments. Install it for full compression support:

```bash
npm install pako
```

## Examples

See the `docs/examples/` directory for complete examples:

- [basic-usage.md](docs/examples/basic-usage.md) - Simple images and common patterns
- [render-passes.md](docs/examples/render-passes.md) - Multi-layer EXR for VFX/rendering
- [browser-example.md](docs/examples/browser-example.md) - Using exr-js in web applications
- [advanced.md](docs/examples/advanced.md) - Mip maps, custom channels, low-level API

## Performance Tips

1. **Use appropriate compression**: PIZ gives best ratios but is slower; ZIP16 is a good balance
2. **Tile size**: 64x64 is standard; larger tiles = better compression, slower random access
3. **Sample types**: F16 uses half the memory of F32; use U32 for integer data
4. **Avoid unnecessary conversions**: Pass Float32Array directly instead of callbacks when possible

## Limitations

- Write-only (reading not implemented)
- Deep images not supported
- Some advanced EXR features not implemented (multi-view, time sampling, etc.)

## License

MIT

## Contributing

Issues and pull requests welcome! This is a port of the Rust `exrs` library to JavaScript.

## Credits

Based on the excellent [exrs](https://github.com/johannesvollmer/exrs) Rust library by johannesvollmer.
