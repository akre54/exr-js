# Advanced Usage

Advanced features and low-level API usage.

## Mip Maps

Automatically generate mip map levels:

```javascript
import {
  EXRWriter,
  Compression,
  Encoding,
  Blocks,
  Vec2,
  LineOrder,
  LevelMode,
  RoundingMode
} from 'exrjs';

const width = 1024;
const height = 1024;

// Create encoding with mip maps
const encoding = new Encoding(
  Compression.ZIP16,
  Blocks.Tiles(
    new Vec2(64, 64),           // Tile size
    LevelMode.MipMap,           // Generate mip maps
    RoundingMode.Down           // Round down for level calculation
  ),
  LineOrder.Unspecified
);

const writer = new EXRWriter(width, height);

writer.addLayer('beauty')
  .rgba(pixels)
  .compression(Compression.ZIP16)
  .tiled(64, 64)  // Must use tiles for mip maps
  .end();

// Mip levels are automatically generated using box filtering
await writer.write('mipmapped.exr');
```

### Rip Maps

Independent X and Y resolution levels:

```javascript
import {
  Encoding,
  Compression,
  Blocks,
  Vec2,
  LineOrder,
  LevelMode,
  RoundingMode
} from 'exrjs';

const encoding = new Encoding(
  Compression.PIZ,
  Blocks.Tiles(
    new Vec2(64, 64),
    LevelMode.RipMap,           // Rip maps (independent X/Y)
    RoundingMode.Down
  ),
  LineOrder.Unspecified
);

const writer = new EXRWriter(1024, 512);  // Non-square

writer.addLayer('texture')
  .rgba(pixels)
  .compression(Compression.PIZ)
  .tiled(64, 64)
  .end();

// Generates levels like:
// 1024x512, 512x512, 512x256, 256x256, 256x128, ...
await writer.write('ripmap.exr');
```

## Custom Channel Layouts

Create images with arbitrary channel configurations:

```javascript
import {
  Image,
  Layer,
  AnyChannels,
  AnyChannel,
  FlatSamples,
  Vec2,
  Encoding,
  LayerAttributes
} from 'exrjs';

const width = 512;
const height = 512;
const size = new Vec2(width, height);

// Create custom channels
const redData = new Float32Array(width * height);
const greenData = new Float32Array(width * height);
const blueData = new Float32Array(width * height);
const depthData = new Float32Array(width * height);
const idData = new Uint32Array(width * height);

// Fill data...
for (let i = 0; i < width * height; i++) {
  const x = i % width;
  const y = Math.floor(i / width);
  redData[i] = x / width;
  greenData[i] = y / height;
  blueData[i] = 0.5;
  depthData[i] = (x + y) / (width + height);
  idData[i] = (x >> 5) | ((y >> 5) << 8);
}

// Build channel list
const channels = new AnyChannels([
  new AnyChannel('R', FlatSamples.f32(redData)),
  new AnyChannel('G', FlatSamples.f32(greenData)),
  new AnyChannel('B', FlatSamples.f32(blueData)),
  new AnyChannel('Z', FlatSamples.f32(depthData)),
  new AnyChannel('ID', FlatSamples.u32(idData))
]);

// Create layer
const layer = Layer.create(
  size,
  channels,
  Encoding.FAST_LOSSLESS,
  LayerAttributes.default()
);

// Create and write image
const image = Image.fromLayer(layer);
await image.write().toFile('custom_channels.exr');
```

## Channel-Only Images

Create single-channel images:

