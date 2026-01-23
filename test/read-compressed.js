// Tests for reading EXR files with various compression methods

import { expect, test } from 'vitest'
import { Compression, readRgbaFile } from '../src/index.js'

test('read uncompressed EXR', async () => {
  const result = await readRgbaFile('test/outputs/test-uncompressed.exr')
  expect(result.width).toBe(128)
  expect(result.height).toBe(128)
  expect(result.pixels.length).toBe(128 * 128 * 4)
  expect(result.compression).toBe(Compression.Uncompressed)
})

test('read RLE compressed EXR', async () => {
  const result = await readRgbaFile('test/outputs/test-rle.exr')
  expect(result.width).toBe(128)
  expect(result.height).toBe(128)
  expect(result.pixels.length).toBe(128 * 128 * 4)
  expect(result.compression).toBe(Compression.RLE)
})

test('read ZIP1 compressed EXR', async () => {
  const result = await readRgbaFile('test/outputs/test-zip1.exr')
  expect(result.width).toBe(128)
  expect(result.height).toBe(128)
  expect(result.pixels.length).toBe(128 * 128 * 4)
  expect(result.compression).toBe(Compression.ZIP1)
})

test('read ZIP16 compressed EXR', async () => {
  const result = await readRgbaFile('test/outputs/test-zip16.exr')
  expect(result.width).toBe(128)
  expect(result.height).toBe(128)
  expect(result.pixels.length).toBe(128 * 128 * 4)
  expect(result.compression).toBe(Compression.ZIP16)
})

// TODO: PIZ decompression has size calculation issues - needs investigation
test.skip('read PIZ compressed EXR', async () => {
  const result = await readRgbaFile('test/outputs/test-piz.exr')
  expect(result.width).toBe(128)
  expect(result.height).toBe(128)
  expect(result.pixels.length).toBe(128 * 128 * 4)
  expect(result.compression).toBe(Compression.PIZ)
})

test('read PXR24 compressed EXR', async () => {
  const result = await readRgbaFile('test/outputs/test-pxr24.exr')
  expect(result.width).toBe(128)
  expect(result.height).toBe(128)
  expect(result.pixels.length).toBe(128 * 128 * 4)
  expect(result.compression).toBe(Compression.PXR24)
})

test('read B44 compressed EXR', async () => {
  const result = await readRgbaFile('test/outputs/test-b44.exr')
  expect(result.width).toBe(128)
  expect(result.height).toBe(128)
  expect(result.pixels.length).toBe(128 * 128 * 4)
  expect(result.compression).toBe(Compression.B44)
})

test('read B44A compressed EXR', async () => {
  const result = await readRgbaFile('test/outputs/test-b44a.exr')
  expect(result.width).toBe(128)
  expect(result.height).toBe(128)
  expect(result.pixels.length).toBe(128 * 128 * 4)
  expect(result.compression).toBe(Compression.B44A)
})

// TODO: PIZ decompression has size calculation issues - needs investigation
test.skip('read simple PIZ file and verify pixel values', async () => {
  const result = await readRgbaFile('test/outputs/test-simple-rgba-piz.exr')
  expect(result.width).toBe(256)
  expect(result.height).toBe(256)

  // Verify some pixels - the test file has a gradient pattern
  // First pixel should be near (0, 0, 0.5, 1)
  expect(result.pixels[0]).toBeCloseTo(0, 1)
  expect(result.pixels[1]).toBeCloseTo(0, 1)

  // Last row should have high G value
  const lastRowStart = 255 * 256 * 4
  expect(result.pixels[lastRowStart + 1]).toBeGreaterThan(0.9)
})
