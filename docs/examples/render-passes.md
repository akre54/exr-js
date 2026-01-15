# Render Passes (AOVs)

Guide for creating multi-layer EXR files with render passes (Arbitrary Output Variables).

## Basic Multi-Layer EXR

Create an EXR with multiple render passes:

```javascript
import { EXRWriter, Compression, SampleType } from 'exr-js';

const width = 1920;
const height = 1080;

const writer = new EXRWriter(width, height);

// Beauty pass (final rendered image)
writer.addLayer('beauty')
  .rgba(beautyPixels)
  .compression(Compression.PIZ)
  .end();

// Diffuse pass
writer.addLayer('diffuse')
  .rgb(diffusePixels)
  .compression(Compression.ZIP16)
  .end();

// Specular pass
writer.addLayer('specular')
  .rgb(specularPixels)
  .compression(Compression.ZIP16)
  .end();

await writer.write('render_passes.exr');
```

## Common Render Passes

### Beauty + Normals + Depth

```javascript
import { EXRWriter, Compression, SampleType } from 'exr-js';

const writer = new EXRWriter(width, height);

// Beauty (RGBA)
writer.addLayer('beauty')
  .rgba((index) => {
    // Your beauty pass calculation
    return [r, g, b, a];
  })
  .compression(Compression.PIZ)
  .tiled(64, 64)
  .end();

// World space normals (RGB)
writer.addLayer('normal')
  .rgb((index) => {
    // Normalized world-space normals
    // Map from [-1, 1] to [0, 1] for storage
    return [
      nx * 0.5 + 0.5,
      ny * 0.5 + 0.5,
      nz * 0.5 + 0.5
    ];
  })
  .compression(Compression.ZIP16)
  .end();

// Depth (single F32 channel)
const depthData = new Float32Array(width * height);
// Fill depthData with depth values...

writer.addLayer('depth')
  .channel('Z', SampleType.F32, depthData)
  .compression(Compression.PXR24)
  .end();

await writer.write('scene.exr');
```

## Full Production Setup

Complete render pass setup for VFX/compositing:

```javascript
import { EXRWriter, Compression, SampleType } from 'exr-js';

const width = 2048;
const height = 1556;

const writer = new EXRWriter(width, height);

// ==================
// Beauty/Final Color
// ==================
writer.addLayer('beauty')
  .rgba(beautyPixels)
  .compression(Compression.PIZ)
  .tiled(64, 64)
  .sampleType(SampleType.F16)
  .end();

// ==================
// Lighting Passes
// ==================

// Diffuse direct
writer.addLayer('diffuse_direct')
  .rgb(diffuseDirectPixels)
  .compression(Compression.PIZ)
  .end();

// Diffuse indirect
writer.addLayer('diffuse_indirect')
  .rgb(diffuseIndirectPixels)
  .compression(Compression.PIZ)
  .end();

// Specular direct
writer.addLayer('specular_direct')
  .rgb(specularDirectPixels)
  .compression(Compression.PIZ)
  .end();

// Specular indirect
writer.addLayer('specular_indirect')
  .rgb(specularIndirectPixels)
  .compression(Compression.PIZ)
  .end();

// Emission
writer.addLayer('emission')
  .rgb(emissionPixels)
  .compression(Compression.PIZ)
  .end();

// ==================
// Geometric Passes
// ==================

// World position
writer.addLayer('position')
  .rgb(positionPixels)
  .compression(Compression.ZIP16)
  .sampleType(SampleType.F32)
  .end();

// World normal
writer.addLayer('normal')
  .rgb(normalPixels)
  .compression(Compression.ZIP16)
  .end();

// UV coordinates
writer.addLayer('uv')
  .rgb((index) => {
    const [u, v] = getUV(index);
    return [u, v, 0];
  })
  .compression(Compression.ZIP16)
  .end();

// ==================
// Utility Passes
// ==================

// Depth
const depthData = new Float32Array(width * height);
// ... fill depth data ...

writer.addLayer('depth')
  .channel('Z', SampleType.F32, depthData)
  .compression(Compression.PXR24)
  .end();

// Object ID
const idData = new Uint32Array(width * height);
// ... fill object IDs ...

writer.addLayer('objectId')
  .channel('ID', SampleType.U32, idData)
  .compression(Compression.RLE)
  .end();

// Material ID
const matIdData = new Uint32Array(width * height);
// ... fill material IDs ...

writer.addLayer('materialId')
  .channel('ID', SampleType.U32, matIdData)
  .compression(Compression.RLE)
  .end();

// ==================
// Alpha/Matte Passes
// ==================

// Alpha
const alphaData = new Float32Array(width * height);
// ... fill alpha ...

writer.addLayer('alpha')
  .channel('A', SampleType.F32, alphaData)
  .compression(Compression.ZIP16)
  .end();

// Shadow matte
writer.addLayer('shadow_matte')
  .rgb(shadowMattePixels)
  .compression(Compression.ZIP16)
  .end();

await writer.write('full_render.exr');
```

