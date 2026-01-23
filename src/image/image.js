// Image container and write functionality

import { Vec2, IntegerBounds, getLevelSize, LevelMode, SampleType, bytesPerSample } from '../core/types.js';
import { Header, ImageAttributes, Encoding } from '../meta/header.js';
import { MetaData, OffsetTable } from '../meta/index.js';
import { BinaryWriter } from '../io/binary-writer.js';
import { Layer } from './layer.js';
import { generateBlockIndices, extractBlockData, Chunk } from '../block/index.js';
import { compressBlock } from '../compression/index.js';
import { AnyChannels, AnyChannel, FlatSamples, SpecificChannels } from './channels.js';
import { ChannelDescription } from '../meta/attributes.js';
import { floatToHalf, halfToFloat } from '../lib/half.js';

// Complete EXR image container
export class Image {
  constructor(attributes, layerData) {
    this.attributes = attributes
    this.layerData = layerData
  }

  // Get layers as array
  get layers() {
    return Array.isArray(this.layerData) ? this.layerData : [this.layerData]
  }

  // Create image from a single layer
  static fromLayer(layer) {
    const displayWindow = IntegerBounds.fromDimensions(
      layer.size.x,
      layer.size.y,
    )
    return new Image(new ImageAttributes(displayWindow), layer)
  }

  // Create image from channels (convenience method)
  static fromChannels(size, channels, encoding = Encoding.FAST_LOSSLESS) {
    const vec = size instanceof Vec2 ? size : new Vec2(size[0], size[1])
    const layer = Layer.create(vec, channels, encoding)
    return Image.fromLayer(layer)
  }

  // Create an empty image and add layers
  static empty(attributes) {
    return new Image(attributes, [])
  }

  // Add a layer to this image
  withLayer(layer) {
    const layers = [...this.layers, layer]
    return new Image(this.attributes, layers)
  }

  // Start building a write operation
  write() {
    return new WriteImageWithOptions(this)
  }
}

// Write operation builder
export class WriteImageWithOptions {
  constructor(image) {
    this._image = image
    this._parallel = false
    this._onProgress = null
  }

  // Enable parallel compression (future feature)
  parallel() {
    this._parallel = true
    return this
  }

  // Disable parallel compression
  nonParallel() {
    this._parallel = false
    return this
  }

  // Set progress callback
  onProgress(callback) {
    this._onProgress = callback
    return this
  }

  // Write to an ArrayBuffer
  toArrayBuffer() {
    return writeImage(this._image, this._onProgress)
  }

  // Write to a Uint8Array
  toUint8Array() {
    return new Uint8Array(this.toArrayBuffer())
  }
}

// Write an image to an ArrayBuffer
function writeImage(image, onProgress) {
  const layers = image.layers

  // Build headers
  const headers = layers.map((layer, _index) => {
    return new Header(
      layer.size,
      layer.channelData.getChannelList(),
      layer.encoding,
      image.attributes,
      layer.attributes,
    )
  })

  // Create metadata
  const metaData = MetaData.fromHeaders(headers)
  const isMultiPart = metaData.requirements.hasMultipleLayers

  // Create offset tables
  const offsetTables = headers.map((h) => new OffsetTable(h.chunkCount))

  // Calculate approximate buffer size
  const estimatedSize = estimateFileSize(headers, layers)
  const writer = new BinaryWriter(estimatedSize)

  // Write metadata
  metaData.write(writer)

  // Reserve space for offset tables and record their positions
  const offsetTablePositions = offsetTables.map((table) => {
    const pos = writer.getPosition()
    table.write(writer)
    return pos
  })

  // Generate and write all blocks
  const totalBlocks = headers.reduce((sum, h) => sum + h.chunkCount, 0)
  let blocksWritten = 0

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex]
    const _header = headers[layerIndex]
    const offsetTable = offsetTables[layerIndex]

    // Create mip level manager if needed
    const hasMipLevels = layer.encoding.blocks.hasLevels()
    const mipManager = hasMipLevels
      ? new MipLevelManager(
          layer.channelData,
          layer.size,
          layer.encoding.blocks,
        )
      : null

    // Generate block indices for this layer
    const blockIndices = generateBlockIndices(
      layerIndex,
      layer.size,
      layer.encoding.blocks,
      layer.encoding.compression,
    )

    // Write each block
    for (let blockNum = 0; blockNum < blockIndices.length; blockNum++) {
      const blockIndex = blockIndices[blockNum]

      // Record offset
      offsetTable.offsets[blockNum] = BigInt(writer.getPosition())

      // Get channel data for this level
      let channelData, levelSize
      if (hasMipLevels) {
        channelData = mipManager.getChannelsForLevel(blockIndex.levelIndex)
        levelSize = mipManager.getSizeForLevel(blockIndex.levelIndex)
      } else {
        channelData = layer.channelData
        levelSize = layer.size
      }

      // Extract block data
      const blockData = extractBlockData(blockIndex, channelData, levelSize)

      // Build compression context for channel-aware compression
      const channelList = channelData.getChannelList()
      const compressionContext = {
        channels: channelList.list,
        width: blockIndex.pixelSize.x,
        height: blockIndex.pixelSize.y,
      }

      // Apply compression
      const compressedData = compressBlock(
        layer.encoding.compression,
        blockData,
        compressionContext,
      )

      // Create and write chunk
      const chunk = createChunk(
        layerIndex,
        blockIndex,
        compressedData,
        layer.encoding.blocks,
      )

      if (isMultiPart) {
        chunk.writeMultiPart(writer)
      } else {
        chunk.writeSinglePart(writer)
      }

      blocksWritten++
      if (onProgress) {
        onProgress(blocksWritten / totalBlocks)
      }
    }
  }

  // Patch offset tables with actual values
  for (let i = 0; i < offsetTables.length; i++) {
    const table = offsetTables[i]
    const pos = offsetTablePositions[i]

    writer.patchAt(pos, (w) => {
      table.write(w)
    })
  }

  return writer.toArrayBuffer()
}

