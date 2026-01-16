// EXR Header Reading
// Parse EXR file headers including magic number, version, and attributes.

import { BinaryReader } from '../io/binary-reader.js';
import { MAGIC_NUMBER, EXR_VERSION, VersionFlags, RequiredAttributes, LayerType } from '../core/constants.js';
import { Vec2, IntegerBounds, Compression, LineOrder, LevelMode, scanLinesPerBlock, Blocks } from '../core/types.js';
import { readAttribute } from './read-attributes.js';
import { ChannelList } from './attributes.js';

// Parsed EXR header containing all attributes
export class ParsedHeader {
  constructor() {
    // Required attributes
    // @type {ChannelList|null}
    this.channels = null;
    // @type {number}
    this.compression = Compression.Uncompressed;
    // @type {IntegerBounds|null}
    this.dataWindow = null;
    // @type {IntegerBounds|null}
    this.displayWindow = null;
    // @type {number}
    this.lineOrder = LineOrder.Increasing;
    // @type {number}
    this.pixelAspectRatio = 1.0;
    // @type {Vec2}
    this.screenWindowCenter = new Vec2(0, 0);
    // @type {number}
    this.screenWindowWidth = 1.0;

    // Optional/tiled attributes
    // @type {{ tileSize: Vec2, levelMode: number, roundingMode: number }|null}
    this.tiles = null;

    // Multi-part attributes
    // @type {string|null}
    this.name = null;
    // @type {string|null}
    this.type = null;
    // @type {number|null}
    this.chunkCount = null;

    // Custom attributes
    // @type {Map<string, any>}
    this.customAttributes = new Map();
  }

  // Get image width
// @returns {number}
  get width() {
    return this.dataWindow?.size.x ?? 0;
  }

  // Get image height
// @returns {number}
  get height() {
    return this.dataWindow?.size.y ?? 0;
  }

  // Check if this is a tiled image
// @returns {boolean}
  get isTiled() {
    return this.tiles !== null;
  }

  // Get the block storage mode
// @returns {Blocks}
  get blocks() {
    if (this.tiles) {
      return new Blocks('tiles', this.tiles.tileSize, this.tiles.levelMode, this.tiles.roundingMode);
    }
    return Blocks.ScanLines;
  }

  // Get scanlines per block for this header's compression
// @returns {number}
  get scanLinesPerBlock() {
    return scanLinesPerBlock(this.compression);
  }

  // Validate that all required attributes are present
// @throws {Error} if missing required attributes
  validate() {
    const missing = [];
    if (!this.channels) missing.push('channels');
    if (this.compression === undefined) missing.push('compression');
    if (!this.dataWindow) missing.push('dataWindow');
    if (!this.displayWindow) missing.push('displayWindow');
    if (this.lineOrder === undefined) missing.push('lineOrder');
    if (this.pixelAspectRatio === undefined) missing.push('pixelAspectRatio');
    if (!this.screenWindowCenter) missing.push('screenWindowCenter');
    if (this.screenWindowWidth === undefined) missing.push('screenWindowWidth');

    if (missing.length > 0) {
      throw new Error(`Missing required attributes: ${missing.join(', ')}`);
    }
  }
}

// Parsed EXR file metadata
export class ParsedMeta {
  // @param {number} version
// @param {number} flags
// @param {ParsedHeader[]} headers
  constructor(version, flags, headers) {
    this.version = version;
    this.flags = flags;
    this.headers = headers;
  }

  // @returns {boolean}
  get isTiled() {
    return (this.flags & VersionFlags.TILED) !== 0;
  }

  // @returns {boolean}
  get hasLongNames() {
    return (this.flags & VersionFlags.LONG_NAMES) !== 0;
  }

  // @returns {boolean}
  get isDeepData() {
    return (this.flags & VersionFlags.DEEP_DATA) !== 0;
  }

  // @returns {boolean}
  get isMultiPart() {
    return (this.flags & VersionFlags.MULTI_PART) !== 0;
  }

  // @returns {number}
  get layerCount() {
    return this.headers.length;
  }
}

// Read and validate EXR magic number
// @param {BinaryReader} reader
// @throws {Error} if magic number is invalid
export function readMagicNumber(reader) {
  const magic = reader.readU32();
  if (magic !== MAGIC_NUMBER) {
    throw new Error(`Invalid EXR magic number: 0x${magic.toString(16)} (expected 0x${MAGIC_NUMBER.toString(16)})`);
  }
}

// Read and parse version and flags
// @param {BinaryReader} reader
// @returns {{ version: number, flags: number }}
export function readVersionAndFlags(reader) {
  const versionAndFlags = reader.readU32();
  const version = versionAndFlags & 0xff;
  const flags = versionAndFlags & 0xffffff00;

  if (version !== EXR_VERSION) {
    throw new Error(`Unsupported EXR version: ${version} (expected ${EXR_VERSION})`);
  }

  // Check for unsupported features
  if (flags & VersionFlags.DEEP_DATA) {
    throw new Error('Deep data EXR files are not supported');
  }

  return { version, flags };
}

