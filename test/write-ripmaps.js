// Test writing EXR files with rip maps

import { test, expect } from 'vitest';
import { Image, Layer, SpecificChannels, Encoding, Vec2, Compression, Blocks, LineOrder, RoundingMode } from '../src/index.js';
import { writeFileSync } from 'fs';

const width = 128;
const height = 64; // Non-square to show rip map behavior

// Generate RGBA pixels with a pattern
function getPixel(index) {
  const x = index % width;
  const y = Math.floor(index / width);

  const r = x / width;
  const g = y / height;
  const b = ((x + y) % 16) / 16;
  const a = 1.0;

  return [r, g, b, a];
}

test('write ripmap EXR with RoundDown (non-square)', () => {
  const channels = SpecificChannels.rgba(getPixel);
  const encoding = new Encoding(
    Compression.ZIP16,
    Blocks.RipMaps(new Vec2(32, 32), RoundingMode.Down),
    LineOrder.Unspecified
  );
  const image = Image.fromChannels(new Vec2(width, height), channels, encoding);

  const buffer = image.write().toArrayBuffer();
  const filename = 'test/outputs/test-ripmap.exr';

  writeFileSync(filename, new Uint8Array(buffer));
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`);

  // Calculate expected levels
  // X: 128 -> 64 -> 32 -> 16 -> 8 -> 4 -> 2 -> 1 = 8 levels
  // Y: 64 -> 32 -> 16 -> 8 -> 4 -> 2 -> 1 = 7 levels
  console.log(`  Expected X levels: 8 (128 down to 1)`);
  console.log(`  Expected Y levels: 7 (64 down to 1)`);

  expect(buffer.byteLength).toBeGreaterThan(0);

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  expect(magic).toBe(0x1312f76);
});

test('write square ripmap EXR (64x64)', () => {
  const w = 64;
  const h = 64;
  function getPixelSquare(index) {
    const x = index % w;
    const y = Math.floor(index / w);
    return [x / w, y / h, 0.5, 1.0];
  }

  const channels = SpecificChannels.rgba(getPixelSquare);
  const encoding = new Encoding(
    Compression.RLE,
    Blocks.RipMaps(new Vec2(16, 16), RoundingMode.Down),
    LineOrder.Unspecified
  );
  const image = Image.fromChannels(new Vec2(w, h), channels, encoding);

  const buffer = image.write().toArrayBuffer();
  const filename = 'test/outputs/test-ripmap-square.exr';

  writeFileSync(filename, new Uint8Array(buffer));
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`);

  expect(buffer.byteLength).toBeGreaterThan(0);

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  expect(magic).toBe(0x1312f76);
});