// Create a chunk from block data
function createChunk(layerIndex, blockIndex, data, blocks) {
  if (blocks.isTiled()) {
    // Calculate tile coordinates
    const tileSize = blocks.tileSize
    const tileX = Math.floor(blockIndex.pixelPosition.x / tileSize.x)
    const tileY = Math.floor(blockIndex.pixelPosition.y / tileSize.y)

    return new Chunk(
      layerIndex,
      data,
      true,
      new Vec2(tileX, tileY),
      blockIndex.levelIndex,
      null,
    )
  } else {
    return new Chunk(
      layerIndex,
      data,
      false,
      null,
      null,
      blockIndex.pixelPosition.y,
    )
  }
}

// Estimate file size for buffer allocation
function estimateFileSize(headers, layers) {
  let size = 1024 // Base overhead for headers

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const layer = layers[i]

    // Offset table
    size += header.chunkCount * 8

    // Pixel data (uncompressed estimate)
    const bytesPerPixel = header.channels.bytesPerPixel
    size += layer.size.x * layer.size.y * bytesPerPixel

    // Chunk headers overhead
    size += header.chunkCount * 20
  }

  return size
}

// Generate downscaled channel data for a mip level
// Uses box filter (2x2 average) for downscaling
function generateMipLevel(channels, sourceSize, targetSize) {
  const channelList = channels.getChannelList()
  const newChannels = []

  for (const channelDesc of channelList.list) {
    const newData = downsampleChannel(
      channels,
      channelDesc.name,
      sourceSize,
      targetSize,
      channelDesc.sampleType,
    )
    newChannels.push(
      new AnyChannel(
        channelDesc.name,
        newData,
        channelDesc.quantizeLinearly,
        channelDesc.sampling,
      ),
    )
  }

  return new AnyChannels(newChannels)
}

// Downsample a single channel using box filter
function downsampleChannel(
  channels,
  channelName,
  sourceSize,
  targetSize,
  sampleType,
) {
  const targetPixels = targetSize.x * targetSize.y

  // Always use Float32 for intermediate computation
  const values = new Float32Array(targetPixels)

  for (let ty = 0; ty < targetSize.y; ty++) {
    for (let tx = 0; tx < targetSize.x; tx++) {
      // Calculate source region (2x2 box, clamped to bounds)
      const sx0 = tx * 2
      const sy0 = ty * 2
      const sx1 = Math.min(sx0 + 1, sourceSize.x - 1)
      const sy1 = Math.min(sy0 + 1, sourceSize.y - 1)

      // Sample 4 source pixels and average
      let sum = 0
      let count = 0

      for (const sy of [sy0, sy1]) {
        for (const sx of [sx0, sx1]) {
          if (sx < sourceSize.x && sy < sourceSize.y) {
            const srcIdx = sy * sourceSize.x + sx
            sum += getChannelValue(channels, channelName, srcIdx, sampleType)
            count++
          }
        }
      }

      const targetIdx = ty * targetSize.x + tx
      values[targetIdx] = count > 0 ? sum / count : 0
    }
  }

  // Convert to target sample type
  switch (sampleType) {
    case SampleType.F16: {
      const halfData = new Uint16Array(targetPixels)
      for (let i = 0; i < targetPixels; i++) {
        halfData[i] = floatToHalf(values[i])
      }
      return FlatSamples.f16(halfData)
    }
    case SampleType.F32:
      return FlatSamples.f32(values)
    case SampleType.U32: {
      const u32Data = new Uint32Array(targetPixels)
      for (let i = 0; i < targetPixels; i++) {
        u32Data[i] = Math.round(values[i]) >>> 0
      }
      return FlatSamples.u32(u32Data)
    }
    default:
      return FlatSamples.f32(values)
  }
}

