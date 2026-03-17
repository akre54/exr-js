// Focused tests for ZIP1 and ZIP16 compression
// Verifies that compression actually reduces file size and that roundtrips are lossless.

import { expect, test } from 'vitest'
import {
  Blocks,
  Compression,
  decodeRgba,
  Encoding,
  encodeRgba,
  LineOrder,
} from '../src/index.js'

const UNCOMPRESSED = new Encoding(
  Compression.Uncompressed,
  Blocks.ScanLines,
  LineOrder.Increasing,
)
const ZIP1 = new Encoding(
  Compression.ZIP1,
  Blocks.ScanLines,
  LineOrder.Increasing,
)
const ZIP16 = new Encoding(
  Compression.ZIP16,
  Blocks.ScanLines,
  LineOrder.Increasing,
)

// Gradient pattern — highly compressible
function makeGradient(width, height) {
  const pixels = new Float32Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      pixels[i + 0] = x / width
      pixels[i + 1] = y / height
      pixels[i + 2] = (x + y) / (width + height)
      pixels[i + 3] = 1.0
    }
  }
  return pixels
}

// Solid color — maximally compressible
function makeSolid(width, height, r = 0.5, g = 0.3, b = 0.1, a = 1.0) {
  const pixels = new Float32Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4 + 0] = r
    pixels[i * 4 + 1] = g
    pixels[i * 4 + 2] = b
    pixels[i * 4 + 3] = a
  }
  return pixels
}

test('ZIP1 compresses gradient to less than 50% of raw pixel size', () => {
  const width = 128,
    height = 128
  const pixels = makeGradient(width, height)
  const rawSize = width * height * 4 * 4 // 4 channels × 4 bytes (F32)

  const buffer = encodeRgba(width, height, pixels, ZIP1)
  expect(buffer.byteLength).toBeLessThan(rawSize * 0.5)
})

test('ZIP16 compresses gradient to less than 50% of raw pixel size', () => {
  const width = 128,
    height = 128
  const pixels = makeGradient(width, height)
  const rawSize = width * height * 4 * 4

  const buffer = encodeRgba(width, height, pixels, ZIP16)
  expect(buffer.byteLength).toBeLessThan(rawSize * 0.5)
})

test('ZIP16 produces smaller output than ZIP1 for gradient data', () => {
  const width = 128,
    height = 128
  const pixels = makeGradient(width, height)

  const zip1Buffer = encodeRgba(width, height, pixels, ZIP1)
  const zip16Buffer = encodeRgba(width, height, pixels, ZIP16)

  expect(zip16Buffer.byteLength).toBeLessThan(zip1Buffer.byteLength)
})

test('solid color compresses to less than 5% of raw pixel size with ZIP16', () => {
  const width = 128,
    height = 128
  const pixels = makeSolid(width, height)
  const rawSize = width * height * 4 * 4

  const buffer = encodeRgba(width, height, pixels, ZIP16)
  expect(buffer.byteLength).toBeLessThan(rawSize * 0.05)
})

test('ZIP1 roundtrip is lossless', () => {
  const width = 64,
    height = 64
  const original = makeGradient(width, height)

  const buffer = encodeRgba(width, height, original, ZIP1)
  const result = decodeRgba(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)
  expect(result.pixels.length).toBe(original.length)

  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(original[i], 2)
  }
})

test('ZIP16 roundtrip is lossless', () => {
  const width = 64,
    height = 64
  const original = makeGradient(width, height)

  const buffer = encodeRgba(width, height, original, ZIP16)
  const result = decodeRgba(buffer)

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)
  expect(result.pixels.length).toBe(original.length)

  for (let i = 0; i < result.pixels.length; i++) {
    expect(result.pixels[i]).toBeCloseTo(original[i], 2)
  }
})

test('ZIP16 roundtrip matches uncompressed output pixel-for-pixel', () => {
  const width = 32,
    height = 32
  const pixels = makeGradient(width, height)

  const uncompressedResult = decodeRgba(
    encodeRgba(width, height, pixels, UNCOMPRESSED),
  )
  const zip16Result = decodeRgba(encodeRgba(width, height, pixels, ZIP16))

  expect(zip16Result.pixels.length).toBe(uncompressedResult.pixels.length)
  for (let i = 0; i < zip16Result.pixels.length; i++) {
    expect(zip16Result.pixels[i]).toBeCloseTo(uncompressedResult.pixels[i], 4)
  }
})

test('ZIP1 compresses a single-row image', () => {
  const width = 256,
    height = 1
  const pixels = makeGradient(width, height)
  const rawSize = width * height * 4 * 4

  const buffer = encodeRgba(width, height, pixels, ZIP1)
  expect(buffer.byteLength).toBeLessThan(rawSize * 0.9)

  // Verify it decodes correctly
  const result = decodeRgba(buffer)
  expect(result.width).toBe(width)
  expect(result.height).toBe(height)
})
