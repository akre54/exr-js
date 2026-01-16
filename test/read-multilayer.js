// Tests for reading multi-layer EXR files

import { test, expect } from 'vitest';
import { EXRReader } from '../src/index.js';

test('read multi-layer EXR', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-multilayer.exr');

  // Check layer count
  expect(reader.getLayerCount()).toBe(3);

  // Check layer names
  const layerNames = reader.getLayerNames();
  expect(layerNames).toContain('beauty');
  expect(layerNames).toContain('normal');
  expect(layerNames).toContain('depth');
});

test('read channels from multi-layer EXR', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-multilayer.exr');

  // Read first layer (beauty)
  const beautyChannels = reader.getChannelNames(0);
  expect(beautyChannels).toContain('R');
  expect(beautyChannels).toContain('G');
  expect(beautyChannels).toContain('B');
  expect(beautyChannels).toContain('A');

  // Read second layer (normal)
  const normalChannels = reader.getChannelNames(1);
  expect(normalChannels).toContain('R');
  expect(normalChannels).toContain('G');
  expect(normalChannels).toContain('B');

  // Read third layer (depth)
  const depthChannels = reader.getChannelNames(2);
  expect(depthChannels).toContain('Z');
});

test('read pixel data from multi-layer EXR', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-multilayer.exr');

  const width = reader.getWidth(0);
  const height = reader.getHeight(0);

  // Read beauty layer as RGBA
  const beautyPixels = reader.readRgba(0);
  expect(beautyPixels.length).toBe(width * height * 4);

  // Read normal layer
  const normalLayer = reader.readLayer(1);
  expect(normalLayer.get('R').length).toBe(width * height);
  expect(normalLayer.get('G').length).toBe(width * height);
  expect(normalLayer.get('B').length).toBe(width * height);

  // Read depth channel
  const depthChannel = reader.readChannel('Z', 2);
  expect(depthChannel.length).toBe(width * height);
});

test('read multi-layer EXR with builder', async () => {
  const reader = await EXRReader.fromFile('test/outputs/test-builder-multilayer.exr');

  // File has 4 layers: beauty, normal, depth, objectId
  expect(reader.getLayerCount()).toBe(4);
  expect(reader.isMultiPart()).toBe(true);

  // Verify each layer has correct dimensions
  for (let i = 0; i < reader.getLayerCount(); i++) {
    expect(reader.getWidth(i)).toBeGreaterThan(0);
    expect(reader.getHeight(i)).toBeGreaterThan(0);
  }
});
