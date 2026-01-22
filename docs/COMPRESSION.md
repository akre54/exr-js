# Compression Guide

Comprehensive guide to compression methods in exrjs.

## Overview

OpenEXR supports 8 compression methods, each with different trade-offs between file size, compression speed, and image quality.

```javascript
import { Compression } from 'exrjs';

Compression.NONE    // No compression
Compression.RLE     // Run-length encoding
Compression.ZIP1    // Zlib, 1 scanline
Compression.ZIP16   // Zlib, 16 scanlines
Compression.PIZ     // Wavelet + Huffman
Compression.PXR24   // Float32 to 24-bit
Compression.B44     // 4x4 block compression
Compression.B44A    // B44 with flat area optimization
```

## Compression Comparison

| Method | Type | Ratio | Speed | Best For |
|--------|------|-------|-------|----------|
| NONE | Lossless | 1.0x | Fastest | Temporary files, network transfer |
| RLE | Lossless | 1.2-2x | Fast | Masks, solid colors |
| ZIP1 | Lossless | 2-4x | Medium | General purpose, small images |
| ZIP16 | Lossless | 2-4x | Medium | General purpose, best balance |
| PIZ | Lossless | 2-5x | Slow | Natural images, best ratio |
| PXR24 | Lossy | 2-3x | Fast | Depth, positions (acceptable loss) |
| B44 | Lossy | Fixed 2.28x | Very Fast | Half-float images, real-time |
| B44A | Lossy | Variable | Very Fast | B44 with flat areas |

## Detailed Method Guide

### NONE - No Compression

No compression applied. Maximum write speed, largest files.

**Use cases:**
- Temporary/intermediate files
- Network transfer (compress at transport layer)
- Maximum write speed required
- Testing compression effectiveness

**Characteristics:**
- Lossless
- Fastest write speed
- Largest file size
- All sample types supported

**Example:**
```javascript
import { writeRgbaFile, Encoding, Compression, Blocks, LineOrder } from 'exrjs';

const encoding = new Encoding(Compression.NONE, Blocks.ScanLines, LineOrder.Increasing);
await writeRgbaFile('uncompressed.exr', width, height, pixels, encoding);
```

**Performance:**
- Write: 500+ MP/s (pixels per second)
- File size: ~100% of uncompressed

---

### RLE - Run-Length Encoding

Simple compression that encodes runs of identical bytes.

**Use cases:**
- Alpha masks
- Object ID passes
- Binary masks
- Images with large solid-color areas
- UI elements with flat colors

**Characteristics:**
- Lossless
- Fast compression and decompression
- Works well with flat areas
- Poor compression for noisy images
- All sample types supported

**How it works:**
- Encodes sequences of identical bytes as (value, count)
- Applied after byte interleaving and differencing

**Example:**
```javascript
import { EXRWriter, Compression, SampleType } from 'exrjs';

const writer = new EXRWriter(width, height);

// Good for masks
const maskData = new Float32Array(width * height);
// ... fill with mostly 0s and 1s ...

writer.addLayer('mask')
  .channel('A', SampleType.F32, maskData)
  .compression(Compression.RLE)
  .end();

await writer.write('mask.exr');
```

**Performance:**
- Write: 200-400 MP/s
- Compression ratio: 1.2x (noisy) to 10x+ (flat areas)

---

### ZIP1 - Zlib (1 Scanline)

Standard zlib compression applied to each scanline independently.

**Use cases:**
- Small images (< 1000 pixels wide)
- Images where random scanline access is important
- Quick compression with decent ratio

**Characteristics:**
- Lossless
- Medium compression speed
- Good random access (per scanline)
- Less compression than ZIP16
- All sample types supported

**How it works:**
1. Interleave channel bytes
2. Apply delta encoding (predict from previous pixel)
3. Compress each scanline with zlib

**Example:**
```javascript
import { EXRWriter, Compression } from 'exrjs';

const writer = new EXRWriter(512, 512);

writer.addLayer('main')
  .rgba(pixels)
  .compression(Compression.ZIP1)
  .end();

await writer.write('zip1.exr');
```

**Performance:**
- Write: 50-150 MP/s
- Compression ratio: 2-4x

---

### ZIP16 - Zlib (16 Scanlines)

