// Tests for reading tiled EXR files

import { test, expect } from 'vitest';
import { EXRReader, readRgbaFile } from '../src/index.js';

test('read tiled single-layer EXR', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-builder-single.exr');

  expect(reader.isTiled(0)).toBe(true);
  expect(reader.getWidth()).toBeGreaterThan(0);
  expect(reader.getHeight()).toBeGreaterThan(0);

  // Read pixel data
  const pixels = reader.readRgba();
  expect(pixels.length).toBe(reader.getWidth() * reader.getHeight() * 4);
});

test('read tiled EXR with simple API', async () => {
  const result = await readRgbaFile('test/outputs/test-builder-single.exr');

  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(result.pixels.length).toBe(result.width * result.height * 4);
});

// TODO: Mipmap/ripmap reading requires filtering to level 0 chunks only
test.skip('read mipmap EXR', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-mipmap-down.exr');

  expect(reader.isTiled(0)).toBe(true);
  expect(reader.getWidth()).toBeGreaterThan(0);
  expect(reader.getHeight()).toBeGreaterThan(0);

  // Can read the base level
  const pixels = reader.readRgba();
  expect(pixels.length).toBe(reader.getWidth() * reader.getHeight() * 4);
});

// TODO: Mipmap/ripmap reading requires filtering to level 0 chunks only
test.skip('read ripmap EXR', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-ripmap.exr');

  expect(reader.isTiled(0)).toBe(true);

  // Can read the base level
  const pixels = reader.readRgba();
  expect(pixels.length).toBe(reader.getWidth() * reader.getHeight() * 4);
});
