// PXR24 compression for EXR
// Developed by Pixar Animation Studios. Lossy compression for F32 data
// (converted to 24 bits), but lossless for F16 and U32 data.
// Algorithm:
// 1. Convert F32 values to 24-bit (lossy rounding of significand)
// 2. Apply delta encoding (difference from previous pixel per channel row)
// 3. Transpose bytes (group all MSBs together, then second bytes, etc.)
// 4. Compress with zlib
// In browser environments without pako, compression will fail.

import { SampleType } from '../core/types.js'
import { getZlib } from '../io/zlib.js'

// Convert 32-bit float to 24-bit representation
// This is a lossy conversion that rounds the mantissa from 23 bits to 15 bits.
// @param {number} float - F32 value
// @returns {number} - 24-bit representation as u32
export function f32ToF24(float) {
  // Get the bit pattern of the float
  const buffer = new ArrayBuffer(4)
  const floatView = new Float32Array(buffer)
  const uintView = new Uint32Array(buffer)
  floatView[0] = float
  const bits = uintView[0]

  const sign = bits & 0x80000000
  const exponent = bits & 0x7f800000
  const mantissa = bits & 0x007fffff

  let result

  if (exponent === 0x7f800000) {
    // Infinity or NaN
    if (mantissa !== 0) {
      // NaN: preserve sign and 15 leftmost bits of significand
      // If all 15 bits would be zero, set at least one to avoid turning into infinity
      const truncatedMantissa = mantissa >>> 8
      result =
        (exponent >>> 8) | truncatedMantissa | (truncatedMantissa === 0 ? 1 : 0)
    } else {
      // Infinity
      result = exponent >>> 8
    }
  } else {
    // Finite: round the significand to 15 bits
    result = ((exponent | mantissa) + (mantissa & 0x00000080)) >>> 8

    if (result >= 0x7f8000) {
      // Overflow due to rounding - truncate instead
      result = (exponent | mantissa) >>> 8
    }
  }

  return (sign >>> 8) | result
}

// Convert 24-bit representation back to 32-bit float
// Simply shift left by 8 bits.
// @param {number} f24 - 24-bit representation
// @returns {number} - F32 value
export function f24ToF32(f24) {
  const buffer = new ArrayBuffer(4)
  const uintView = new Uint32Array(buffer)
  const floatView = new Float32Array(buffer)
  uintView[0] = f24 << 8
  return floatView[0]
}

// Compress data using PXR24
// @param {Uint8Array} data - Uncompressed pixel data (native endian, per-scanline channel order)
// @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
// @param {number} width - Block width in pixels
// @param {number} height - Block height in scanlines
// @returns {Uint8Array} - Compressed data
export function compressPXR24(data, channels, width, height) {
  if (data.length === 0) {
    return new Uint8Array(0)
  }

  // Calculate bytes per pixel in PXR24 encoding (F16=2, F32=3, U32=4)
  const bytesPerPixelPXR24 = channels.reduce((sum, ch) => {
    switch (ch.sampleType) {
      case SampleType.F16:
        return sum + 2
      case SampleType.F32:
        return sum + 3
      case SampleType.U32:
        return sum + 4
      default:
        return sum + 4
    }
  }, 0)

  // Output buffer for encoded data
  const encodedBE = new Uint8Array(bytesPerPixelPXR24 * width * height)
  let writeOffset = 0

  // Create a DataView for reading input
  const inputView = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let readOffset = 0

  // Process each scanline
  for (let y = 0; y < height; y++) {
    // Process each channel
    for (const channel of channels) {
      const sampleCount = width // TODO: handle subsampling

      switch (channel.sampleType) {
        case SampleType.F16: {
          // 2 bytes per sample: delta encode, then transpose
          const byte0Start = writeOffset
          const byte1Start = writeOffset + sampleCount
          writeOffset += sampleCount * 2

          let previousPixel = 0
          for (let x = 0; x < sampleCount; x++) {
            const pixel = inputView.getUint16(readOffset, true) // little-endian
            readOffset += 2

            const diff = (pixel - previousPixel) & 0xffff
            // Write in big-endian (MSB first in first block)
            encodedBE[byte0Start + x] = (diff >>> 8) & 0xff
            encodedBE[byte1Start + x] = diff & 0xff
            previousPixel = pixel
          }
          break
        }

        case SampleType.F32: {
          // 3 bytes per sample (lossy): convert to F24, delta encode, transpose
          const byte0Start = writeOffset
          const byte1Start = writeOffset + sampleCount
          const byte2Start = writeOffset + sampleCount * 2
          writeOffset += sampleCount * 3

          let previousPixel = 0
          for (let x = 0; x < sampleCount; x++) {
            const floatVal = inputView.getFloat32(readOffset, true) // little-endian
            readOffset += 4

            const pixel = f32ToF24(floatVal)
            const diff = (pixel - previousPixel) & 0xffffff
            // Write 24-bit difference in big-endian across 3 byte planes
            encodedBE[byte0Start + x] = (diff >>> 16) & 0xff
            encodedBE[byte1Start + x] = (diff >>> 8) & 0xff
            encodedBE[byte2Start + x] = diff & 0xff
            previousPixel = pixel
          }
          break
        }

        case SampleType.U32: {
          // 4 bytes per sample: delta encode, then transpose
          const byte0Start = writeOffset
          const byte1Start = writeOffset + sampleCount
          const byte2Start = writeOffset + sampleCount * 2
          const byte3Start = writeOffset + sampleCount * 3
          writeOffset += sampleCount * 4

          let previousPixel = 0
          for (let x = 0; x < sampleCount; x++) {
            const pixel = inputView.getUint32(readOffset, true) // little-endian
            readOffset += 4

            const diff = (pixel - previousPixel) >>> 0 // force unsigned
            // Write in big-endian across 4 byte planes
            encodedBE[byte0Start + x] = (diff >>> 24) & 0xff
            encodedBE[byte1Start + x] = (diff >>> 16) & 0xff
            encodedBE[byte2Start + x] = (diff >>> 8) & 0xff
            encodedBE[byte3Start + x] = diff & 0xff
            previousPixel = pixel
          }
          break
        }
      }
    }
  }

  // Compress with zlib
  const zlib = getZlib()
  if (!zlib) {
    throw new Error(
      'zlib not available for PXR24 compression. Include pako library in browser.',
    )
  }

  const compressed = zlib.deflate(encodedBE, 4)

  return new Uint8Array(compressed)
}