## Per-Light Passes

Separate passes for individual lights:

```javascript
import { EXRWriter, Compression } from 'exr-js';

const lights = ['keyLight', 'fillLight', 'rimLight', 'envLight'];

const writer = new EXRWriter(width, height);

// Add beauty pass
writer.addLayer('beauty')
  .rgba(beautyPixels)
  .compression(Compression.PIZ)
  .end();

// Add per-light passes
for (const lightName of lights) {
  const lightData = getLightContribution(lightName);

  writer.addLayer(`light_${lightName}`)
    .rgb(lightData)
    .compression(Compression.PIZ)
    .end();
}

await writer.write('per_light.exr');
```

## Motion Vectors

Store motion vectors for motion blur or temporal effects:

```javascript
import { EXRWriter, Compression, SampleType } from 'exr-js';

const writer = new EXRWriter(width, height);

// Beauty pass
writer.addLayer('beauty')
  .rgba(beautyPixels)
  .compression(Compression.PIZ)
  .end();

// Motion vectors (screen-space velocity)
writer.addLayer('motion')
  .rgb((index) => {
    const [vx, vy] = getMotionVector(index);
    // Motion vectors can be positive or negative
    // Store as-is (can be outside 0-1 range)
    return [vx, vy, 0];
  })
  .compression(Compression.ZIP16)
  .sampleType(SampleType.F32)
  .end();

await writer.write('with_motion.exr');
```

## Cryptomatte

Store Cryptomatte data for object selection:

```javascript
import { EXRWriter, Compression, SampleType } from 'exr-js';

const writer = new EXRWriter(width, height);

// Beauty
writer.addLayer('beauty')
  .rgba(beautyPixels)
  .compression(Compression.PIZ)
  .end();

// Cryptomatte object layers
// Each rank stores object ID and coverage
for (let rank = 0; rank < 2; rank++) {
  const id00 = new Float32Array(width * height);
  const id01 = new Float32Array(width * height);
  const id02 = new Float32Array(width * height);
  const id03 = new Float32Array(width * height);

  // Fill with cryptomatte hash values and coverage
  // ... cryptomatte calculation ...

  writer.addLayer(`cryptomatte_${rank:02d}`)
    .channel('R', SampleType.F32, id00)
    .channel('G', SampleType.F32, id01)
    .channel('B', SampleType.F32, id02)
    .channel('A', SampleType.F32, id03)
    .compression(Compression.ZIP16)
    .end();
}

await writer.write('cryptomatte.exr');
```

## Denoising Passes

AOVs commonly used by AI denoisers:

```javascript
import { EXRWriter, Compression, SampleType } from 'exr-js';

const writer = new EXRWriter(width, height);

// Noisy beauty
writer.addLayer('beauty')
  .rgba(noisyBeautyPixels)
  .compression(Compression.PIZ)
  .sampleType(SampleType.F16)
  .end();

// Albedo (for denoiser)
writer.addLayer('albedo')
  .rgb(albedoPixels)
  .compression(Compression.ZIP16)
  .end();

// Normal (for denoiser)
writer.addLayer('normal')
  .rgb(normalPixels)
  .compression(Compression.ZIP16)
  .end();

// Optional: variance/feature passes
writer.addLayer('variance')
  .rgb(variancePixels)
  .compression(Compression.ZIP16)
  .end();

await writer.write('for_denoising.exr');
```

## Real-Time Rendering AOVs

