# Browser Usage

Complete guide for using exr-js in web browsers.

## Basic Setup

### ES Modules

```html
<!DOCTYPE html>
<html>
<head>
  <title>EXR Writer Demo</title>
</head>
<body>
  <button id="generate">Generate EXR</button>
  <canvas id="preview" width="512" height="512"></canvas>

  <script type="module">
    import { writeRgbaFile } from './path/to/exr-js/dist/exr-js.browser.js';

    document.getElementById('generate').addEventListener('click', async () => {
      const width = 512;
      const height = 512;

      // Generate pixel data
      const buffer = await writeRgbaFile(null, width, height, (index) => {
        const x = index % width;
        const y = Math.floor(index / width);
        return [x / width, y / height, 0.5, 1.0];
      });

      // Trigger download
      downloadFile(buffer, 'gradient.exr');
    });

    function downloadFile(buffer, filename) {
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>
```

### With Build Tools (Webpack, Vite, etc.)

```javascript
// main.js
import { EXRWriter, Compression } from 'exr-js';

async function generateEXR() {
  const width = 512;
  const height = 512;

  const writer = new EXRWriter(width, height);

  writer.addLayer('beauty')
    .rgba((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return [x / width, y / height, 0.5, 1.0];
    })
    .compression(Compression.ZIP16)
    .end();

  const buffer = await writer.write();

  // Download
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'render.exr';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('btn').addEventListener('click', generateEXR);
```

## Canvas to EXR

Export canvas content as EXR:

```javascript
import { writeRgbaFile } from 'exr-js';

async function canvasToEXR(canvas, filename) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = new Float32Array(canvas.width * canvas.height * 4);

  // Convert from Uint8 [0-255] to Float32 [0-1]
  for (let i = 0; i < imageData.data.length; i++) {
    pixels[i] = imageData.data[i] / 255;
  }

  const buffer = await writeRgbaFile(null, canvas.width, canvas.height, pixels);

  // Download
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Usage
const canvas = document.getElementById('myCanvas');
await canvasToEXR(canvas, 'canvas-export.exr');
```

## WebGL to EXR

Export WebGL framebuffer as EXR:

```javascript
import { writeRgbaFile, Encoding, Compression, Blocks, LineOrder } from 'exr-js';

async function webglToEXR(gl, width, height, filename) {
  // Read pixels from WebGL context
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Convert to Float32Array and flip Y (OpenGL has origin at bottom-left)
  const floatPixels = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = (y * width + x) * 4;
      const dstIndex = ((height - 1 - y) * width + x) * 4;
      floatPixels[dstIndex] = pixels[srcIndex] / 255;
      floatPixels[dstIndex + 1] = pixels[srcIndex + 1] / 255;
      floatPixels[dstIndex + 2] = pixels[srcIndex + 2] / 255;
      floatPixels[dstIndex + 3] = pixels[srcIndex + 3] / 255;
    }
  }

  // Use PIZ compression for better quality
  const encoding = new Encoding(Compression.PIZ, Blocks.ScanLines, LineOrder.Increasing);
  const buffer = await writeRgbaFile(null, width, height, floatPixels, encoding);

  // Download
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Usage
const canvas = document.getElementById('webglCanvas');
const gl = canvas.getContext('webgl2');
await webglToEXR(gl, canvas.width, canvas.height, 'render.exr');
```

## Three.js Integration

Export Three.js render as EXR:

```javascript
import * as THREE from 'three';
import { writeRgbaFile } from 'exr-js';

class EXRExporter {
  constructor(renderer) {
    this.renderer = renderer;
  }

  async export(scene, camera, filename) {
    const width = this.renderer.domElement.width;
    const height = this.renderer.domElement.height;

    // Render the scene
    this.renderer.render(scene, camera);

    // Read pixels
    const gl = this.renderer.getContext();
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Convert and flip Y
    const floatPixels = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIndex = (y * width + x) * 4;
        const dstIndex = ((height - 1 - y) * width + x) * 4;
        floatPixels[dstIndex] = pixels[srcIndex] / 255;
        floatPixels[dstIndex + 1] = pixels[srcIndex + 1] / 255;
        floatPixels[dstIndex + 2] = pixels[srcIndex + 2] / 255;
        floatPixels[dstIndex + 3] = pixels[srcIndex + 3] / 255;
      }
    }

    const buffer = await writeRgbaFile(null, width, height, floatPixels);
    this.download(buffer, filename);
  }

  download(buffer, filename) {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Usage
const exporter = new EXRExporter(renderer);
await exporter.export(scene, camera, 'scene.exr');
```

## Multi-Pass Three.js Export

Export multiple render targets:

