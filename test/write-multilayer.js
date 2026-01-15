/**
 * Test writing multi-layer EXR files (render passes/AOVs)
 */

import { test, expect } from 'vitest';
import { Image, Layer, SpecificChannels, AnyChannels, AnyChannel, FlatSamples, Encoding, Vec2, Compression, Blocks, LineOrder, IntegerBounds, ImageAttributes, LayerAttributes, SampleType } from '../src/index.js';
import { writeFileSync } from 'fs';

const width = 256;
const height = 256;

test('write multi-layer EXR with render passes', () => {
  // Create multiple render passes

  // Beauty pass (RGBA)
  function getBeautyPixel(index) {
    const x = index % width;
    const y = Math.floor(index / width);
    return [x / width, y / height, 0.5, 1.0];
  }

  // Normal pass (RGB)
  function getNormalPixel(index) {
    const x = index % width;
    const y = Math.floor(index / width);
    const nx = (x / width) * 2 - 1;
    const ny = (y / height) * 2 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return [nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz];
  }

  // Depth pass (single channel)
  function getDepthPixel(index) {
    const x = index % width;
    const y = Math.floor(index / width);
    return (x + y) / (width + height);
  }

  // Create layers
  const beautyChannels = SpecificChannels.rgba(getBeautyPixel);
  const beautyLayer = Layer.create(
    new Vec2(width, height),
    beautyChannels,
    Encoding.FAST_LOSSLESS,
    LayerAttributes.named('beauty')
  );

  const normalChannels = SpecificChannels.rgb(getNormalPixel);
  const normalLayer = Layer.create(
    new Vec2(width, height),
    normalChannels,
    new Encoding(Compression.ZIP16, Blocks.ScanLines, LineOrder.Increasing),
    LayerAttributes.named('normal')
  );

  // Create depth layer with single F32 channel using AnyChannels
  const depthData = new Float32Array(width * height);
  for (let i = 0; i < depthData.length; i++) {
    depthData[i] = getDepthPixel(i);
  }

  const depthChannels = new AnyChannels([
    new AnyChannel('Z', FlatSamples.f32(depthData))
  ]);
  const depthLayer = Layer.create(
    new Vec2(width, height),
    depthChannels,
    new Encoding(Compression.PXR24, Blocks.ScanLines, LineOrder.Increasing),
    LayerAttributes.named('depth')
  );

  // Create multi-layer image
  const displayWindow = IntegerBounds.fromDimensions(width, height);
  const image = new Image(new ImageAttributes(displayWindow), [])
    .withLayer(beautyLayer)
    .withLayer(normalLayer)
    .withLayer(depthLayer);

  console.log(`Created image with ${image.layers.length} layers:`);
  for (const layer of image.layers) {
    const channels = layer.channelData.getChannelList();
    console.log(`  - ${layer.attributes.layerName || '(unnamed)'}: ${channels.list.map(c => c.name).join(', ')}`);
  }

  // Write to file
  const buffer = image.write().toArrayBuffer();
  const filename = 'test/outputs/test-multilayer.exr';
  writeFileSync(filename, new Uint8Array(buffer));

  console.log(`\nWrote ${filename}: ${buffer.byteLength} bytes`);

  expect(image.layers.length).toBe(3);
  expect(buffer.byteLength).toBeGreaterThan(0);

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  expect(magic).toBe(0x1312f76);
});
