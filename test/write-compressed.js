// Test writing EXR files with different compression methods

import { writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  Blocks,
  Compression,
  Encoding,
  Image,
  LineOrder,
  SpecificChannels,
  Vec2,
} from '../src/index.js'

const width = 128
const height = 128

// Generate RGBA pixels with some patterns that compress well
function getPixel(index) {
  const x = index % width
  const y = Math.floor(index / width)

  // Create some patterns that will compress differently
  const r = x / width
  const g = y / height
  const b = ((x + y) % 32) / 32 // Repeating pattern
  const a = 1.0

  return [r, g, b, a]
}

const testCases = [
  {
    name: 'uncompressed',
    encoding: new Encoding(
      Compression.Uncompressed,
      Blocks.ScanLines,
      LineOrder.Increasing,
    ),
  },
  {
    name: 'rle',
    encoding: new Encoding(
      Compression.RLE,
      Blocks.ScanLines,
      LineOrder.Increasing,
    ),
  },
  {
    name: 'zip1',
    encoding: new Encoding(
      Compression.ZIP1,
      Blocks.ScanLines,
      LineOrder.Increasing,
    ),
  },
  {
    name: 'zip16',
    encoding: new Encoding(
      Compression.ZIP16,
      Blocks.ScanLines,
      LineOrder.Increasing,
    ),
  },
  {
    name: 'pxr24',
    encoding: new Encoding(
      Compression.PXR24,
      Blocks.ScanLines,
      LineOrder.Increasing,
    ),
  },
  {
    name: 'piz',
    encoding: new Encoding(
      Compression.PIZ,
      Blocks.ScanLines,
      LineOrder.Increasing,
    ),
  },
  {
    name: 'b44',
    encoding: new Encoding(
      Compression.B44,
      Blocks.ScanLines,
      LineOrder.Increasing,
    ),
  },
  {
    name: 'b44a',
    encoding: new Encoding(
      Compression.B44A,
      Blocks.ScanLines,
      LineOrder.Increasing,
    ),
  },
]

test.each(testCases)('write EXR with $name compression', ({
  name,
  encoding,
}) => {
  const channels = SpecificChannels.rgba(getPixel)
  const image = Image.fromChannels(new Vec2(width, height), channels, encoding)

  const buffer = image.write().toArrayBuffer()
  const filename = `test/outputs/test-${name}.exr`

  writeFileSync(filename, new Uint8Array(buffer))

  const uncompressedSize = width * height * 4 * 4 // 4 channels, 4 bytes each
  const ratio = ((buffer.byteLength / uncompressedSize) * 100).toFixed(1)

  console.log(
    `${name.padEnd(12)} ${buffer.byteLength.toString().padStart(8)} bytes (${ratio}% of uncompressed)`,
  )

  expect(buffer.byteLength).toBeGreaterThan(0)

  // Verify magic number
  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  expect(magic).toBe(0x1312f76)
})