```javascript
import * as THREE from 'three';
import { EXRWriter, Compression, SampleType } from 'exr-js';

async function exportMultiPass(renderer, scene, camera, width, height) {
  // Setup render targets
  const beautyTarget = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.FloatType
  });

  const normalTarget = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.FloatType
  });

  // Render beauty pass
  renderer.setRenderTarget(beautyTarget);
  renderer.render(scene, camera);

  // Switch to normal material and render
  const originalMaterials = [];
  scene.traverse((obj) => {
    if (obj.isMesh) {
      originalMaterials.push(obj.material);
      obj.material = new THREE.MeshNormalMaterial();
    }
  });

  renderer.setRenderTarget(normalTarget);
  renderer.render(scene, camera);

  // Restore materials
  let index = 0;
  scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.material = originalMaterials[index++];
    }
  });

  renderer.setRenderTarget(null);

  // Read pixels from both targets
  const beautyPixels = readRenderTarget(renderer, beautyTarget);
  const normalPixels = readRenderTarget(renderer, normalTarget);

  // Create multi-layer EXR
  const writer = new EXRWriter(width, height);

  writer.addLayer('beauty')
    .rgba(beautyPixels)
    .compression(Compression.PIZ)
    .sampleType(SampleType.F16)
    .end();

  writer.addLayer('normal')
    .rgb(normalPixels)
    .compression(Compression.ZIP16)
    .end();

  const buffer = await writer.write();

  // Download
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'multipass.exr';
  a.click();
  URL.revokeObjectURL(url);

  // Cleanup
  beautyTarget.dispose();
  normalTarget.dispose();
}

function readRenderTarget(renderer, renderTarget) {
  const width = renderTarget.width;
  const height = renderTarget.height;
  const pixels = new Uint8Array(width * height * 4);

  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

  const floatPixels = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = (y * width + x) * 4;
      const dstIndex = ((height - 1 - y) * width + x) * 4;
      floatPixels[dstIndex] = pixels[srcIndex] / 255;
      floatPixels[dstIndex + 1] = pixels[srcIndex + 1] / 255;
      floatPixels[dstIndex + 2] = pixels[srcIndex + 2] / 255;
      floatPixels[dstIndex + 3] = pixels[srcIndex + 3] / 255;
    }
  }

  return floatPixels;
}
```

## Compression Library Setup

For full compression support in browsers, include pako:

### Via CDN

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"></script>
<script type="module" src="your-app.js"></script>
```

### Via NPM

```bash
npm install pako
```

```javascript
// Your bundler will include pako automatically
import { EXRWriter, Compression } from 'exr-js';

// ZIP compression will work in browser
writer.addLayer('beauty')
  .rgba(pixels)
  .compression(Compression.ZIP16)  // Requires pako
  .end();
```

### Fallback Without Pako

```javascript
import { EXRWriter, Compression } from 'exr-js';

try {
  const writer = new EXRWriter(width, height);

  writer.addLayer('beauty')
    .rgba(pixels)
    .compression(Compression.ZIP16)
    .end();

  const buffer = await writer.write();
  // Success
} catch (error) {
  if (error.message.includes('pako') || error.message.includes('compression')) {
    console.warn('ZIP compression not available, falling back to uncompressed');

    // Retry with no compression
    const writer = new EXRWriter(width, height);

    writer.addLayer('beauty')
      .rgba(pixels)
      .compression(Compression.NONE)
      .end();

    const buffer = await writer.write();
  } else {
    throw error;
  }
}
```

## Progress Indicator

Show progress for large images:

```javascript
import { EXRWriter, Compression } from 'exr-js';

async function generateWithProgress(width, height, onProgress) {
  const totalPixels = width * height;
  let processedPixels = 0;

  const pixels = (index) => {
    processedPixels++;
    if (processedPixels % 10000 === 0) {
      onProgress(processedPixels / totalPixels);
    }

    const x = index % width;
    const y = Math.floor(index / width);
    return [x / width, y / height, 0.5, 1.0];
  };

  const writer = new EXRWriter(width, height);
  writer.addLayer('beauty').rgba(pixels).compression(Compression.PIZ).end();

  onProgress(1.0);
  return await writer.write();
}

// Usage
const progressBar = document.getElementById('progress');
const buffer = await generateWithProgress(4096, 4096, (progress) => {
  progressBar.value = progress * 100;
  progressBar.textContent = `${Math.round(progress * 100)}%`;
});
```

## Web Worker for Background Processing

Offload EXR generation to a worker:

```javascript
// worker.js
import { EXRWriter, Compression } from 'exr-js';

self.onmessage = async (e) => {
  const { width, height, pixelData } = e.data;

  const writer = new EXRWriter(width, height);
  writer.addLayer('beauty')
    .rgba(pixelData)
    .compression(Compression.PIZ)
    .end();

  const buffer = await writer.write();

  self.postMessage({ buffer }, [buffer]);
};
```

```javascript
// main.js
const worker = new Worker('worker.js', { type: 'module' });

function generateEXRInWorker(width, height, pixelData) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      resolve(e.data.buffer);
    };

    worker.onerror = reject;

    worker.postMessage({
      width,
      height,
      pixelData: pixelData.buffer
    }, [pixelData.buffer]);
  });
}

// Usage
const pixels = new Float32Array(512 * 512 * 4);
// ... fill pixels ...

const buffer = await generateEXRInWorker(512, 512, pixels);

// Download
const blob = new Blob([buffer], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'render.exr';
a.click();
URL.revokeObjectURL(url);
```

## Browser Compatibility

exr-js works in all modern browsers that support:

- ES6 modules
- TypedArrays (Float32Array, Uint32Array, etc.)
- ArrayBuffer
- Async/await

Tested browsers:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Tips for Browsers

1. **Use Float32Array** - Much faster than callbacks for large images
2. **Use Web Workers** - Offload processing to avoid blocking UI
3. **Show progress** - For images > 1 megapixel, show progress indicator
4. **Limit resolution** - Consider max 4K (4096x2160) for browser exports
5. **Test compression** - PIZ is slower but gives smaller files for download
