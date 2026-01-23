// Simple test to write an uncompressed EXR file

import { test, expect } from 'vitest';
import { Image, Layer, SpecificChannels, Encoding, Vec2 } from '../src/index.js';
import { writeFileSync } from 'fs';

test('write simple uncompressed EXR file', () => {
  // Create a simple 64x64 gradient image
  const width = 64;
  const height = 64;

  // Generate RGBA pixels
  function getPixel(index) {
    const x = index % width;
    const y = Math.floor(index / width);
    return [
      x / width,           // R: horizontal gradient
      y / height,          // G: vertical gradient
      0.5,                 // B: constant
      1.0                  // A: fully opaque
    ];
  }

  // Create image using the simple API
  const channels = SpecificChannels.rgba(getPixel);
  const image = Image.fromChannels(new Vec2(width, height), channels, Encoding.UNCOMPRESSED);

  // Write to buffer
  const buffer = image.write().toArrayBuffer();

  // Save to file
  writeFileSync('test/outputs/test-output.exr', new Uint8Array(buffer));

  console.log(`Wrote ${buffer.byteLength} bytes to test/outputs/test-output.exr`);

  // Verify magic number
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  console.log(`Magic number: 0x${magic.toString(16)} (expected: 0x1312f76)`);
  expect(magic).toBe(0x1312f76);

  // Verify version
  const version = view.getUint32(4, true);
  console.log(`Version: ${version & 0xff}, flags: 0x${(version >> 8).toString(16)}`);
  expect(version & 0xff).toBe(2);
});