Zlib compression applied to groups of 16 scanlines.

**Use cases:**
- **Recommended default** for most images
- General-purpose compression
- Best balance of speed and ratio
- Standard for production work

**Characteristics:**
- Lossless
- Medium compression speed
- Better ratio than ZIP1
- Good decompression speed
- All sample types supported

**How it works:**
- Same as ZIP1 but groups 16 scanlines
- Better compression due to more data per block
- Exploits vertical correlation

**Example:**
```javascript
import { writeRgbaFile, Encoding } from 'exrjs';

// ZIP16 is the default in FAST_LOSSLESS
await writeRgbaFile('output.exr', width, height, pixels, Encoding.FAST_LOSSLESS);

// Or explicitly
import { Compression, Blocks, LineOrder } from 'exrjs';
const encoding = new Encoding(Compression.ZIP16, Blocks.ScanLines, LineOrder.Increasing);
await writeRgbaFile('output.exr', width, height, pixels, encoding);
```

**Performance:**
- Write: 50-150 MP/s
- Compression ratio: 2-4x

**Why choose ZIP16:**
- Industry standard
- Well-supported
- Good compression/speed balance
- Reliable across all image types

---

### PIZ - Wavelet + Huffman

Advanced compression using Haar wavelet transform and Huffman coding.

**Use cases:**
- Final delivery of beauty passes
- Natural/photographic images
- Film/VFX production
- When file size matters most
- Archival storage

**Characteristics:**
- Lossless
- Best compression ratio
- Slower compression (2-3x slower than ZIP16)
- Good decompression speed
- F16 and F32 only (not U32)

**How it works:**
1. Apply Haar wavelet transform
2. Quantize wavelet coefficients
3. Huffman encode
4. Apply zlib to final data

**Example:**
```javascript
import { EXRWriter, Compression, SampleType } from 'exrjs';

const writer = new EXRWriter(1920, 1080);

writer.addLayer('beauty')
  .rgba(beautyPixels)
  .compression(Compression.PIZ)
  .sampleType(SampleType.F16)  // PIZ works best with F16
  .tiled(64, 64)
  .end();

await writer.write('beauty.exr');
```

**Performance:**
- Write: 20-60 MP/s
- Compression ratio: 2-5x (up to 10x for grainy images)

**Tips:**
- Use for final renders
- Pairs well with F16 sample type
- Worth the extra time for delivery files
- Best for images with grain/noise

---

### PXR24 - Float32 to 24-bit

Converts 32-bit floats to 24-bit representation, then applies zlib.

**Use cases:**
- Depth passes
- Position/normal passes (world space)
- Data where slight precision loss is acceptable
- Geometric AOVs

**Characteristics:**
- **Lossy** for F32 data
- Lossless for F16 and U32
- Good compression ratio for geometric data
- Fast compression/decompression
- Small precision loss in F32

**How it works:**
- Converts F32 to F24 (loses 8 bits)
- Maintains full range
- Reduces mantissa precision
- Applies zlib compression

**Precision loss:**
- F32: 24 bits mantissa → 16 bits mantissa
- Still ~5 decimal digits precision
- Negligible for most use cases

**Example:**
```javascript
import { EXRWriter, Compression, SampleType } from 'exrjs';

const writer = new EXRWriter(width, height);

// Depth pass (precision loss acceptable)
const depthData = new Float32Array(width * height);
// ... fill depth ...

writer.addLayer('depth')
  .channel('Z', SampleType.F32, depthData)
  .compression(Compression.PXR24)
  .end();

// World position (slight loss acceptable)
writer.addLayer('position')
  .rgb(positionPixels)
  .compression(Compression.PXR24)
  .sampleType(SampleType.F32)
  .end();

await writer.write('geometric.exr');
```

**Performance:**
- Write: 80-200 MP/s
- Compression ratio: 2-3x

**When NOT to use:**
- Final beauty passes
- Data requiring full F32 precision
- When absolutely lossless required

---

### B44 - 4x4 Block Compression

Fixed-rate compression for half-float (F16) images.

**Use cases:**
- Real-time playback
- Film dailies
- Preview renders
- Constant bit-rate requirements
- Fast decompression needed