```javascript
import {
  Image,
  Layer,
  AnyChannels,
  AnyChannel,
  FlatSamples,
  Vec2,
  Encoding,
  Compression,
  Blocks,
  LineOrder,
  SampleType,
  LayerAttributes
} from 'exrjs';

const width = 1024;
const height = 1024;

// Depth-only image
const depthData = new Float32Array(width * height);
for (let i = 0; i < depthData.length; i++) {
  const x = i % width;
  const y = Math.floor(i / width);
  const dx = x - width / 2;
  const dy = y - height / 2;
  depthData[i] = Math.sqrt(dx * dx + dy * dy);
}

const channels = new AnyChannels([
  new AnyChannel('Z', FlatSamples.f32(depthData))
]);

const encoding = new Encoding(
  Compression.PXR24,
  Blocks.ScanLines,
  LineOrder.Increasing
);

const layer = Layer.create(
  new Vec2(width, height),
  channels,
  encoding,
  LayerAttributes.default()
);

const image = Image.fromLayer(layer);
await image.write().toFile('depth_only.exr');
```

## Lazy Pixel Generation

Use callbacks for lazy evaluation of large images:

```javascript
import { EXRWriter, Compression } from 'exrjs';

const width = 8192;
const height = 8192;

// Pixels are only generated when needed
const writer = new EXRWriter(width, height);

writer.addLayer('procedural')
  .rgba((index) => {
    const x = index % width;
    const y = Math.floor(index / width);

    // Complex procedural generation
    const noise = generateComplexNoise(x, y);
    const pattern = generatePattern(x, y);

    return [
      noise * pattern,
      noise * (1 - pattern),
      pattern,
      1.0
    ];
  })
  .compression(Compression.PIZ)
  .end();

await writer.write('procedural.exr');

function generateComplexNoise(x, y) {
  // Your complex noise generation here
  return Math.random();
}

function generatePattern(x, y) {
  return Math.sin(x * 0.01) * Math.cos(y * 0.01) * 0.5 + 0.5;
}
```

## Mixed Precision Channels

Different channels with different precisions:

```javascript
import {
  Layer,
  AnyChannels,
  AnyChannel,
  FlatSamples,
  Vec2,
  Encoding,
  Image,
  LayerAttributes
} from 'exrjs';

const width = 512;
const height = 512;

// F16 color channels (save space)
const redData = new Float32Array(width * height);
const greenData = new Float32Array(width * height);
const blueData = new Float32Array(width * height);

// F32 depth channel (need precision)
const depthData = new Float32Array(width * height);

// U32 ID channel
const idData = new Uint32Array(width * height);

// Fill data...

const channels = new AnyChannels([
  new AnyChannel('R', FlatSamples.f16(redData)),
  new AnyChannel('G', FlatSamples.f16(greenData)),
  new AnyChannel('B', FlatSamples.f16(blueData)),
  new AnyChannel('Z', FlatSamples.f32(depthData)),
  new AnyChannel('ID', FlatSamples.u32(idData))
]);

const layer = Layer.create(
  new Vec2(width, height),
  channels,
  Encoding.FAST_LOSSLESS,
  LayerAttributes.default()
);

const image = Image.fromLayer(layer);
await image.write().toFile('mixed_precision.exr');
```

## Custom Data Windows

Create images with offset data windows:

```javascript
import {
  Image,
  Layer,
  SpecificChannels,
  Vec2,
  IntegerBounds,
  Encoding,
  ImageAttributes,
  LayerAttributes
} from 'exrjs';

const width = 512;
const height = 512;

// Display window (full frame)
const displayWindow = new IntegerBounds(
  new Vec2(0, 0),
  new Vec2(1920, 1080)
);

// Data window (actual rendered region)
const dataWindow = new IntegerBounds(
  new Vec2(100, 100),  // Offset from origin
  new Vec2(width, height)
);

const channels = SpecificChannels.rgba(pixels);

const layer = new Layer(
  new Vec2(width, height),
  new LayerAttributes(dataWindow, 'main'),
  Encoding.FAST_LOSSLESS,
  channels
);

const attributes = new ImageAttributes(displayWindow);
const image = new Image(attributes, [layer]);

await image.write().toFile('offset_window.exr');
```

## Tiling Strategies

Different tiling approaches for different use cases:

```javascript
import { EXRWriter, Compression, Encoding, Blocks, Vec2, LineOrder } from 'exrjs';

const writer = new EXRWriter(4096, 4096);

// Small tiles (64x64) - Better compression, slower random access
writer.addLayer('small_tiles')
  .rgba(pixels1)
  .compression(Compression.PIZ)
  .tiled(64, 64)
  .end();

// Large tiles (256x256) - Faster access, less compression
writer.addLayer('large_tiles')
  .rgba(pixels2)
  .compression(Compression.PIZ)
  .tiled(256, 256)
  .end();

// Non-square tiles - Match access patterns
writer.addLayer('wide_tiles')
  .rgba(pixels3)
  .compression(Compression.PIZ)
  .tiled(128, 64)  // Wide tiles for horizontal scanning
  .end();

await writer.write('tiling_strategies.exr');
```

## Memory-Efficient Large Images

Generate very large images without loading all data in memory:

```javascript
import {
  Image,
  Layer,
  SpecificChannels,
  Vec2,
  Encoding,
  Compression,
  Blocks,
  LineOrder
} from 'exrjs';

const width = 16384;
const height = 16384;

// Use callback for lazy generation
const pixels = (index) => {
  // Generate pixels on-demand
  const x = index % width;
  const y = Math.floor(index / width);
  return [
    Math.sin(x * 0.001) * 0.5 + 0.5,
    Math.cos(y * 0.001) * 0.5 + 0.5,
    0.5,
    1.0
  ];
};

// Use scanlines (not tiles) for sequential generation
const encoding = new Encoding(
  Compression.ZIP16,
  Blocks.ScanLines,
  LineOrder.Increasing
);

const channels = SpecificChannels.rgba(pixels);
const image = Image.fromChannels(new Vec2(width, height), channels, encoding);

// Pixels are generated and compressed in chunks
await image.write().toFile('huge_image.exr');
```

## Per-Channel Compression

Different compression per channel (via separate layers):

```javascript
import { EXRWriter, Compression, SampleType } from 'exrjs';

const writer = new EXRWriter(width, height);

// Beauty: PIZ for best ratio
writer.addLayer('beauty')
  .rgba(beautyPixels)
  .compression(Compression.PIZ)
  .sampleType(SampleType.F16)
  .end();

// Normal: ZIP16 (geometric data)
writer.addLayer('normal')
  .rgb(normalPixels)
  .compression(Compression.ZIP16)
  .sampleType(SampleType.F16)
  .end();

// Depth: PXR24 (lossy but good for depth)
writer.addLayer('depth')
  .channel('Z', SampleType.F32, depthData)
  .compression(Compression.PXR24)
  .end();

// IDs: RLE (great for flat areas)
writer.addLayer('objectId')
  .channel('ID', SampleType.U32, idData)
  .compression(Compression.RLE)
  .end();

await writer.write('optimized.exr');
```

## Line Order Optimization

Choose line order for your access pattern:

```javascript
import { Encoding, Compression, Blocks, LineOrder } from 'exrjs';

// Top-to-bottom (default, most compatible)
const increasingOrder = new Encoding(
  Compression.ZIP16,
  Blocks.ScanLines,
  LineOrder.Increasing
);

// Bottom-to-top (matches OpenGL framebuffers)
const decreasingOrder = new Encoding(
  Compression.ZIP16,
  Blocks.ScanLines,
  LineOrder.Decreasing
);

// Unspecified (for tiled images)
const unspecifiedOrder = new Encoding(
  Compression.ZIP16,
  Blocks.Tiles(new Vec2(64, 64)),
  LineOrder.Unspecified
);
```

## Image Metadata

While exrjs focuses on writing pixel data, you can specify layer attributes:

```javascript
import { Layer, SpecificChannels, Vec2, Encoding, IntegerBounds, LayerAttributes } from 'exrjs';

const width = 512;
const height = 512;

// Custom layer attributes
const dataWindow = IntegerBounds.fromDimensions(width, height);
const attributes = new LayerAttributes(dataWindow, 'main_layer');

const layer = new Layer(
  new Vec2(width, height),
  attributes,
  Encoding.FAST_LOSSLESS,
  SpecificChannels.rgba(pixels)
);
```