// Decompress PXR24 data
// @param {Uint8Array} compressed - Compressed data
// @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
// @param {number} width - Block width in pixels
// @param {number} height - Block height in scanlines
// @param {number} expectedSize - Expected uncompressed size
// @returns {Uint8Array} - Decompressed data
export function decompressPXR24(
  compressed,
  channels,
  width,
  height,
  expectedSize,
) {
  const zlib = getZlib()
  if (!zlib) {
    throw new Error(
      'zlib not available for PXR24 decompression. Include pako library in browser.',
    )
  }

  // Decompress with zlib
  const encodedBE = zlib.inflate(compressed)

  // Output buffer
  const output = new Uint8Array(expectedSize)
  const outputView = new DataView(output.buffer)
  let writeOffset = 0
  let readOffset = 0

  // Process each scanline
  for (let y = 0; y < height; y++) {
    // Process each channel
    for (const channel of channels) {
      const sampleCount = width

      switch (channel.sampleType) {
        case SampleType.F16: {
          const byte0Start = readOffset
          const byte1Start = readOffset + sampleCount
          readOffset += sampleCount * 2

          let pixelAccum = 0
          for (let x = 0; x < sampleCount; x++) {
            const diff =
              (encodedBE[byte0Start + x] << 8) | encodedBE[byte1Start + x]
            pixelAccum = (pixelAccum + diff) & 0xffff
            outputView.setUint16(writeOffset, pixelAccum, true)
            writeOffset += 2
          }
          break
        }

        case SampleType.F32: {
          const byte0Start = readOffset
          const byte1Start = readOffset + sampleCount
          const byte2Start = readOffset + sampleCount * 2
          readOffset += sampleCount * 3

          let pixelAccum = 0
          for (let x = 0; x < sampleCount; x++) {
            const diff =
              (encodedBE[byte0Start + x] << 16) |
              (encodedBE[byte1Start + x] << 8) |
              encodedBE[byte2Start + x]
            pixelAccum = (pixelAccum + diff) & 0xffffff
            // F24 to F32: shift left by 8
            outputView.setUint32(writeOffset, pixelAccum << 8, true)
            writeOffset += 4
          }
          break
        }

        case SampleType.U32: {
          const byte0Start = readOffset
          const byte1Start = readOffset + sampleCount
          const byte2Start = readOffset + sampleCount * 2
          const byte3Start = readOffset + sampleCount * 3
          readOffset += sampleCount * 4

          let pixelAccum = 0
          for (let x = 0; x < sampleCount; x++) {
            const diff =
              ((encodedBE[byte0Start + x] << 24) |
                (encodedBE[byte1Start + x] << 16) |
                (encodedBE[byte2Start + x] << 8) |
                encodedBE[byte3Start + x]) >>>
              0
            pixelAccum = (pixelAccum + diff) >>> 0
            outputView.setUint32(writeOffset, pixelAccum, true)
            writeOffset += 4
          }
          break
        }
      }
    }
  }

  return output
}
