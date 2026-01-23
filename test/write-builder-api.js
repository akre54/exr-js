// Test the EXRWriter builder API

import { test, expect } from 'vitest';
import { EXRWriter, Compression, SampleType } from '../src/index.js';
import { writeFileSync } from 'fs';

const width = 256;
const height = 256;

test('EXRWriter single layer RGBA with builder', () => {
  const writer = new EXRWriter(width, height);

  writer.addLayer('main')
    .rgba((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return [x / width, y / height, 0.5, 1.0];
    })
    .compression(Compression.ZIP16)
    .end();

  const buffer = writer.encode();
  const filename = 'test/outputs/test-builder-single.exr';

  writeFileSync(filename, new Uint8Array(buffer));
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`);

  expect(buffer.byteLength).toBeGreaterThan(0);

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  expect(magic).toBe(0x1312f76);
});

test('EXRWriter multi-layer render passes', () => {
  const writer = new EXRWriter(width, height);

  // Beauty pass (RGBA)
  writer.addLayer('beauty')
    .rgba((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return [x / width, y / height, 0.5, 1.0];
    })
    .compression(Compression.PIZ)
    .tiled(64, 64)
    .end();

  // Normal pass (RGB)
  writer.addLayer('normal')
    .rgb((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      const nx = (x / width) * 2 - 1;
      const ny = (y / height) * 2 - 1;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      return [nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz];
    })
    .compression(Compression.ZIP16)
    .scanlines()
    .end();

  // Depth pass (single F32 channel)
  const depthData = new Float32Array(width * height);
  for (let i = 0; i < depthData.length; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    depthData[i] = (x + y) / (width + height);
  }

  writer.addLayer('depth')
    .channel('Z', SampleType.F32, depthData)
    .compression(Compression.PXR24)
    .end();

  // Object ID pass (single U32 channel)
  const idData = new Uint32Array(width * height);
  for (let i = 0; i < idData.length; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    idData[i] = ((x >> 4) & 0xF) | (((y >> 4) & 0xF) << 4); // Object ID grid
  }

  writer.addLayer('objectId')
    .channel('ID', SampleType.U32, idData)
    .compression(Compression.RLE)
    .end();

  const buffer = writer.encode();
  const filename = 'test/outputs/test-builder-multilayer.exr';

  writeFileSync(filename, new Uint8Array(buffer));
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`);

  expect(buffer.byteLength).toBeGreaterThan(0);

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  expect(magic).toBe(0x1312f76);
});
