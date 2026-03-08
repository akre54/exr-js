import { bench, describe } from 'vitest'
import {
  Blocks,
  Compression,
  Encoding,
  Image,
  LineOrder,
  SpecificChannels,
  Vec2,
} from '../src/index.js'

// Generate pixel data function
function createPixelFn(width) {
  return (index) => {
    const x = index % width
    const y = Math.floor(index / width)
    return [x / width, y / width, 0.5, 1.0]
  }
}

// Pre-generate interleaved Float32Array for a given size
function createFloat32Pixels(width, height) {
  const pixels = new Float32Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      pixels[i] = x / width
      pixels[i + 1] = y / height
      pixels[i + 2] = 0.5
      pixels[i + 3] = 1.0
    }
  }
  return pixels
}

describe('write performance by size (callback pixels)', () => {
  for (const size of [256, 512, 1024]) {
    bench(`${size}x${size} uncompressed`, () => {
      const channels = SpecificChannels.rgba(createPixelFn(size))
      const encoding = new Encoding(
        Compression.Uncompressed,
        Blocks.ScanLines,
        LineOrder.Increasing,
      )
      const image = Image.fromChannels(new Vec2(size, size), channels, encoding)
      image.write().toArrayBuffer()
    })
  }
})

describe('write performance by size (Float32Array pixels)', () => {
  // Pre-generate pixel data outside benchmark
  const pixels256 = createFloat32Pixels(256, 256)
  const pixels512 = createFloat32Pixels(512, 512)
  const pixels1024 = createFloat32Pixels(1024, 1024)
  const pixels2048 = createFloat32Pixels(2048, 2048)

  bench('256x256 uncompressed', () => {
    const channels = SpecificChannels.rgba(pixels256)
    const encoding = new Encoding(
      Compression.Uncompressed,
      Blocks.ScanLines,
      LineOrder.Increasing,
    )
    const image = Image.fromChannels(new Vec2(256, 256), channels, encoding)
    image.write().toArrayBuffer()
  })

  bench('512x512 uncompressed', () => {
    const channels = SpecificChannels.rgba(pixels512)
    const encoding = new Encoding(
      Compression.Uncompressed,
      Blocks.ScanLines,
      LineOrder.Increasing,
    )
    const image = Image.fromChannels(new Vec2(512, 512), channels, encoding)
    image.write().toArrayBuffer()
  })

  bench('1024x1024 uncompressed', () => {
    const channels = SpecificChannels.rgba(pixels1024)
    const encoding = new Encoding(
      Compression.Uncompressed,
      Blocks.ScanLines,
      LineOrder.Increasing,
    )
    const image = Image.fromChannels(new Vec2(1024, 1024), channels, encoding)
    image.write().toArrayBuffer()
  })

  bench('2048x2048 uncompressed', () => {
    const channels = SpecificChannels.rgba(pixels2048)
    const encoding = new Encoding(
      Compression.Uncompressed,
      Blocks.ScanLines,
      LineOrder.Increasing,
    )
    const image = Image.fromChannels(new Vec2(2048, 2048), channels, encoding)
    image.write().toArrayBuffer()
  })
})

describe('write performance with mipmaps', () => {
  const pixels256 = createFloat32Pixels(256, 256)
  const pixels512 = createFloat32Pixels(512, 512)

  bench('256x256 with mipmaps', () => {
    const channels = SpecificChannels.rgba(pixels256)
    const encoding = new Encoding(
      Compression.Uncompressed,
      Blocks.MipMaps(new Vec2(64, 64)),
      LineOrder.Increasing,
    )
    const image = Image.fromChannels(new Vec2(256, 256), channels, encoding)
    image.write().toArrayBuffer()
  })

  bench('512x512 with mipmaps', () => {
    const channels = SpecificChannels.rgba(pixels512)
    const encoding = new Encoding(
      Compression.Uncompressed,
      Blocks.MipMaps(new Vec2(64, 64)),
      LineOrder.Increasing,
    )
    const image = Image.fromChannels(new Vec2(512, 512), channels, encoding)
    image.write().toArrayBuffer()
  })
})

describe('write performance by compression (512x512)', () => {
  const pixels = createFloat32Pixels(512, 512)

  const compressions = [
    ['uncompressed', Compression.Uncompressed],
    ['rle', Compression.RLE],
    ['zip1', Compression.ZIP1],
    ['zip16', Compression.ZIP16],
    ['piz', Compression.PIZ],
    ['pxr24', Compression.PXR24],
  ]

  for (const [name, compression] of compressions) {
    bench(`512x512 ${name}`, () => {
      const channels = SpecificChannels.rgba(pixels)
      const encoding = new Encoding(
        compression,
        Blocks.ScanLines,
        LineOrder.Increasing,
      )
      const image = Image.fromChannels(new Vec2(512, 512), channels, encoding)
      image.write().toArrayBuffer()
    })
  }
})
