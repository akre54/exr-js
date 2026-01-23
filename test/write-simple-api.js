// Test the simple encodeRgba/encodeRgb API

import { writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  Blocks,
  Compression,
  Encoding,
  encodeRgb,
  encodeRgba,
  LineOrder,
  Vec2,
} from '../src/index.js'

const width = 256
const height = 256

test('encodeRgba with callback', () => {
  const buffer = encodeRgba(width, height, (index) => {
    const x = index % width
    const y = Math.floor(index / width)
    return [x / width, y / height, 0.5, 1.0]
  })

  const filename = 'test/outputs/test-simple-rgba-callback.exr'
  writeFileSync(filename, new Uint8Array(buffer))
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})

test('encodeRgba with Float32Array', () => {
  const pixels = new Float32Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const x = i % width
    const y = Math.floor(i / width)
    pixels[i * 4] = x / width // R
    pixels[i * 4 + 1] = y / height // G
    pixels[i * 4 + 2] = 0.5 // B
    pixels[i * 4 + 3] = 1.0 // A
  }

  const buffer = encodeRgba(width, height, pixels)

  const filename = 'test/outputs/test-simple-rgba-array.exr'
  writeFileSync(filename, new Uint8Array(buffer))
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})

test('encodeRgb', () => {
  const buffer = encodeRgb(width, height, (index) => {
    const x = index % width
    const y = Math.floor(index / width)
    return [x / width, y / height, 0.5]
  })

  const filename = 'test/outputs/test-simple-rgb.exr'
  writeFileSync(filename, new Uint8Array(buffer))
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})

test('encodeRgba with custom encoding (PIZ)', () => {
  const encoding = new Encoding(
    Compression.PIZ,
    Blocks.Tiles(new Vec2(64, 64)),
    LineOrder.Unspecified,
  )

  const buffer = encodeRgba(
    width,
    height,
    (index) => {
      const x = index % width
      const y = Math.floor(index / width)
      return [x / width, y / height, 0.5, 1.0]
    },
    encoding,
  )

  const filename = 'test/outputs/test-simple-rgba-piz.exr'
  writeFileSync(filename, new Uint8Array(buffer))
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})
