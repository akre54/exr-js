// Test writing EXR files with mip maps

import { writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  Blocks,
  Compression,
  Encoding,
  Image,
  LineOrder,
  RoundingMode,
  SpecificChannels,
  Vec2,
} from '../src/index.js'

const width = 256
const height = 256

// Generate RGBA pixels with a pattern that shows downscaling clearly
function getPixel(index) {
  const x = index % width
  const y = Math.floor(index / width)

  // Create a checkerboard pattern with gradients
  const checker = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) * 0.3
  const r = x / width + checker
  const g = y / height + checker
  const b = 0.5
  const a = 1.0

  return [r, g, b, a]
}

test('write mipmap EXR with RoundDown', () => {
  const channels = SpecificChannels.rgba(getPixel)
  const encoding = new Encoding(
    Compression.ZIP16,
    Blocks.MipMaps(new Vec2(64, 64), RoundingMode.Down),
    LineOrder.Unspecified,
  )
  const image = Image.fromChannels(new Vec2(width, height), channels, encoding)

  const buffer = image.write().toArrayBuffer()
  const filename = 'test-mipmap-down.exr'

  writeFileSync(`test/outputs/${filename}`, new Uint8Array(buffer))
  console.log(`  Wrote test/outputs/${filename}: ${buffer.byteLength} bytes`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})

test('write mipmap EXR with RoundUp', () => {
  const channels = SpecificChannels.rgba(getPixel)
  const encoding = new Encoding(
    Compression.ZIP16,
    Blocks.MipMaps(new Vec2(64, 64), RoundingMode.Up),
    LineOrder.Unspecified,
  )
  const image = Image.fromChannels(new Vec2(width, height), channels, encoding)

  const buffer = image.write().toArrayBuffer()
  const filename = 'test-mipmap-up.exr'

  writeFileSync(`test/outputs/${filename}`, new Uint8Array(buffer))
  console.log(`  Wrote test/outputs/${filename}: ${buffer.byteLength} bytes`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})

test('write mipmap EXR with non-power-of-2 dimensions', () => {
  const w = 300
  const h = 200
  function getPixelNpot(index) {
    const x = index % w
    const y = Math.floor(index / w)
    return [x / w, y / h, 0.5, 1.0]
  }

  const channels = SpecificChannels.rgba(getPixelNpot)
  const encoding = new Encoding(
    Compression.RLE,
    Blocks.MipMaps(new Vec2(32, 32), RoundingMode.Down),
    LineOrder.Unspecified,
  )
  const image = Image.fromChannels(new Vec2(w, h), channels, encoding)

  const buffer = image.write().toArrayBuffer()
  const filename = 'test-mipmap-npot.exr'

  writeFileSync(`test/outputs/${filename}`, new Uint8Array(buffer))
  console.log(`  Wrote test/outputs/${filename}: ${buffer.byteLength} bytes`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})

test('write small mipmap EXR (16x16 -> 1x1)', () => {
  const w = 16
  const h = 16
  function getPixelSmall(index) {
    const x = index % w
    const y = Math.floor(index / w)
    return [x / w, y / h, (x + y) / (w + h), 1.0]
  }

  const channels = SpecificChannels.rgba(getPixelSmall)
  const encoding = new Encoding(
    Compression.Uncompressed,
    Blocks.MipMaps(new Vec2(8, 8), RoundingMode.Down),
    LineOrder.Unspecified,
  )
  const image = Image.fromChannels(new Vec2(w, h), channels, encoding)

  const buffer = image.write().toArrayBuffer()
  const filename = 'test-mipmap-small.exr'

  writeFileSync(`test/outputs/${filename}`, new Uint8Array(buffer))
  console.log(`  Wrote test/outputs/${filename}: ${buffer.byteLength} bytes`)
  console.log(`  Expected levels: 5 (16, 8, 4, 2, 1)`)

  expect(buffer.byteLength).toBeGreaterThan(0)

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})
