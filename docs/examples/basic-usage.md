# Basic Usage Examples

This guide covers common use cases for exrjs.

## Simple Gradient Image

Create a basic RGB gradient image:

```javascript
import { writeRgbFile } from 'exrjs';

const width = 512;
const height = 512;

await writeRgbFile('gradient.exr', width, height, (index) => {
  const x = index % width;
  const y = Math.floor(index / width);
  return [
    x / width,      // Red increases left to right
    y / height,     // Green increases top to bottom
    0.5             // Blue constant
  ];
});
```

## Solid Color Image

Create an image with a single color:

```javascript
import { writeRgbaFile } from 'exrjs';

// Pure red image
await writeRgbaFile('red.exr', 256, 256, () => [1, 0, 0, 1]);

// 50% gray
await writeRgbaFile('gray.exr', 256, 256, () => [0.5, 0.5, 0.5, 1]);
```

## Using Float32Array

For better performance with large images, use typed arrays:

```javascript
import { writeRgbaFile } from 'exrjs';

const width = 1920;
const height = 1080;
const pixels = new Float32Array(width * height * 4);

// Fill with checkerboard pattern
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const checker = ((x >> 5) + (y >> 5)) & 1;
    pixels[index] = checker;     // R
    pixels[index + 1] = checker; // G
    pixels[index + 2] = checker; // B
    pixels[index + 3] = 1.0;     // A
  }
}

await writeRgbaFile('checker.exr', width, height, pixels);
```

## Procedural Patterns

### Checkerboard

```javascript
import { writeRgbFile } from 'exrjs';

const size = 512;
const checkSize = 32;

await writeRgbFile('checkerboard.exr', size, size, (index) => {
  const x = index % size;
  const y = Math.floor(index / size);
  const value = ((Math.floor(x / checkSize) + Math.floor(y / checkSize)) & 1) ? 1 : 0;
  return [value, value, value];
});
```

### Radial Gradient

```javascript
import { writeRgbaFile } from 'exrjs';

const size = 512;
const center = size / 2;
const maxDist = Math.sqrt(center * center + center * center);

await writeRgbaFile('radial.exr', size, size, (index) => {
  const x = index % size;
  const y = Math.floor(index / size);
  const dx = x - center;
  const dy = y - center;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const value = 1 - Math.min(dist / maxDist, 1);
  return [value, value, value, 1];
});
```

### Circle

```javascript
import { writeRgbaFile } from 'exrjs';

const size = 512;
const center = size / 2;
const radius = 200;

await writeRgbaFile('circle.exr', size, size, (index) => {
  const x = index % size;
  const y = Math.floor(index / size);
  const dx = x - center;
  const dy = y - center;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const isInside = dist <= radius;
  return isInside ? [1, 0, 0, 1] : [0, 0, 0, 1];
});
```

## Different Compression Methods

### Fastest Writing (No Compression)

```javascript
import { writeRgbaFile, Encoding, Compression } from 'exrjs';

const encoding = new Encoding(Compression.NONE, Blocks.ScanLines, LineOrder.Increasing);
await writeRgbaFile('fast.exr', width, height, pixels, encoding);
```

### Best Compression

```javascript
import { writeRgbaFile, Encoding, Compression, Blocks, LineOrder } from 'exrjs';

const encoding = new Encoding(Compression.PIZ, Blocks.ScanLines, LineOrder.Increasing);
await writeRgbaFile('small.exr', width, height, pixels, encoding);
```

### Balanced (Recommended)

```javascript
import { writeRgbaFile, Encoding } from 'exrjs';

// Uses ZIP16 compression by default
await writeRgbaFile('output.exr', width, height, pixels, Encoding.FAST_LOSSLESS);
```

## HDR Images

Create images with high dynamic range values:

```javascript
import { writeRgbFile } from 'exrjs';

const width = 512;
const height = 512;

await writeRgbFile('hdr.exr', width, height, (index) => {
  const x = index % width;
  const y = Math.floor(index / height);

  // Simulate a bright light source in center
  const centerX = width / 2;
  const centerY = height / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Values can go beyond 1.0 for HDR
  const intensity = Math.max(0, 10.0 / (dist + 1));

  return [intensity, intensity * 0.9, intensity * 0.8];
});
```

## Using Different Sample Types

### Half Precision (F16) for Memory Efficiency

```javascript
import { EXRWriter, SampleType } from 'exrjs';

const writer = new EXRWriter(512, 512);

writer.addLayer('main')
  .rgba(pixels)
  .sampleType(SampleType.F16)  // 16-bit per channel
  .end();

await writer.write('half.exr');
```

### Full Precision (F32)

```javascript
writer.addLayer('main')
  .rgba(pixels)
  .sampleType(SampleType.F32)  // 32-bit per channel (default)
  .end();
```

## Tiled Images

Use tiled storage for random access or mip maps:

```javascript
import { EXRWriter, Compression } from 'exrjs';

const writer = new EXRWriter(1024, 1024);

writer.addLayer('main')
  .rgba(pixels)
  .compression(Compression.ZIP16)
  .tiled(64, 64)  // 64x64 pixel tiles
  .end();

await writer.write('tiled.exr');
```

## Reading Back Pixel Index

Calculate pixel coordinates from flat index:

```javascript
import { writeRgbaFile } from 'exrjs';

const width = 512;
const height = 512;

await writeRgbaFile('indexed.exr', width, height, (index) => {
  // Convert flat index to 2D coordinates
  const x = index % width;
  const y = Math.floor(index / width);

  // Or use both
  const color = index / (width * height);

  return [x / width, y / height, color, 1];
});
```

## Binary Mask

Create a binary alpha mask:

```javascript
import { writeRgbaFile } from 'exrjs';

const size = 512;

await writeRgbaFile('mask.exr', size, size, (index) => {
  const x = index % size;
  const y = Math.floor(index / size);

  // Circle mask
  const dx = x - size / 2;
  const dy = y - size / 2;
  const alpha = (dx * dx + dy * dy) < (size / 4) * (size / 4) ? 1 : 0;

  return [1, 1, 1, alpha];
});
```

## Perlin-like Noise Pattern

```javascript
import { writeRgbFile } from 'exrjs';

// Simple hash-based noise
function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const size = 512;

await writeRgbFile('noise.exr', size, size, (index) => {
  const x = index % size;
  const y = Math.floor(index / size);
  const value = noise(x / 50, y / 50);
  return [value, value, value];
});
```

## Color Temperature

Convert color temperature (Kelvin) to RGB:

```javascript
import { writeRgbFile } from 'exrjs';

function kelvinToRGB(kelvin) {
  const temp = kelvin / 100;
  let r, g, b;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  return [
    Math.max(0, Math.min(1, r / 255)),
    Math.max(0, Math.min(1, g / 255)),
    Math.max(0, Math.min(1, b / 255))
  ];
}

const width = 512;
const height = 256;

await writeRgbFile('temperature.exr', width, height, (index) => {
  const x = index % width;
  // Map x coordinate to temperature range (1000K to 12000K)
  const kelvin = 1000 + (x / width) * 11000;
  return kelvinToRGB(kelvin);
});
```

## Best Practices

1. **Use Float32Array for large images** - Much faster than callbacks
2. **Choose appropriate compression** - PIZ for natural images, ZIP16 for general use
3. **Use F16 when possible** - Half the file size with minimal quality loss
4. **Tile large images** - Better for random access and mip maps
5. **Validate dimensions** - Ensure width and height are positive integers