Typical passes from a real-time renderer:

```javascript
import { EXRWriter, Compression, SampleType } from 'exr-js';

const writer = new EXRWriter(1920, 1080);

// HDR color buffer
writer.addLayer('color')
  .rgba(colorBuffer)
  .compression(Compression.PIZ)
  .sampleType(SampleType.F16)
  .end();

// Screen-space normals
writer.addLayer('normal')
  .rgb(normalBuffer)
  .compression(Compression.ZIP16)
  .end();

// Linear depth
const depthBuffer = new Float32Array(1920 * 1080);
// ... extract from depth buffer ...

writer.addLayer('depth')
  .channel('Z', SampleType.F32, depthBuffer)
  .compression(Compression.PXR24)
  .end();

// Metallic-roughness
writer.addLayer('material')
  .rgb((index) => {
    const metallic = getMetallic(index);
    const roughness = getRoughness(index);
    return [metallic, roughness, 0];
  })
  .compression(Compression.ZIP16)
  .end();

// Emissive
writer.addLayer('emissive')
  .rgb(emissiveBuffer)
  .compression(Compression.PIZ)
  .end();

await writer.write('gbuffer.exr');
```

## Layer Naming Conventions

Industry-standard layer names:

```javascript
// Color passes
'beauty'           // Final composite
'diffuse'          // Diffuse color
'specular'         // Specular/reflection
'reflection'       // Reflections only
'refraction'       // Refractions only
'emission'         // Emissive/self-illumination
'sss'              // Sub-surface scattering
'volume'           // Volumetric contribution

// Lighting
'direct'           // Direct lighting
'indirect'         // Indirect/GI lighting
'ao'               // Ambient occlusion
'light_<name>'     // Per-light contribution

// Geometric
'position'         // World position
'normal'           // Surface normal
'tangent'          // Tangent vector
'uv'               // UV coordinates
'depth'            // Depth/Z-depth

// Utility
'alpha'            // Alpha/transparency
'shadow'           // Shadow pass
'objectId'         // Object/instance ID
'materialId'       // Material/shader ID
'motion'           // Motion vectors

// Cryptomatte
'cryptomatte_00'   // Cryptomatte rank 0
'cryptomatte_01'   // Cryptomatte rank 1

// Denoising
'albedo'           // Surface albedo
'variance'         // Pixel variance
```

## Optimizing Multi-Layer Files

### Choose Compression Per Pass

Different passes benefit from different compression:

```javascript
// Natural images: PIZ (best ratio)
writer.addLayer('beauty').rgba(pixels).compression(Compression.PIZ).end();

// Geometric data: ZIP16 (good balance)
writer.addLayer('normal').rgb(pixels).compression(Compression.ZIP16).end();

// IDs/masks: RLE (fast for flat areas)
writer.addLayer('objectId').channel('ID', SampleType.U32, ids).compression(Compression.RLE).end();

// Float precision data: PXR24 (lossy but good for positions/depth)
writer.addLayer('position').rgb(pixels).compression(Compression.PXR24).end();
```

### Use Appropriate Sample Types

```javascript
// Beauty: F16 usually sufficient
writer.addLayer('beauty').rgba(pixels).sampleType(SampleType.F16).end();

// Normals: F16 works well
writer.addLayer('normal').rgb(pixels).sampleType(SampleType.F16).end();

// Positions/depth: Use F32 for precision
writer.addLayer('position').rgb(pixels).sampleType(SampleType.F32).end();

// IDs: Always U32
writer.addLayer('objectId').channel('ID', SampleType.U32, ids).end();
```

### Tile for Random Access

```javascript
// Tile large images for better random access in compositing
writer.addLayer('beauty')
  .rgba(pixels)
  .tiled(64, 64)
  .compression(Compression.PIZ)
  .end();
```

## Tips for Production

1. **Consistent naming** - Use standard layer names for tool compatibility
2. **Beauty first** - Put beauty pass as first layer for quick previews
3. **Group related passes** - Keep lighting passes together, geometric passes together
4. **Document custom passes** - Add metadata for non-standard passes
5. **Test file sizes** - Balance quality and disk space with compression choices
6. **Validate in compositing software** - Test files open correctly in Nuke, After Effects, etc.
