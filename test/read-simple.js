// Simple tests for reading EXR files

import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { EXRReader, readRgbaFile, readRgbFile } from '../src/index.js'

test('read simple uncompressed EXR file', async () => {
  const result = await readRgbaFile('test/outputs/test-output.exr')

  expect(result.width).toBe(64)
  expect(result.height).toBe(64)
  expect(result.pixels).toBeInstanceOf(Float32Array)
  expect(result.pixels.length).toBe(64 * 64 * 4) // RGBA

  // Verify some pixel values (gradient)
  // At (0, 0): R = 0, G = 0
  expect(result.pixels[0]).toBeCloseTo(0, 2) // R
  expect(result.pixels[1]).toBeCloseTo(0, 2) // G
  expect(result.pixels[2]).toBeCloseTo(0.5, 2) // B
  expect(result.pixels[3]).toBeCloseTo(1.0, 2) // A

  // At (63, 63): R ≈ 1, G ≈ 1
  const lastPixel = (63 * 64 + 63) * 4
  expect(result.pixels[lastPixel]).toBeCloseTo(63 / 64, 2) // R
  expect(result.pixels[lastPixel + 1]).toBeCloseTo(63 / 64, 2) // G
})

test('read EXR with EXRReader class', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-output.exr')

  expect(reader.getWidth()).toBe(64)
  expect(reader.getHeight()).toBe(64)
  expect(reader.getChannelNames()).toContain('R')
  expect(reader.getChannelNames()).toContain('G')
  expect(reader.getChannelNames()).toContain('B')
  expect(reader.getChannelNames()).toContain('A')
  expect(reader.getLayerCount()).toBe(1)

  // Read individual channels
  const rChannel = reader.readChannel('R')
  expect(rChannel).toBeInstanceOf(Float32Array)
  expect(rChannel.length).toBe(64 * 64)

  // Read interleaved RGBA
  const rgba = reader.readRgba()
  expect(rgba.length).toBe(64 * 64 * 4)
})

test('read EXR from ArrayBuffer', async () => {
  const buffer = readFileSync('test/outputs/test-output.exr')
  const result = await readRgbaFile(buffer)

  expect(result.width).toBe(64)
  expect(result.height).toBe(64)
  expect(result.pixels.length).toBe(64 * 64 * 4)
})

test('read RGB-only file', async () => {
  const result = await readRgbFile('test/outputs/test-simple-rgb.exr')

  expect(result.width).toBe(256)
  expect(result.height).toBe(256)
  expect(result.pixels).toBeInstanceOf(Float32Array)
  expect(result.pixels.length).toBe(256 * 256 * 3) // RGB only
})

test('EXRReader metadata access', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-output.exr')

  expect(reader.getDataWindow()).toBeDefined()
  expect(reader.getDataWindow().size.x).toBe(64)
  expect(reader.getDataWindow().size.y).toBe(64)

  expect(reader.getDisplayWindow()).toBeDefined()
  expect(reader.getCompression()).toBeDefined()
  expect(reader.getAttributes()).toBeInstanceOf(Map)
  expect(reader.isMultiPart()).toBe(false)
})
