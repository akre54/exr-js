// Block module - pixel block management and chunk writing

import { BinaryWriter } from '../io/binary-writer.js';
import { Vec2, scanLinesPerBlock, getLevelCounts, getLevelSize, LevelMode } from '../core/types.js';

// Index identifying a specific block in the image
export class BlockIndex {
  constructor(layer, pixelPosition, pixelSize, levelIndex = new Vec2(0, 0)) {
    this.layer = layer;
    this.pixelPosition = pixelPosition;
    this.pixelSize = pixelSize;
    this.levelIndex = levelIndex;
  }
}

// Uncompressed pixel block data
export class UncompressedBlock {
  constructor(index, data) {
    this.index = index;
    this.data = data;
  }
}

// Compressed chunk ready for writing
export class Chunk {
  constructor(layer, data, isTile, tileCoordinates = null, levelIndex = null, yCoordinate = null) {
    this.layer = layer;
    this.data = data;
    this.isTile = isTile;
    this.tileCoordinates = tileCoordinates;
    this.levelIndex = levelIndex;
    this.yCoordinate = yCoordinate;
  }

  // Write this chunk to a writer (for multi-part files)
  writeMultiPart(writer) {
    // Part number (u32)
    writer.writeU32(this.layer);
    this._writeData(writer);
  }

  // Write this chunk to a writer (for single-part files)
  writeSinglePart(writer) {
    this._writeData(writer);
  }

  // Write the chunk data
  _writeData(writer) {
    if (this.isTile) {
      // Tile coordinates
      writer.writeI32(this.tileCoordinates.x);
      writer.writeI32(this.tileCoordinates.y);
      writer.writeI32(this.levelIndex.x);
      writer.writeI32(this.levelIndex.y);
      // Data size and data
      writer.writeI32(this.data.length);
      writer.writeBytes(this.data);
    } else {
      // Scanline y coordinate
      writer.writeI32(this.yCoordinate);
      // Data size and data
      writer.writeI32(this.data.length);
      writer.writeBytes(this.data);
    }
  }

  // Total byte size of this chunk when written
  get byteSize() {
    if (this.isTile) {
      // 4 ints for coordinates + 1 int for size + data
      return 4 * 4 + 4 + this.data.length;
    } else {
      // 1 int for y + 1 int for size + data
      return 4 + 4 + this.data.length;
    }
  }
}

// Generate block indices for a layer (single level)
function generateBlockIndicesForLevel(layerIndex, levelSize, blocks, compression, levelIndex) {
  const indices = [];

  if (blocks.isTiled()) {
    const tileSize = blocks.tileSize;
    const tilesX = Math.ceil(levelSize.x / tileSize.x);
    const tilesY = Math.ceil(levelSize.y / tileSize.y);

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const pixelX = tx * tileSize.x;
        const pixelY = ty * tileSize.y;
        const width = Math.min(tileSize.x, levelSize.x - pixelX);
        const height = Math.min(tileSize.y, levelSize.y - pixelY);

        indices.push(
          new BlockIndex(
            layerIndex,
            new Vec2(pixelX, pixelY),
            new Vec2(width, height),
            levelIndex
          )
        );
      }
    }
  } else {
    // Scanline blocks
    const linesPerBlock = scanLinesPerBlock(compression);

    for (let y = 0; y < levelSize.y; y += linesPerBlock) {
      const height = Math.min(linesPerBlock, levelSize.y - y);

      indices.push(
        new BlockIndex(layerIndex, new Vec2(0, y), new Vec2(levelSize.x, height), levelIndex)
      );
    }
  }

  return indices;
}

