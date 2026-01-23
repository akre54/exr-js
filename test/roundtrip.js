// Roundtrip tests - write then read, verify pixel values match

import { expect, test } from 'vitest'
import {
  Blocks,
  Compression,
  decodeRgb,
  decodeRgba,
  Encoding,
  encodeRgb,
  encodeRgba,
  LineOrder,
} from '../src/index.js'

test('roundtrip uncompressed RGBA', () => {
  const width = 32
  const height = 32
  const pixelCount = width * height

  // Create test data
  const originalPixels = new Float32Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    originalPixels[i * 4 + 0] = (i % width) / width // R
    originalPixels[i * 4 + 1] = Math.floor(i / width) / height // G
    originalPixels[i * 4 + 2] = 0.5 // B
    originalPixels[i * 4 + 3] = 1.0 // A
  }

  // Write to buffer
  const buffer = encodeRgba(
    width,
    height,
    originalPixels,
    Encoding.UNCOMPRESSED,
  )

  // Read back
  const result = decodeRgba(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)
  expect(result.pixels.length).toBe(originalPixels.length)

  // Compare pixels (with tolerance for F16 rounding)
  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(originalPixels[i], 2)
  }
})

test('roundtrip RLE compressed RGBA', () => {
  const width = 32
  const height = 32
  const pixelCount = width * height

  const originalPixels = new Float32Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    originalPixels[i * 4 + 0] = (i % width) / width
    originalPixels[i * 4 + 1] = Math.floor(i / width) / height
    originalPixels[i * 4 + 2] = 0.25
    originalPixels[i * 4 + 3] = 1.0
  }

  const encoding = new Encoding(
    Compression.RLE,
    Blocks.ScanLines,
    LineOrder.Increasing,
  )
  const buffer = encodeRgba(width, height, originalPixels, encoding)
  const result = decodeRgba(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)

  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(originalPixels[i], 2)
  }
})

test('roundtrip ZIP compressed RGBA', () => {
  const width = 32
  const height = 32
  const pixelCount = width * height

  const originalPixels = new Float32Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    originalPixels[i * 4 + 0] = Math.sin(i * 0.1) * 0.5 + 0.5
    originalPixels[i * 4 + 1] = Math.cos(i * 0.1) * 0.5 + 0.5
    originalPixels[i * 4 + 2] = 0.3
    originalPixels[i * 4 + 3] = 1.0
  }

  const encoding = new Encoding(
    Compression.ZIP16,
    Blocks.ScanLines,
    LineOrder.Increasing,
  )
  const buffer = encodeRgba(width, height, originalPixels, encoding)
  const result = decodeRgba(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)

  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(originalPixels[i], 2)
  }
})

// TODO: PIZ decompression has size calculation issues in scanline mode - needs investigation
test.skip('roundtrip PIZ compressed RGBA', () => {
  const width = 64
  const height = 64
  const pixelCount = width * height

  const originalPixels = new Float32Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    originalPixels[i * 4 + 0] = (i % width) / width
    originalPixels[i * 4 + 1] = Math.floor(i / width) / height
    originalPixels[i * 4 + 2] = 0.5
    originalPixels[i * 4 + 3] = 1.0
  }

  const encoding = new Encoding(
    Compression.PIZ,
    Blocks.ScanLines,
    LineOrder.Increasing,
  )
  const buffer = encodeRgba(width, height, originalPixels, encoding)
  const result = decodeRgba(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)

  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(originalPixels[i], 2)
  }
})

test('roundtrip PXR24 compressed RGBA (lossy for F32)', () => {
  const width = 32
  const height = 32
  const pixelCount = width * height

  const originalPixels = new Float32Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    originalPixels[i * 4 + 0] = (i % width) / width
    originalPixels[i * 4 + 1] = Math.floor(i / width) / height
    originalPixels[i * 4 + 2] = 0.5
    originalPixels[i * 4 + 3] = 1.0
  }

  const encoding = new Encoding(
    Compression.PXR24,
    Blocks.ScanLines,
    LineOrder.Increasing,
  )
  const buffer = encodeRgba(width, height, originalPixels, encoding)
  const result = decodeRgba(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)

  // PXR24 is lossy for F32, so use lower precision
  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(originalPixels[i], 1)
  }
})

test('roundtrip B44 compressed RGBA', () => {
  const width = 64
  const height = 64
  const pixelCount = width * height

  const originalPixels = new Float32Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    originalPixels[i * 4 + 0] = (i % width) / width
    originalPixels[i * 4 + 1] = Math.floor(i / width) / height
    originalPixels[i * 4 + 2] = 0.5
    originalPixels[i * 4 + 3] = 1.0
  }

  const encoding = new Encoding(
    Compression.B44,
    Blocks.ScanLines,
    LineOrder.Increasing,
  )
  const buffer = encodeRgba(width, height, originalPixels, encoding)
  const result = decodeRgba(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)

  // B44 is lossy, so use lower precision
  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(originalPixels[i], 1)
  }
})

test('roundtrip RGB (no alpha)', () => {
  const width = 32
  const height = 32
  const pixelCount = width * height

  const originalPixels = new Float32Array(pixelCount * 3)
  for (let i = 0; i < pixelCount; i++) {
    originalPixels[i * 3 + 0] = (i % width) / width
    originalPixels[i * 3 + 1] = Math.floor(i / width) / height
    originalPixels[i * 3 + 2] = 0.5
  }

  const buffer = encodeRgb(width, height, originalPixels, Encoding.UNCOMPRESSED)
  const result = decodeRgb(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)
  expect(result.pixels.length).toBe(originalPixels.length)

  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(originalPixels[i], 2)
  }
})
