// Global test setup - generates fixture files before tests run
// This ensures read tests have the files they need regardless of test execution order

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import {
  Blocks,
  Compression,
  Encoding,
  encodeRgb,
  Image,
  LineOrder,
  SpecificChannels,
  Vec2,
} from '../src/index.js'

export default function setup() {
  // Ensure output directory exists
  if (!existsSync('test/outputs')) {
    mkdirSync('test/outputs', { recursive: true })
  }

  // Generate test-output.exr (64x64 uncompressed) - used by read-simple.js
  generateTestOutput()

  // Generate compressed test files (128x128) - used by read-compressed.js
  generateCompressedFiles()

  // Generate test-simple-rgb.exr (256x256 RGB) - used by read-simple.js
  generateRgbFile()
}

function generateTestOutput() {
  const width = 64
  const height = 64

  function getPixel(index) {
    const x = index % width
    const y = Math.floor(index / width)
    return [
      x / width, // R: horizontal gradient
      y / height, // G: vertical gradient
      0.5, // B: constant
      1.0, // A: fully opaque
    ]
  }

  const channels = SpecificChannels.rgba(getPixel)
  const image = Image.fromChannels(
    new Vec2(width, height),
    channels,
    Encoding.UNCOMPRESSED,
  )
  const buffer = image.write().toArrayBuffer()

  writeFileSync('test/outputs/test-output.exr', new Uint8Array(buffer))
}

function generateCompressedFiles() {
  const width = 128
  const height = 128

  function getPixel(index) {
    const x = index % width
    const y = Math.floor(index / width)
    const r = x / width
    const g = y / height
    const b = ((x + y) % 32) / 32
    const a = 1.0
    return [r, g, b, a]
  }

  const compressions = [
    { name: 'uncompressed', compression: Compression.Uncompressed },
    { name: 'rle', compression: Compression.RLE },
    { name: 'zip1', compression: Compression.ZIP1 },
    { name: 'zip16', compression: Compression.ZIP16 },
    { name: 'pxr24', compression: Compression.PXR24 },
    { name: 'piz', compression: Compression.PIZ },
    { name: 'b44', compression: Compression.B44 },
    { name: 'b44a', compression: Compression.B44A },
  ]

  for (const { name, compression } of compressions) {
    const encoding = new Encoding(
      compression,
      Blocks.ScanLines,
      LineOrder.Increasing,
    )
    const channels = SpecificChannels.rgba(getPixel)
    const image = Image.fromChannels(
      new Vec2(width, height),
      channels,
      encoding,
    )
    const buffer = image.write().toArrayBuffer()

    writeFileSync(`test/outputs/test-${name}.exr`, new Uint8Array(buffer))
  }
}

function generateRgbFile() {
  const width = 256
  const height = 256

  const buffer = encodeRgb(width, height, (index) => {
    const x = index % width
    const y = Math.floor(index / width)
    return [x / width, y / height, 0.5]
  })

  writeFileSync('test/outputs/test-simple-rgb.exr', new Uint8Array(buffer))
}