// Generate block indices for a layer (all levels)
export function generateBlockIndices(layerIndex, layerSize, blocks, compression) {
  const indices = [];
  const levelCounts = getLevelCounts(layerSize, blocks.levelMode);

  if (blocks.levelMode === LevelMode.MipMap) {
    // Mip maps: level (0,0), (1,1), (2,2), etc.
    for (let level = 0; level < levelCounts.x; level++) {
      const levelIndex = new Vec2(level, level);
      const levelSize = getLevelSize(layerSize, levelIndex, blocks.levelMode, blocks.roundingMode);
      const levelBlocks = generateBlockIndicesForLevel(
        layerIndex, levelSize, blocks, compression, levelIndex
      );
      indices.push(...levelBlocks);
    }
  } else if (blocks.levelMode === LevelMode.RipMap) {
    // Rip maps: all combinations of (lx, ly)
    for (let ly = 0; ly < levelCounts.y; ly++) {
      for (let lx = 0; lx < levelCounts.x; lx++) {
        const levelIndex = new Vec2(lx, ly);
        const levelSize = getLevelSize(layerSize, levelIndex, blocks.levelMode, blocks.roundingMode);
        const levelBlocks = generateBlockIndicesForLevel(
          layerIndex, levelSize, blocks, compression, levelIndex
        );
        indices.push(...levelBlocks);
      }
    }
  } else {
    // Singular: just level (0,0)
    indices.push(...generateBlockIndicesForLevel(
      layerIndex, layerSize, blocks, compression, new Vec2(0, 0)
    ));
  }

  return indices;
}

// Calculate total tile count for all levels
export function calculateTotalTileCount(layerSize, blocks) {
  const tileSize = blocks.tileSize;
  const levelCounts = getLevelCounts(layerSize, blocks.levelMode);
  let totalTiles = 0;

  if (blocks.levelMode === LevelMode.MipMap) {
    for (let level = 0; level < levelCounts.x; level++) {
      const levelIndex = new Vec2(level, level);
      const levelSize = getLevelSize(layerSize, levelIndex, blocks.levelMode, blocks.roundingMode);
      const tilesX = Math.ceil(levelSize.x / tileSize.x);
      const tilesY = Math.ceil(levelSize.y / tileSize.y);
      totalTiles += tilesX * tilesY;
    }
  } else if (blocks.levelMode === LevelMode.RipMap) {
    for (let ly = 0; ly < levelCounts.y; ly++) {
      for (let lx = 0; lx < levelCounts.x; lx++) {
        const levelIndex = new Vec2(lx, ly);
        const levelSize = getLevelSize(layerSize, levelIndex, blocks.levelMode, blocks.roundingMode);
        const tilesX = Math.ceil(levelSize.x / tileSize.x);
        const tilesY = Math.ceil(levelSize.y / tileSize.y);
        totalTiles += tilesX * tilesY;
      }
    }
  } else {
    const tilesX = Math.ceil(layerSize.x / tileSize.x);
    const tilesY = Math.ceil(layerSize.y / tileSize.y);
    totalTiles = tilesX * tilesY;
  }

  return totalTiles;
}

// Extract pixel data for a block from layer data
export function extractBlockData(blockIndex, channels, layerSize) {
  const { pixelPosition, pixelSize } = blockIndex;
  const channelList = channels.getChannelList();

  // Calculate total bytes for this block
  const pixelCount = pixelSize.x * pixelSize.y;
  const bytesPerPixel = channelList.bytesPerPixel;
  const totalBytes = pixelCount * bytesPerPixel;

  const data = new Uint8Array(totalBytes);
  let offset = 0;

  // For each scanline in the block
  for (let localY = 0; localY < pixelSize.y; localY++) {
    const globalY = pixelPosition.y + localY;

    // For each channel (in alphabetical order)
    for (const channelDesc of channelList.list) {
      const bytesPerSample = channelDesc.bytesPerSample;

      // For each pixel in the scanline
      for (let localX = 0; localX < pixelSize.x; localX++) {
        const globalX = pixelPosition.x + localX;
        const pixelIndex = globalY * layerSize.x + globalX;

        // Get the sample value and write it
        const bytes = channels.getSampleBytes(channelDesc.name, pixelIndex);
        data.set(bytes, offset);
        offset += bytesPerSample;
      }
    }
  }

  return data;
}