// Read a single header
// @param {BinaryReader} reader
// @returns {ParsedHeader}
export function readHeader(reader) {
  const header = new ParsedHeader();

  // Read attributes until null byte
  while (true) {
    const attr = readAttribute(reader);
    if (attr === null) {
      break; // End of header
    }

    // Store attribute value
    switch (attr.name) {
      case 'channels':
        header.channels = attr.value;
        break;
      case 'compression':
        header.compression = attr.value;
        break;
      case 'dataWindow':
        header.dataWindow = attr.value;
        break;
      case 'displayWindow':
        header.displayWindow = attr.value;
        break;
      case 'lineOrder':
        header.lineOrder = attr.value;
        break;
      case 'pixelAspectRatio':
        header.pixelAspectRatio = attr.value;
        break;
      case 'screenWindowCenter':
        header.screenWindowCenter = attr.value;
        break;
      case 'screenWindowWidth':
        header.screenWindowWidth = attr.value;
        break;
      case 'tiles':
        header.tiles = attr.value;
        break;
      case 'name':
        header.name = attr.value;
        break;
      case 'type':
        header.type = attr.value;
        break;
      case 'chunkCount':
        header.chunkCount = attr.value;
        break;
      default:
        // Store as custom attribute
        header.customAttributes.set(attr.name, attr.value);
        break;
    }
  }

  return header;
}

// Read all headers from an EXR file
// @param {BinaryReader} reader
// @param {boolean} isMultiPart
// @returns {ParsedHeader[]}
export function readHeaders(reader, isMultiPart) {
  const headers = [];

  if (isMultiPart) {
    // Multi-part: read headers until empty header (just a null byte)
    while (reader.peekU8() !== 0) {
      headers.push(readHeader(reader));
    }
    // Skip the final null byte that terminates the header list
    reader.skip(1);
  } else {
    // Single-part: just one header
    headers.push(readHeader(reader));
  }

  // Validate all headers
  for (const header of headers) {
    header.validate();
  }

  return headers;
}

// Read complete EXR metadata (magic, version, headers)
// @param {BinaryReader} reader
// @returns {ParsedMeta}
export function readMeta(reader) {
  // Read magic number
  readMagicNumber(reader);

  // Read version and flags
  const { version, flags } = readVersionAndFlags(reader);

  // Determine if multi-part
  const isMultiPart = (flags & VersionFlags.MULTI_PART) !== 0;

  // Read headers
  const headers = readHeaders(reader, isMultiPart);

  return new ParsedMeta(version, flags, headers);
}

// Calculate the number of chunks in a layer
// @param {ParsedHeader} header
// @returns {number}
export function calculateChunkCount(header) {
  if (header.chunkCount !== null) {
    return header.chunkCount;
  }

  const dataWindow = header.dataWindow;
  if (!dataWindow) {
    throw new Error('Cannot calculate chunk count without dataWindow');
  }

  if (header.isTiled) {
    // Tiled: count tiles across all levels
    const tiles = header.tiles;
    const { tileSize, levelMode, roundingMode } = tiles;

    if (levelMode === LevelMode.Singular) {
      // Just count tiles at level 0
      const tilesX = Math.ceil(dataWindow.size.x / tileSize.x);
      const tilesY = Math.ceil(dataWindow.size.y / tileSize.y);
      return tilesX * tilesY;
    } else if (levelMode === LevelMode.MipMap) {
      // Count tiles across all mip levels
      let total = 0;
      let levelWidth = dataWindow.size.x;
      let levelHeight = dataWindow.size.y;

      while (levelWidth >= 1 || levelHeight >= 1) {
        const tilesX = Math.ceil(Math.max(1, levelWidth) / tileSize.x);
        const tilesY = Math.ceil(Math.max(1, levelHeight) / tileSize.y);
        total += tilesX * tilesY;

        if (levelWidth === 1 && levelHeight === 1) break;

        if (roundingMode === 1) {
          // Round up
          levelWidth = Math.ceil(levelWidth / 2);
          levelHeight = Math.ceil(levelHeight / 2);
        } else {
          // Round down
          levelWidth = Math.floor(levelWidth / 2);
          levelHeight = Math.floor(levelHeight / 2);
        }
        levelWidth = Math.max(1, levelWidth);
        levelHeight = Math.max(1, levelHeight);
      }
      return total;
    } else if (levelMode === LevelMode.RipMap) {
      // Count tiles across all rip map levels
      let total = 0;
      let levelWidthX = dataWindow.size.x;

      while (levelWidthX >= 1) {
        let levelHeightY = dataWindow.size.y;

        while (levelHeightY >= 1) {
          const tilesX = Math.ceil(Math.max(1, levelWidthX) / tileSize.x);
          const tilesY = Math.ceil(Math.max(1, levelHeightY) / tileSize.y);
          total += tilesX * tilesY;

          if (levelHeightY === 1) break;
          if (roundingMode === 1) {
            levelHeightY = Math.ceil(levelHeightY / 2);
          } else {
            levelHeightY = Math.floor(levelHeightY / 2);
          }
          levelHeightY = Math.max(1, levelHeightY);
        }

        if (levelWidthX === 1) break;
        if (roundingMode === 1) {
          levelWidthX = Math.ceil(levelWidthX / 2);
        } else {
          levelWidthX = Math.floor(levelWidthX / 2);
        }
        levelWidthX = Math.max(1, levelWidthX);
      }
      return total;
    }
  } else {
    // Scanline: count blocks
    const linesPerBlock = header.scanLinesPerBlock;
    return Math.ceil(dataWindow.size.y / linesPerBlock);
  }

  return 0;
}

// Read offset table for a layer
// @param {BinaryReader} reader
// @param {number} chunkCount
// @returns {bigint[]}
export function readOffsetTable(reader, chunkCount) {
  const offsets = [];
  for (let i = 0; i < chunkCount; i++) {
    offsets.push(reader.readU64());
  }
  return offsets;
}