**Characteristics:**
- **Lossy** for F16 data
- Lossless for F32 and U32
- Fixed compression ratio (2.28:1)
- Very fast decompression
- Some visible artifacts in smooth gradients

**How it works:**
- Divides image into 4x4 blocks
- Converts each block to 14-bit integers
- Fixed 32 bytes per block
- Full-precision values stored uncompressed

**Quality:**
- Noticeable quality loss in smooth areas
- Better in noisy/detailed areas
- Acceptable for preview/dailies

**Example:**
```javascript
import { EXRWriter, Compression, SampleType } from 'exrjs';

const writer = new EXRWriter(1920, 1080);

writer.addLayer('preview')
  .rgba(pixels)
  .compression(Compression.B44)
  .sampleType(SampleType.F16)  // B44 compresses F16
  .end();

await writer.write('preview.exr');
```

**Performance:**
- Write: 150-300 MP/s
- Compression ratio: Fixed 2.28:1
- Decompression: Very fast

---

### B44A - B44 with Flat Area Optimization

B44 with improved handling of flat (constant value) areas.

**Use cases:**
- Same as B44, but better for:
- Images with large solid-color areas
- UI overlays
- Mattes with smooth areas
- Film dailies with graphics

**Characteristics:**
- Same as B44
- Better compression in flat areas
- Detects constant 4x4 blocks
- Stores single value instead of 32 bytes

**How it works:**
- Same as B44
- Additionally checks if 4x4 block is constant
- If constant: store single value
- Variable compression ratio (better than B44)

**Example:**
```javascript
import { EXRWriter, Compression, SampleType } from 'exrjs';

const writer = new EXRWriter(1920, 1080);

writer.addLayer('dailies')
  .rgba(pixels)
  .compression(Compression.B44A)
  .sampleType(SampleType.F16)
  .end();

await writer.write('dailies.exr');
```

**Performance:**
- Write: 150-300 MP/s
- Compression ratio: 2.28:1 to 10:1 (depends on flat areas)

**Choose B44A over B44 when:**
- Images have solid-color regions
- Want better compression on mixed content
- No downside vs B44

---

## Choosing Compression

### Decision Tree

```
Does it need to be lossless?
├─ NO
│  └─ Need fixed bitrate?
│     ├─ YES → B44 or B44A
│     └─ NO → PXR24 (if geometric data) or PIZ
└─ YES
   └─ Need maximum speed?
      ├─ YES → NONE or RLE
      └─ NO
         └─ Need best ratio?
            ├─ YES → PIZ
            └─ NO → ZIP16 (recommended default)
```

### By Use Case

**Final Production Renders:**
```javascript
writer.addLayer('beauty')
  .rgba(pixels)
  .compression(Compression.PIZ)
  .sampleType(SampleType.F16)
  .end();
```

**Work-in-Progress / Dailies:**
```javascript
writer.addLayer('wip')
  .rgba(pixels)
  .compression(Compression.ZIP16)
  .end();
```

**Real-Time Preview:**
```javascript
writer.addLayer('preview')
  .rgba(pixels)
  .compression(Compression.B44A)
  .sampleType(SampleType.F16)
  .end();
```

**Geometric Passes:**
```javascript
// Normals (can tolerate slight loss)
writer.addLayer('normal')
  .rgb(normalPixels)
  .compression(Compression.PXR24)
  .end();

// Depth (loss acceptable)
writer.addLayer('depth')
  .channel('Z', SampleType.F32, depthData)
  .compression(Compression.PXR24)
  .end();
```

**Masks and IDs:**
```javascript
// Alpha mask
writer.addLayer('mask')
  .channel('A', SampleType.F32, maskData)
  .compression(Compression.RLE)
  .end();

// Object IDs
writer.addLayer('objectId')
  .channel('ID', SampleType.U32, idData)
  .compression(Compression.RLE)
  .end();
```