## Batch Processing

Generate multiple EXR files efficiently:

```javascript
import { EXRWriter, Compression } from 'exrjs';

async function batchGenerate(frames) {
  for (let i = 0; i < frames; i++) {
    const writer = new EXRWriter(1920, 1080);

    writer.addLayer('beauty')
      .rgba((index) => generateFrame(i, index))
      .compression(Compression.PIZ)
      .end();

    await writer.write(`frame_${i.toString().padStart(4, '0')}.exr`);

    console.log(`Generated frame ${i + 1}/${frames}`);
  }
}

function generateFrame(frameNum, pixelIndex) {
  // Generate animated content
  const x = pixelIndex % 1920;
  const y = Math.floor(pixelIndex / 1920);
  const t = frameNum / 60; // Time in seconds

  return [
    Math.sin(x * 0.01 + t) * 0.5 + 0.5,
    Math.cos(y * 0.01 + t) * 0.5 + 0.5,
    Math.sin((x + y) * 0.01 + t) * 0.5 + 0.5,
    1.0
  ];
}

await batchGenerate(120); // 2 seconds at 60fps
```

## Testing and Validation

Validate your EXR files:

```javascript
import { writeRgbaFile } from 'exrjs';
import { execSync } from 'child_process';

async function generateAndValidate() {
  // Generate EXR
  await writeRgbaFile('test.exr', 512, 512, (i) => [0.5, 0.5, 0.5, 1.0]);

  // Validate with exrheader (if available)
  try {
    const info = execSync('exrheader test.exr', { encoding: 'utf8' });
    console.log('EXR Info:', info);

    // Check for specific attributes
    if (!info.includes('channels')) {
      throw new Error('Invalid EXR: missing channels');
    }

    console.log('Validation passed!');
  } catch (error) {
    console.error('Validation failed:', error.message);
  }
}

await generateAndValidate();
```

## Performance Monitoring

Monitor generation performance:

```javascript
import { EXRWriter, Compression } from 'exrjs';

async function generateWithTiming(width, height) {
  const startTime = performance.now();

  const writer = new EXRWriter(width, height);

  const pixelGenStart = performance.now();
  writer.addLayer('beauty')
    .rgba((index) => {
      // Your pixel generation
      return [0.5, 0.5, 0.5, 1.0];
    })
    .compression(Compression.PIZ)
    .end();

  const writeStart = performance.now();
  const buffer = await writer.write();
  const endTime = performance.now();

  console.log(`Setup: ${(pixelGenStart - startTime).toFixed(2)}ms`);
  console.log(`Pixel generation + compression: ${(writeStart - pixelGenStart).toFixed(2)}ms`);
  console.log(`Write: ${(endTime - writeStart).toFixed(2)}ms`);
  console.log(`Total: ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`File size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Pixels/sec: ${((width * height) / ((endTime - startTime) / 1000)).toFixed(0)}`);

  return buffer;
}

await generateWithTiming(2048, 2048);
```

## Tips and Best Practices

1. **Choose the right API level**
   - Simple API for basic images
   - Builder API for multi-layer files
   - Low-level API for maximum control

2. **Memory management**
   - Use callbacks for very large images
   - Use Float32Array for better performance
   - Reuse typed arrays when generating multiple images

3. **Compression selection**
   - PIZ: Best ratio, slower
   - ZIP16: Good balance
   - RLE: Fast, good for masks
   - NONE: Fastest, largest files

4. **Precision vs size**
   - F16 is usually enough for color
   - F32 for geometric/depth data
   - U32 for IDs

5. **Tiling**
   - Use tiles for random access
   - Larger tiles = faster, less compression
   - Always use tiles with mip maps
