/**
 * EXR Header
 *
 * Each layer in an EXR file has a header containing attributes.
 * Headers are written as a sequence of attributes followed by a null byte.
 */

import { BinaryWriter } from '../io/binary-writer.js';
import {
  Vec2,
  IntegerBounds,
  Compression,
  LineOrder,
  Blocks,
  LevelMode,
  RoundingMode,
  scanLinesPerBlock,
} from '../core/types.js';
import { LayerType, DEFAULT_TILE_SIZE } from '../core/constants.js';
import { calculateTotalTileCount } from '../block/index.js';
import {
  ChannelList,
  ChannelDescription,
  writeBox2i,
  writeCompression,
  writeLineOrder,
  writeFloat,
  writeV2f,
  writeChannelList,
  writeType,
  writeTileDescription,
  writeString,
  writeInt,
} from './attributes.js';

/**
 * Image-level attributes shared across all layers
 */
export class ImageAttributes {
  /**
   * @param {IntegerBounds} displayWindow
   */
  constructor(displayWindow) {
    this.displayWindow = displayWindow;
    this.pixelAspect = 1.0;
    this.chromaticities = null;
    this.timeCode = null;
    this.custom = new Map();
  }

  /**
   * Create image attributes with display window matching a size
   * @param {Vec2} size
   * @returns {ImageAttributes}
   */
  static withSize(size) {
    return new ImageAttributes(IntegerBounds.fromDimensions(size.x, size.y));
  }
}

/**
 * Layer-level attributes
 */
export class LayerAttributes {
  constructor() {
    this.layerName = null;
    this.layerPosition = new Vec2(0, 0);
    this.screenWindowCenter = new Vec2(0.0, 0.0);
    this.screenWindowWidth = 1.0;
    this.custom = new Map();
  }

  /**
   * Create layer attributes with a name
   * @param {string} name
   * @returns {LayerAttributes}
   */
  static named(name) {
    const attrs = new LayerAttributes();
    attrs.layerName = name;
    return attrs;
  }
}

/**
 * Encoding settings for a layer
 */
export class Encoding {
  /**
   * @param {number} compression
   * @param {Blocks} blocks
   * @param {number} lineOrder
   */
  constructor(compression, blocks, lineOrder) {
    this.compression = compression;
    this.blocks = blocks;
    this.lineOrder = lineOrder;
  }

  /** Uncompressed scanlines */
  static UNCOMPRESSED = new Encoding(
    Compression.Uncompressed,
    Blocks.ScanLines,
    LineOrder.Increasing
  );

  /** RLE compressed tiles - fast encoding, good compression */
  static FAST_LOSSLESS = new Encoding(
    Compression.RLE,
    Blocks.Tiles(new Vec2(DEFAULT_TILE_SIZE, DEFAULT_TILE_SIZE)),
    LineOrder.Unspecified
  );

  /** ZIP16 compressed scanlines - smaller files */
  static SMALL_LOSSLESS = new Encoding(
    Compression.ZIP16,
    Blocks.ScanLines,
    LineOrder.Increasing
  );

  /** PIZ compressed tiles - best for noisy images */
  static SMALL_FAST_LOSSLESS = new Encoding(
    Compression.PIZ,
    Blocks.Tiles(new Vec2(256, 256)),
    LineOrder.Unspecified
  );
}

/**
 * Header for a single layer
 */
export class Header {
  /**
   * @param {Vec2} layerSize - Layer resolution
   * @param {ChannelList} channels - Channel descriptions
   * @param {Encoding} encoding - Compression and block settings
   * @param {ImageAttributes} sharedAttributes - Image-level attributes
   * @param {LayerAttributes} ownAttributes - Layer-level attributes
   */
  constructor(layerSize, channels, encoding, sharedAttributes, ownAttributes) {
    this.layerSize = layerSize;
    this.channels = channels;
    this.encoding = encoding;
    this.sharedAttributes = sharedAttributes;
    this.ownAttributes = ownAttributes;
  }

  /**
   * Get the data window bounds
   * @returns {IntegerBounds}
   */
  get dataWindow() {
    return new IntegerBounds(this.ownAttributes.layerPosition, this.layerSize);
  }

  /**
   * Calculate the number of blocks/chunks in this layer
   * @returns {number}
   */
  get chunkCount() {
    if (this.encoding.blocks.isTiled()) {
      return calculateTotalTileCount(this.layerSize, this.encoding.blocks);
    } else {
      // Scanline blocks
      const linesPerBlock = scanLinesPerBlock(this.encoding.compression);
      return Math.ceil(this.layerSize.y / linesPerBlock);
    }
  }

  /**
   * Get the layer type string
   * @returns {string}
   */
  get layerType() {
    return this.encoding.blocks.isTiled() ? LayerType.TILED : LayerType.SCANLINE;
  }

  /**
   * Write this header to a writer
   * @param {BinaryWriter} writer
   * @param {boolean} isMultiPart - Whether this is a multi-part file
   */
  write(writer, isMultiPart) {
    // Required attributes
    writeChannelList(writer, this.channels);
    writeCompression(writer, this.encoding.compression);
    writeBox2i(writer, 'dataWindow', this.dataWindow);
    writeBox2i(writer, 'displayWindow', this.sharedAttributes.displayWindow);
    writeLineOrder(writer, this.encoding.lineOrder);
    writeFloat(writer, 'pixelAspectRatio', this.sharedAttributes.pixelAspect);
    writeV2f(writer, 'screenWindowCenter', this.ownAttributes.screenWindowCenter);
    writeFloat(writer, 'screenWindowWidth', this.ownAttributes.screenWindowWidth);

    // Tile description (if tiled)
    if (this.encoding.blocks.isTiled()) {
      writeTileDescription(
        writer,
        this.encoding.blocks.tileSize,
        this.encoding.blocks.levelMode,
        this.encoding.blocks.roundingMode
      );
    }

    // Multi-part attributes
    if (isMultiPart) {
      // name is required for multi-part files
      const name = this.ownAttributes.layerName || '';
      writeString(writer, 'name', name);
      writeType(writer, this.layerType);
      writeInt(writer, 'chunkCount', this.chunkCount);
    }

    // Custom attributes
    for (const [name, value] of this.ownAttributes.custom) {
      // TODO: Support custom attribute types
    }

    // End of header (null byte)
    writer.writeU8(0);
  }
}

/**
 * Write all headers to a writer
 * @param {BinaryWriter} writer
 * @param {Header[]} headers
 * @param {boolean} isMultiPart
 */
export function writeHeaders(writer, headers, isMultiPart) {
  for (const header of headers) {
    header.write(writer, isMultiPart);
  }

  // Multi-part files have an extra null byte after all headers
  if (isMultiPart) {
    writer.writeU8(0);
  }
}