**Multi-Layer Production File:**
```javascript
const writer = new EXRWriter(width, height);

// Beauty: best lossless ratio
writer.addLayer('beauty')
  .rgba(beauty)
  .compression(Compression.PIZ)
  .sampleType(SampleType.F16)
  .end();

// Lighting passes: good balance
writer.addLayer('diffuse').rgb(diffuse).compression(Compression.ZIP16).end();
writer.addLayer('specular').rgb(specular).compression(Compression.ZIP16).end();

// Geometric: lossy acceptable
writer.addLayer('normal').rgb(normal).compression(Compression.PXR24).end();
writer.addLayer('position').rgb(position).compression(Compression.PXR24).end();

// Depth: lossy acceptable
writer.addLayer('depth')
  .channel('Z', SampleType.F32, depth)
  .compression(Compression.PXR24)
  .end();

// IDs: RLE for flat areas
writer.addLayer('objectId')
  .channel('ID', SampleType.U32, ids)
  .compression(Compression.RLE)
  .end();
```

---

## Performance Benchmarks

Approximate performance on modern hardware (2023+):

### Write Speed (MP/s - Million Pixels per Second)

| Method | 1K (1024²) | 2K (2048²) | 4K (4096²) |
|--------|-----------|-----------|-----------|
| NONE   | 600       | 550       | 500       |
| RLE    | 300       | 280       | 250       |
| ZIP1   | 120       | 100       | 80        |
| ZIP16  | 130       | 110       | 90        |
| PIZ    | 50        | 40        | 35        |
| PXR24  | 180       | 150       | 120       |
| B44    | 280       | 250       | 220       |
| B44A   | 270       | 240       | 210       |

### Compression Ratio (vs uncompressed)

| Method | Beauty | Normals | Depth | IDs |
|--------|--------|---------|-------|-----|
| NONE   | 1.0x   | 1.0x    | 1.0x  | 1.0x |
| RLE    | 1.2x   | 1.5x    | 1.8x  | 8.0x |
| ZIP1   | 2.5x   | 2.8x    | 3.2x  | 5.0x |
| ZIP16  | 3.0x   | 3.2x    | 3.5x  | 5.5x |
| PIZ    | 4.0x   | 3.8x    | 4.5x  | N/A |
| PXR24  | 2.8x   | 3.0x    | 3.5x  | 1.0x |
| B44    | 2.28x  | 2.28x   | 1.0x  | 1.0x |
| B44A   | 3.5x   | 3.0x    | 1.0x  | 1.0x |

---

## Browser Considerations

Some compression methods require additional libraries in browsers:

### Native (Always Available)
- NONE
- RLE
- PIZ
- B44
- B44A

### Require Zlib (pako)
- ZIP1
- ZIP16
- PXR24

**Setup:**
```html
<!-- Include pako for zlib support -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"></script>
```

Or via npm:
```bash
npm install pako
```

**Fallback handling:**
```javascript
import { EXRWriter, Compression } from 'exrjs';

let compression = Compression.ZIP16;

// Check if zlib is available
if (typeof window !== 'undefined' && !window.pako) {
  console.warn('pako not available, using PIZ instead');
  compression = Compression.PIZ;  // Native, no dependencies
}

writer.addLayer('beauty')
  .rgba(pixels)
  .compression(compression)
  .end();
```

---

## Tips and Best Practices

1. **Default to ZIP16** - Best balance for most use cases
2. **Use PIZ for finals** - Worth the extra time for delivery
3. **PXR24 for geometric data** - Depth, positions, normals
4. **RLE for IDs** - Excellent compression for object/material IDs
5. **F16 with PIZ** - Best compression, usually sufficient precision
6. **Test your data** - Different images compress differently
7. **Consider pipeline** - Match compression to downstream tools
8. **Profile performance** - Measure for your specific use case

## Common Mistakes

**Don't:**
- Use NONE for production storage (wastes space)
- Use PIZ for temporary files (too slow)
- Use B44 for final beauty (visible artifacts)
- Use PXR24 for final renders (lossy)
- Mix incompatible compression with sample types

**Do:**
- Choose compression per pass (different passes benefit from different methods)
- Use appropriate sample types (F16 for color, F32 for precision, U32 for IDs)
- Test file sizes and quality
- Consider decompression speed for tools
- Document compression choices in pipeline

---

## Further Reading

- [OpenEXR Technical Introduction](http://www.openexr.com/documentation.html)
- [OpenEXR File Layout](http://www.openexr.com/InterpretingDeepPixels.pdf)
- Study the exrjs test files for real-world examples
