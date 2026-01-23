// Test the simple writeRgbaFile/writeRgbFile API

import { existsSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  Blocks,
  Compression,
  Encoding,
  LineOrder,
  Vec2,
  writeRgbaFile,
  writeRgbFile,
} from '../src/index.js'

const width = 256
const height = 256

test('writeRgbaFile with callback', async () => {
  const buffer = await writeRgbaFile(null, width, height, (index) => {
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

test('writeRgbaFile with Float32Array', async () => {
  const pixels = new Float32Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const x = i % width
    const y = Math.floor(i / width)
    pixels[i * 4] = x / width // R
    pixels[i * 4 + 1] = y / height // G
    pixels[i * 4 + 2] = 0.5 // B
    pixels[i * 4 + 3] = 1.0 // A
  }

  const buffer = await writeRgbaFile(null, width, height, pixels)

  const filename = 'test/outputs/test-simple-rgba-array.exr'
  writeFileSync(filename, new Uint8Array(buffer))
  console.log(`  Wrote ${filename}: ${buffer.byteLength} bytes`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})

test('writeRgbFile', async () => {
  const buffer = await writeRgbFile(null, width, height, (index) => {
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

test('writeRgbaFile with custom encoding (PIZ)', async () => {
  const encoding = new Encoding(
    Compression.PIZ,
    Blocks.Tiles(new Vec2(64, 64)),
    LineOrder.Unspecified,
  )

  const buffer = await writeRgbaFile(
    null,
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

test('writeRgbaFile to file directly', async () => {
  const filename = 'test/outputs/test-simple-direct.exr'
  await writeRgbaFile(filename, 128, 128, (_index) => [0.5, 0.5, 0.5, 1.0])
  console.log(`  Wrote ${filename}`)

  expect(existsSync(filename)).toBe(true)
})