// Get a channel value as float
function getChannelValue(channels, channelName, pixelIndex, sampleType) {
  const bytes = channels.getSampleBytes(channelName, pixelIndex)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  switch (sampleType) {
    case SampleType.F16:
      return halfToFloat(view.getUint16(0, true))
    case SampleType.F32:
      return view.getFloat32(0, true)
    case SampleType.U32:
      return view.getUint32(0, true)
    default:
      return 0
  }
}

// Manages channel data for multiple mip levels
class MipLevelManager {
  constructor(baseChannels, baseSize, blocks) {
    this.baseChannels = baseChannels
    this.baseSize = baseSize
    this.blocks = blocks
    this.levelData = new Map() // levelKey -> AnyChannels
    this.levelData.set('0,0', baseChannels)
  }

  // Get channel data for a specific level
  getChannelsForLevel(levelIndex) {
    const key = `${levelIndex.x},${levelIndex.y}`

    if (this.levelData.has(key)) {
      return this.levelData.get(key)
    }

    // Generate the level by downscaling from appropriate source
    const levelSize = getLevelSize(
      this.baseSize,
      levelIndex,
      this.blocks.levelMode,
      this.blocks.roundingMode,
    )

    if (this.blocks.levelMode === LevelMode.MipMap) {
      // For mip maps, each level is derived from the previous level
      const prevLevel = levelIndex.x - 1
      const _prevKey = `${prevLevel},${prevLevel}`
      const prevChannels = this.getChannelsForLevel(
        new Vec2(prevLevel, prevLevel),
      )
      const prevSize = getLevelSize(
        this.baseSize,
        new Vec2(prevLevel, prevLevel),
        this.blocks.levelMode,
        this.blocks.roundingMode,
      )

      const newChannels = generateMipLevel(prevChannels, prevSize, levelSize)
      this.levelData.set(key, newChannels)
      return newChannels
    } else if (this.blocks.levelMode === LevelMode.RipMap) {
      // For rip maps, derive from the nearest available level
      let sourceChannels, sourceSize

      if (
        levelIndex.x > 0 &&
        this.levelData.has(`${levelIndex.x - 1},${levelIndex.y}`)
      ) {
        // Derive from level to the left (reduce X)
        const sourceLevel = new Vec2(levelIndex.x - 1, levelIndex.y)
        sourceChannels = this.getChannelsForLevel(sourceLevel)
        sourceSize = getLevelSize(
          this.baseSize,
          sourceLevel,
          this.blocks.levelMode,
          this.blocks.roundingMode,
        )
      } else if (
        levelIndex.y > 0 &&
        this.levelData.has(`${levelIndex.x},${levelIndex.y - 1}`)
      ) {
        // Derive from level above (reduce Y)
        const sourceLevel = new Vec2(levelIndex.x, levelIndex.y - 1)
        sourceChannels = this.getChannelsForLevel(sourceLevel)
        sourceSize = getLevelSize(
          this.baseSize,
          sourceLevel,
          this.blocks.levelMode,
          this.blocks.roundingMode,
        )
      } else if (levelIndex.x > 0) {
        // Need to generate from left first
        const sourceLevel = new Vec2(levelIndex.x - 1, levelIndex.y)
        sourceChannels = this.getChannelsForLevel(sourceLevel)
        sourceSize = getLevelSize(
          this.baseSize,
          sourceLevel,
          this.blocks.levelMode,
          this.blocks.roundingMode,
        )
      } else if (levelIndex.y > 0) {
        // Need to generate from above first
        const sourceLevel = new Vec2(levelIndex.x, levelIndex.y - 1)
        sourceChannels = this.getChannelsForLevel(sourceLevel)
        sourceSize = getLevelSize(
          this.baseSize,
          sourceLevel,
          this.blocks.levelMode,
          this.blocks.roundingMode,
        )
      } else {
        // Level (0,0) should already be in cache
        return this.baseChannels
      }

      const newChannels = generateMipLevel(
        sourceChannels,
        sourceSize,
        levelSize,
      )
      this.levelData.set(key, newChannels)
      return newChannels
    }

    return this.baseChannels
  }

  // Get size for a specific level
  getSizeForLevel(levelIndex) {
    return getLevelSize(
      this.baseSize,
      levelIndex,
      this.blocks.levelMode,
      this.blocks.roundingMode,
    )
  }
}
