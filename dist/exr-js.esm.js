/**
 * Core data types for EXR images
 */

/**
 * 2D vector for coordinates and dimensions
 */
class Vec2 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  /** @returns {number} */
  area() {
    return this.x * this.y;
  }

  /**
   * Convert 2D position to flat array index
   * @param {number} width - Row width
   * @returns {number}
   */
  flatIndex(width) {
    return this.y * width + this.x;
  }

  /**
   * @param {Vec2} other
   * @returns {Vec2}
   */
  add(other) {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  /**
   * @param {Vec2} other
   * @returns {Vec2}
   */
  sub(other) {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  /**
   * @param {number} scalar
   * @returns {Vec2}
   */
  mul(scalar) {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  /**
   * @param {number} scalar
   * @returns {Vec2}
   */
  div(scalar) {
    return new Vec2(Math.floor(this.x / scalar), Math.floor(this.y / scalar));
  }

  /**
   * @param {Vec2} other
   * @returns {boolean}
   */
  equals(other) {
    return this.x === other.x && this.y === other.y;
  }

  clone() {
    return new Vec2(this.x, this.y);
  }

  toString() {
    return `Vec2(${this.x}, ${this.y})`;
  }
}

/**
 * Integer rectangle bounds (data window, display window, block bounds)
 */
class IntegerBounds {
  /**
   * @param {Vec2} position - Top-left corner (can be negative)
   * @param {Vec2} size - Width and height (always positive)
   */
  constructor(position, size) {
    this.position = position;
    this.size = size;
  }

  /**
   * Create bounds from dimensions starting at origin
   * @param {number} width
   * @param {number} height
   * @returns {IntegerBounds}
   */
  static fromDimensions(width, height) {
    return new IntegerBounds(new Vec2(0, 0), new Vec2(width, height));
  }

  /**
   * Create bounds from min/max coordinates
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX - Exclusive
   * @param {number} maxY - Exclusive
   * @returns {IntegerBounds}
   */
  static fromMinMax(minX, minY, maxX, maxY) {
    return new IntegerBounds(
      new Vec2(minX, minY),
      new Vec2(maxX - minX, maxY - minY)
    );
  }

  /** @returns {Vec2} End position (exclusive) */
  end() {
    return new Vec2(
      this.position.x + this.size.x,
      this.position.y + this.size.y
    );
  }

  /** @returns {number} Total pixel count */
  area() {
    return this.size.area();
  }

  /**
   * Check if a position is within bounds
   * @param {Vec2} pos
   * @returns {boolean}
   */
  contains(pos) {
    const end = this.end();
    return (
      pos.x >= this.position.x &&
      pos.x < end.x &&
      pos.y >= this.position.y &&
      pos.y < end.y
    );
  }

  /**
   * Intersect with another bounds
   * @param {IntegerBounds} other
   * @returns {IntegerBounds|null}
   */
  intersect(other) {
    const minX = Math.max(this.position.x, other.position.x);
    const minY = Math.max(this.position.y, other.position.y);
    const maxX = Math.min(this.end().x, other.end().x);
    const maxY = Math.min(this.end().y, other.end().y);

    if (minX >= maxX || minY >= maxY) {
      return null;
    }

    return IntegerBounds.fromMinMax(minX, minY, maxX, maxY);
  }

  clone() {
    return new IntegerBounds(this.position.clone(), this.size.clone());
  }

  toString() {
    return `IntegerBounds(${this.position}, ${this.size})`;
  }
}

/**
 * Sample type enumeration - the type of each pixel sample value
 */
const SampleType = Object.freeze({
  /** 16-bit IEEE 754 half-precision float */
  F16: 'f16',
  /** 32-bit IEEE 754 single-precision float */
  F32: 'f32',
  /** 32-bit unsigned integer */
  U32: 'u32',
});

/**
 * Get the number of bytes per sample for a given sample type
 * @param {string} sampleType
 * @returns {number}
 */
function bytesPerSample(sampleType) {
  switch (sampleType) {
    case SampleType.F16:
      return 2;
    case SampleType.F32:
    case SampleType.U32:
      return 4;
    default:
      throw new Error(`Unknown sample type: ${sampleType}`);
  }
}

/**
 * Compression method enumeration
 */
const Compression = Object.freeze({
  /** No compression */
  Uncompressed: 0,
  /** Run-length encoding */
  RLE: 1,
  /** zlib compression, one scan line at a time */
  ZIP1: 2,
  /** zlib compression, 16 scan lines at a time */
  ZIP16: 3,
  /** PIZ-based wavelet compression */
  PIZ: 4,
  /** lossy 24-bit float compression */
  PXR24: 5,
  /** lossy 4x4 pixel block compression, fixed rate */
  B44: 6,
  /** lossy 4x4 pixel block compression, flat fields compressed more */
  B44A: 7,
});

/**
 * Get the number of scan lines per block for a compression method
 * @param {number} compression
 * @returns {number}
 */
function scanLinesPerBlock(compression) {
  switch (compression) {
    case Compression.Uncompressed:
    case Compression.RLE:
    case Compression.ZIP1:
      return 1;
    case Compression.ZIP16:
    case Compression.PXR24:
      return 16;
    case Compression.PIZ:
    case Compression.B44:
    case Compression.B44A:
      return 32;
    default:
      return 1;
  }
}

/**
 * Line order enumeration
 */
const LineOrder = Object.freeze({
  /** Scan lines are stored in increasing Y order */
  Increasing: 0,
  /** Scan lines are stored in decreasing Y order */
  Decreasing: 1,
  /** Scan lines are stored in unspecified order (for tiled images) */
  Unspecified: 2,
});

/**
 * Block storage mode
 */
class Blocks {
  /**
   * @param {'scanlines' | 'tiles'} type
   * @param {Vec2|null} tileSize
   * @param {number} levelMode - LevelMode.Singular, MipMap, or RipMap
   * @param {number} roundingMode - RoundingMode.Down or Up
   */
  constructor(type, tileSize = null, levelMode = 0, roundingMode = 0) {
    this.type = type;
    this.tileSize = tileSize;
    this.levelMode = levelMode;
    this.roundingMode = roundingMode;
  }

  static ScanLines = new Blocks('scanlines');

  /**
   * Create tiled block mode
   * @param {Vec2} size - Tile dimensions
   * @returns {Blocks}
   */
  static Tiles(size) {
    return new Blocks('tiles', size, 0, 0); // Singular, RoundDown
  }

  /**
   * Create tiled block mode with mip maps
   * @param {Vec2} size - Tile dimensions
   * @param {number} roundingMode - RoundingMode.Down or Up
   * @returns {Blocks}
   */
  static MipMaps(size, roundingMode = 0) {
    return new Blocks('tiles', size, 1, roundingMode); // MipMap
  }

  /**
   * Create tiled block mode with rip maps
   * @param {Vec2} size - Tile dimensions
   * @param {number} roundingMode - RoundingMode.Down or Up
   * @returns {Blocks}
   */
  static RipMaps(size, roundingMode = 0) {
    return new Blocks('tiles', size, 2, roundingMode); // RipMap
  }

  isTiled() {
    return this.type === 'tiles';
  }

  hasMipMaps() {
    return this.levelMode === 1;
  }

  hasRipMaps() {
    return this.levelMode === 2;
  }

  hasLevels() {
    return this.levelMode !== 0;
  }
}

/**
 * Level mode for mip/rip maps
 */
const LevelMode = Object.freeze({
  /** Single resolution */
  Singular: 0,
  /** Mip maps (powers of 2 reduction in both dimensions) */
  MipMap: 1,
  /** Rip maps (independent powers of 2 reduction in each dimension) */
  RipMap: 2,
});

/**
 * Rounding mode for level size calculations
 */
const RoundingMode = Object.freeze({
  /** Round down */
  Down: 0,
  /** Round up */
  Up: 1,
});

/**
 * Calculate the size at a given mip level
 * @param {number} fullSize - Full resolution size
 * @param {number} level - Level index (0 = full resolution)
 * @param {number} roundingMode - RoundingMode.Down or Up
 * @returns {number}
 */
function mipLevelSize(fullSize, level, roundingMode) {
  if (level === 0) return fullSize;

  let size = fullSize;
  for (let i = 0; i < level; i++) {
    if (roundingMode === RoundingMode.Up) {
      size = Math.ceil(size / 2);
    } else {
      size = Math.floor(size / 2);
    }
    if (size < 1) size = 1;
  }
  return size;
}

/**
 * Calculate the number of mip levels for a given dimension
 * @param {number} fullSize - Full resolution size
 * @returns {number}
 */
function mipLevelCount(fullSize) {
  if (fullSize <= 0) return 0;
  return 1 + Math.floor(Math.log2(fullSize));
}

/**
 * Calculate mip level counts for an image
 * For mip maps: both dimensions use max(width, height) level count
 * For rip maps: each dimension has its own level count
 * @param {Vec2} size - Full resolution size
 * @param {number} levelMode - LevelMode.Singular, MipMap, or RipMap
 * @returns {Vec2} - Level counts (x levels, y levels)
 */
function getLevelCounts(size, levelMode) {
  if (levelMode === LevelMode.Singular) {
    return new Vec2(1, 1);
  } else if (levelMode === LevelMode.MipMap) {
    const maxDim = Math.max(size.x, size.y);
    const count = mipLevelCount(maxDim);
    return new Vec2(count, count);
  } else if (levelMode === LevelMode.RipMap) {
    return new Vec2(mipLevelCount(size.x), mipLevelCount(size.y));
  }
  return new Vec2(1, 1);
}

/**
 * Calculate the size of a level for mip/rip maps
 * @param {Vec2} fullSize - Full resolution size
 * @param {Vec2} levelIndex - Level index (x level, y level)
 * @param {number} levelMode - LevelMode.Singular, MipMap, or RipMap
 * @param {number} roundingMode - RoundingMode.Down or Up
 * @returns {Vec2}
 */
function getLevelSize(fullSize, levelIndex, levelMode, roundingMode) {
  if (levelMode === LevelMode.Singular) {
    return fullSize.clone();
  } else if (levelMode === LevelMode.MipMap) {
    // For mip maps, x and y level must be equal
    const level = levelIndex.x;
    return new Vec2(
      mipLevelSize(fullSize.x, level, roundingMode),
      mipLevelSize(fullSize.y, level, roundingMode)
    );
  } else if (levelMode === LevelMode.RipMap) {
    // For rip maps, x and y levels can differ
    return new Vec2(
      mipLevelSize(fullSize.x, levelIndex.x, roundingMode),
      mipLevelSize(fullSize.y, levelIndex.y, roundingMode)
    );
  }
  return fullSize.clone();
}

/**
 * IEEE 754 Half-precision (16-bit) floating point conversion
 *
 * Format: 1 sign bit, 5 exponent bits, 10 mantissa bits
 * Bias: 15
 * Range: ~6.1e-5 to 65504
 */

// Reusable typed arrays for bit manipulation
const f32View = new Float32Array(1);
const u32View = new Uint32Array(f32View.buffer);

/**
 * Convert 32-bit float to 16-bit half-precision
 * @param {number} value - 32-bit float
 * @returns {number} - 16-bit half-precision as unsigned integer
 */
function floatToHalf(value) {
  f32View[0] = value;
  const bits = u32View[0];

  // Extract components
  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;

  // Handle special cases
  if (exp === 0) {
    // Zero or denormalized (too small for f16)
    return sign; // Flush to signed zero
  }

  if (exp === 255) {
    // Infinity or NaN
    if (mantissa === 0) {
      return sign | 0x7c00; // Infinity
    }
    // NaN - preserve some mantissa bits
    return sign | 0x7c00 | (mantissa >>> 13);
  }

  // Normalized number
  // Convert exponent from bias-127 to bias-15
  let newExp = exp - 127 + 15;

  if (newExp >= 31) {
    // Overflow to infinity
    return sign | 0x7c00;
  }

  if (newExp <= 0) {
    // Denormalized in f16 or underflow
    if (newExp < -10) {
      // Too small, flush to zero
      return sign;
    }

    // Denormalized: shift mantissa right
    const shift = 1 - newExp;
    const denormMantissa = (mantissa | 0x800000) >>> (13 + shift);
    return sign | denormMantissa;
  }

  // Normal case: truncate mantissa to 10 bits
  return sign | (newExp << 10) | (mantissa >>> 13);
}

/**
 * Convert 16-bit half-precision to 32-bit float
 * @param {number} half - 16-bit half-precision as unsigned integer
 * @returns {number} - 32-bit float
 */
function halfToFloat(half) {
  const sign = (half & 0x8000) >>> 15;
  const exp = (half & 0x7c00) >>> 10;
  const mantissa = half & 0x03ff;

  if (exp === 0) {
    if (mantissa === 0) {
      // Zero
      u32View[0] = sign << 31;
      return f32View[0];
    }
    // Denormalized - convert to normalized f32
    let e = -14;
    let m = mantissa;
    while ((m & 0x400) === 0) {
      m <<= 1;
      e--;
    }
    m &= 0x3ff;
    u32View[0] = (sign << 31) | ((e + 127) << 23) | (m << 13);
    return f32View[0];
  }

  if (exp === 31) {
    if (mantissa === 0) {
      // Infinity
      u32View[0] = (sign << 31) | 0x7f800000;
      return f32View[0];
    }
    // NaN
    u32View[0] = (sign << 31) | 0x7f800000 | (mantissa << 13);
    return f32View[0];
  }

  // Normalized number
  const newExp = exp - 15 + 127;
  u32View[0] = (sign << 31) | (newExp << 23) | (mantissa << 13);
  return f32View[0];
}

/**
 * Convert a Float32Array to half-precision Uint16Array
 * @param {Float32Array} floats
 * @returns {Uint16Array}
 */
function float32ArrayToHalf(floats) {
  const result = new Uint16Array(floats.length);
  for (let i = 0; i < floats.length; i++) {
    result[i] = floatToHalf(floats[i]);
  }
  return result;
}

/**
 * Convert a half-precision Uint16Array to Float32Array
 * @param {Uint16Array} halves
 * @returns {Float32Array}
 */
function halfToFloat32Array(halves) {
  const result = new Float32Array(halves.length);
  for (let i = 0; i < halves.length; i++) {
    result[i] = halfToFloat(halves[i]);
  }
  return result;
}

/**
 * Little-endian binary writer with automatic buffer growth
 */


const DEFAULT_CAPACITY = 65536;
const GROWTH_FACTOR = 2;

/**
 * Binary writer for constructing EXR files
 * All multi-byte values are written in little-endian format
 */
class BinaryWriter {
  /**
   * @param {number} initialCapacity - Initial buffer size in bytes
   */
  constructor(initialCapacity = DEFAULT_CAPACITY) {
    this.buffer = new ArrayBuffer(initialCapacity);
    this.view = new DataView(this.buffer);
    this.u8 = new Uint8Array(this.buffer);
    this.position = 0;
  }

  /**
   * Ensure buffer has capacity for additional bytes
   * @param {number} additional - Number of bytes needed
   */
  ensureCapacity(additional) {
    const required = this.position + additional;
    if (required <= this.buffer.byteLength) {
      return;
    }

    // Grow buffer
    let newCapacity = this.buffer.byteLength;
    while (newCapacity < required) {
      newCapacity *= GROWTH_FACTOR;
    }

    const newBuffer = new ArrayBuffer(newCapacity);
    new Uint8Array(newBuffer).set(this.u8.subarray(0, this.position));
    this.buffer = newBuffer;
    this.view = new DataView(this.buffer);
    this.u8 = new Uint8Array(this.buffer);
  }

  /**
   * Write unsigned 8-bit integer
   * @param {number} value
   */
  writeU8(value) {
    this.ensureCapacity(1);
    this.u8[this.position++] = value;
  }

  /**
   * Write signed 8-bit integer
   * @param {number} value
   */
  writeI8(value) {
    this.ensureCapacity(1);
    this.view.setInt8(this.position++, value);
  }

  /**
   * Write unsigned 16-bit integer (little-endian)
   * @param {number} value
   */
  writeU16(value) {
    this.ensureCapacity(2);
    this.view.setUint16(this.position, value, true);
    this.position += 2;
  }

  /**
   * Write signed 16-bit integer (little-endian)
   * @param {number} value
   */
  writeI16(value) {
    this.ensureCapacity(2);
    this.view.setInt16(this.position, value, true);
    this.position += 2;
  }

  /**
   * Write unsigned 32-bit integer (little-endian)
   * @param {number} value
   */
  writeU32(value) {
    this.ensureCapacity(4);
    this.view.setUint32(this.position, value, true);
    this.position += 4;
  }

  /**
   * Write signed 32-bit integer (little-endian)
   * @param {number} value
   */
  writeI32(value) {
    this.ensureCapacity(4);
    this.view.setInt32(this.position, value, true);
    this.position += 4;
  }

  /**
   * Write unsigned 64-bit integer (little-endian)
   * @param {number|bigint} value
   */
  writeU64(value) {
    this.ensureCapacity(8);
    this.view.setBigUint64(this.position, BigInt(value), true);
    this.position += 8;
  }

  /**
   * Write signed 64-bit integer (little-endian)
   * @param {number|bigint} value
   */
  writeI64(value) {
    this.ensureCapacity(8);
    this.view.setBigInt64(this.position, BigInt(value), true);
    this.position += 8;
  }

  /**
   * Write 32-bit float (little-endian)
   * @param {number} value
   */
  writeF32(value) {
    this.ensureCapacity(4);
    this.view.setFloat32(this.position, value, true);
    this.position += 4;
  }

  /**
   * Write 64-bit float (little-endian)
   * @param {number} value
   */
  writeF64(value) {
    this.ensureCapacity(8);
    this.view.setFloat64(this.position, value, true);
    this.position += 8;
  }

  /**
   * Write 16-bit half-precision float (little-endian)
   * @param {number} value - 32-bit float to convert and write
   */
  writeF16(value) {
    this.writeU16(floatToHalf(value));
  }

  /**
   * Write raw bytes
   * @param {Uint8Array|ArrayBuffer} bytes
   */
  writeBytes(bytes) {
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    this.ensureCapacity(data.length);
    this.u8.set(data, this.position);
    this.position += data.length;
  }

  /**
   * Write null-terminated string (ASCII/UTF-8)
   * @param {string} str
   */
  writeNullTerminatedString(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.writeBytes(bytes);
    this.writeU8(0); // Null terminator
  }

  /**
   * Write fixed-length string (padded with nulls if shorter)
   * @param {string} str
   * @param {number} length
   */
  writeFixedString(str, length) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.ensureCapacity(length);

    const copyLength = Math.min(bytes.length, length);
    this.u8.set(bytes.subarray(0, copyLength), this.position);

    // Pad with nulls
    for (let i = copyLength; i < length; i++) {
      this.u8[this.position + i] = 0;
    }

    this.position += length;
  }

  /**
   * Write string with length prefix (u32)
   * @param {string} str
   */
  writeLengthPrefixedString(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.writeU32(bytes.length);
    this.writeBytes(bytes);
  }

  /**
   * Get current write position
   * @returns {number}
   */
  getPosition() {
    return this.position;
  }

  /**
   * Set write position (for patching values later)
   * @param {number} pos
   */
  setPosition(pos) {
    if (pos < 0 || pos > this.buffer.byteLength) {
      throw new RangeError(`Position ${pos} out of bounds`);
    }
    this.position = pos;
  }

  /**
   * Write a value at a specific position without changing current position
   * @param {number} pos - Position to write at
   * @param {(writer: BinaryWriter) => void} writeFn - Function to perform the write
   */
  patchAt(pos, writeFn) {
    const savedPosition = this.position;
    this.position = pos;
    writeFn(this);
    this.position = savedPosition;
  }

  /**
   * Reserve space and return the position for later patching
   * @param {number} bytes - Number of bytes to reserve
   * @returns {number} - Position of reserved space
   */
  reserve(bytes) {
    const pos = this.position;
    this.ensureCapacity(bytes);
    this.position += bytes;
    return pos;
  }

  /**
   * Get the written data as an ArrayBuffer
   * @returns {ArrayBuffer}
   */
  toArrayBuffer() {
    return this.buffer.slice(0, this.position);
  }

  /**
   * Get the written data as a Uint8Array
   * @returns {Uint8Array}
   */
  toUint8Array() {
    return new Uint8Array(this.buffer, 0, this.position);
  }

  /**
   * Get the current byte length of written data
   * @returns {number}
   */
  get byteLength() {
    return this.position;
  }
}

/**
 * EXR file format constants
 */

/** Magic number identifying an EXR file */
const MAGIC_NUMBER = 0x01312f76; // Little-endian: 0x76, 0x2f, 0x31, 0x01

/** Current EXR version */
const EXR_VERSION = 2;

/** Version flags */
const VersionFlags = Object.freeze({
  /** Single-part tiled image */
  TILED: 1 << 9,
  /** Attribute or channel names longer than 31 characters */
  LONG_NAMES: 1 << 10,
  /** Deep data (not yet supported) */
  DEEP_DATA: 1 << 11,
  /** Multi-part file */
  MULTI_PART: 1 << 12,
});

/** Attribute type names as written in the file */
const AttributeType = Object.freeze({
  BOX2I: 'box2i',
  BOX2F: 'box2f',
  CHLIST: 'chlist',
  CHROMATICITIES: 'chromaticities',
  COMPRESSION: 'compression',
  DOUBLE: 'double',
  ENVMAP: 'envmap',
  FLOAT: 'float',
  INT: 'int',
  KEYCODE: 'keycode',
  LINE_ORDER: 'lineOrder',
  M33F: 'm33f',
  M44F: 'm44f',
  PREVIEW: 'preview',
  RATIONAL: 'rational',
  STRING: 'string',
  STRING_VECTOR: 'stringvector',
  TILE_DESC: 'tiledesc',
  TIMECODE: 'timecode',
  V2I: 'v2i',
  V2F: 'v2f',
  V3I: 'v3i',
  V3F: 'v3f',
});

/** Layer type identifiers */
const LayerType = Object.freeze({
  SCANLINE: 'scanlineimage',
  TILED: 'tiledimage',
  DEEP_SCANLINE: 'deepscanline',
  DEEP_TILED: 'deeptile',
});

/** Default tile size */
const DEFAULT_TILE_SIZE = 64;

/**
 * Block module - pixel block management and chunk writing
 */


/**
 * Index identifying a specific block in the image
 */
class BlockIndex {
  /**
   * @param {number} layer - Layer index
   * @param {Vec2} pixelPosition - Top-left pixel position
   * @param {Vec2} pixelSize - Block dimensions
   * @param {Vec2} levelIndex - Mip/rip level index (0,0 for base level)
   */
  constructor(layer, pixelPosition, pixelSize, levelIndex = new Vec2(0, 0)) {
    this.layer = layer;
    this.pixelPosition = pixelPosition;
    this.pixelSize = pixelSize;
    this.levelIndex = levelIndex;
  }
}

/**
 * Compressed chunk ready for writing
 */
class Chunk {
  /**
   * @param {number} layer - Layer index
   * @param {Uint8Array} data - Compressed data (or uncompressed if compression didn't help)
   * @param {boolean} isTile - Whether this is a tile (vs scanline block)
   * @param {Vec2|null} tileCoordinates - Tile x,y index (for tiles)
   * @param {Vec2|null} levelIndex - Mip/rip level (for tiles)
   * @param {number|null} yCoordinate - Scanline y coordinate (for scanlines)
   */
  constructor(layer, data, isTile, tileCoordinates = null, levelIndex = null, yCoordinate = null) {
    this.layer = layer;
    this.data = data;
    this.isTile = isTile;
    this.tileCoordinates = tileCoordinates;
    this.levelIndex = levelIndex;
    this.yCoordinate = yCoordinate;
  }

  /**
   * Write this chunk to a writer (for multi-part files)
   * @param {BinaryWriter} writer
   */
  writeMultiPart(writer) {
    // Part number (u32)
    writer.writeU32(this.layer);
    this._writeData(writer);
  }

  /**
   * Write this chunk to a writer (for single-part files)
   * @param {BinaryWriter} writer
   */
  writeSinglePart(writer) {
    this._writeData(writer);
  }

  /**
   * Write the chunk data
   * @param {BinaryWriter} writer
   */
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

  /**
   * Total byte size of this chunk when written
   * @returns {number}
   */
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

/**
 * Generate block indices for a layer (single level)
 * @param {number} layerIndex
 * @param {Vec2} levelSize - Size of this level
 * @param {import('../core/types.js').Blocks} blocks
 * @param {number} compression
 * @param {Vec2} levelIndex - Level index (for mip/rip maps)
 * @returns {BlockIndex[]}
 */
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

/**
 * Generate block indices for a layer (all levels)
 * @param {number} layerIndex
 * @param {Vec2} layerSize
 * @param {import('../core/types.js').Blocks} blocks
 * @param {number} compression
 * @returns {BlockIndex[]}
 */
function generateBlockIndices(layerIndex, layerSize, blocks, compression) {
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

/**
 * Calculate total tile count for all levels
 * @param {Vec2} layerSize - Full resolution size
 * @param {import('../core/types.js').Blocks} blocks
 * @returns {number}
 */
function calculateTotalTileCount(layerSize, blocks) {
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

/**
 * Extract pixel data for a block from layer data
 * @param {BlockIndex} blockIndex
 * @param {import('../image/channels.js').WritableChannels} channels
 * @param {Vec2} layerSize
 * @returns {Uint8Array}
 */
function extractBlockData(blockIndex, channels, layerSize) {
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

/**
 * EXR Header Attributes
 *
 * Attributes are key-value pairs stored in headers.
 * Each attribute has: name (null-terminated), type (null-terminated), size (i32), value (bytes)
 */


/**
 * Write a null-terminated string
 * @param {BinaryWriter} writer
 * @param {string} str
 */
function writeNullTerminatedString(writer, str) {
  writer.writeNullTerminatedString(str);
}

/**
 * Write an attribute to the writer
 * @param {BinaryWriter} writer
 * @param {string} name - Attribute name
 * @param {string} typeName - Attribute type name
 * @param {Uint8Array|function} value - Value bytes or write function
 */
function writeAttribute(writer, name, typeName, value) {
  writeNullTerminatedString(writer, name);
  writeNullTerminatedString(writer, typeName);

  if (typeof value === 'function') {
    // Calculate size by writing to temp buffer
    const tempWriter = new BinaryWriter(1024);
    value(tempWriter);
    const bytes = tempWriter.toUint8Array();
    writer.writeI32(bytes.length);
    writer.writeBytes(bytes);
  } else {
    writer.writeI32(value.length);
    writer.writeBytes(value);
  }
}

/**
 * Write a box2i (integer bounds) attribute
 * @param {BinaryWriter} writer
 * @param {string} name
 * @param {IntegerBounds} bounds
 */
function writeBox2i(writer, name, bounds) {
  writeAttribute(writer, name, AttributeType.BOX2I, (w) => {
    // xMin, yMin, xMax, yMax (all i32, max is inclusive)
    w.writeI32(bounds.position.x);
    w.writeI32(bounds.position.y);
    w.writeI32(bounds.position.x + bounds.size.x - 1);
    w.writeI32(bounds.position.y + bounds.size.y - 1);
  });
}

/**
 * Write a compression attribute
 * @param {BinaryWriter} writer
 * @param {number} compression
 */
function writeCompression(writer, compression) {
  writeAttribute(writer, 'compression', AttributeType.COMPRESSION, (w) => {
    w.writeU8(compression);
  });
}

/**
 * Write a line order attribute
 * @param {BinaryWriter} writer
 * @param {number} lineOrder
 */
function writeLineOrder(writer, lineOrder) {
  writeAttribute(writer, 'lineOrder', AttributeType.LINE_ORDER, (w) => {
    w.writeU8(lineOrder);
  });
}

/**
 * Write a float attribute
 * @param {BinaryWriter} writer
 * @param {string} name
 * @param {number} value
 */
function writeFloat(writer, name, value) {
  writeAttribute(writer, name, AttributeType.FLOAT, (w) => {
    w.writeF32(value);
  });
}

/**
 * Write a v2f (Vec2<f32>) attribute
 * @param {BinaryWriter} writer
 * @param {string} name
 * @param {Vec2} value
 */
function writeV2f(writer, name, value) {
  writeAttribute(writer, name, AttributeType.V2F, (w) => {
    w.writeF32(value.x);
    w.writeF32(value.y);
  });
}

/**
 * Write a string attribute
 * @param {BinaryWriter} writer
 * @param {string} name
 * @param {string} value
 */
function writeString(writer, name, value) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  writeAttribute(writer, name, AttributeType.STRING, bytes);
}

/**
 * Write a tiledesc attribute
 * @param {BinaryWriter} writer
 * @param {Vec2} tileSize
 * @param {number} levelMode
 * @param {number} roundingMode
 */
function writeTileDescription(writer, tileSize, levelMode, roundingMode) {
  writeAttribute(writer, 'tiles', AttributeType.TILE_DESC, (w) => {
    w.writeU32(tileSize.x);
    w.writeU32(tileSize.y);
    // mode byte: bits 0-3 = level mode, bits 4-7 = rounding mode
    const mode = (levelMode & 0x0f) | ((roundingMode & 0x0f) << 4);
    w.writeU8(mode);
  });
}

/**
 * Channel description for the channel list
 */
class ChannelDescription {
  /**
   * @param {string} name - Channel name
   * @param {string} sampleType - Sample type (f16, f32, u32)
   * @param {boolean} quantizeLinearly - True for alpha/depth, false for RGB
   * @param {Vec2} sampling - Subsampling (usually 1,1)
   */
  constructor(name, sampleType = SampleType.F32, quantizeLinearly = null, sampling = new Vec2(1, 1)) {
    this.name = name;
    this.sampleType = sampleType;
    // Auto-detect quantization based on channel name
    this.quantizeLinearly = quantizeLinearly ?? !['R', 'G', 'B', 'Y', 'L'].includes(name);
    this.sampling = sampling;
  }

  /**
   * Create a channel description with just name and type
   * @param {string} name
   * @param {string} sampleType
   * @returns {ChannelDescription}
   */
  static named(name, sampleType = SampleType.F32) {
    return new ChannelDescription(name, sampleType);
  }

  /**
   * Get the pixel type ID for the file format
   * @returns {number}
   */
  get pixelTypeId() {
    switch (this.sampleType) {
      case SampleType.U32:
        return 0;
      case SampleType.F16:
        return 1;
      case SampleType.F32:
        return 2;
      default:
        throw new Error(`Unknown sample type: ${this.sampleType}`);
    }
  }

  /**
   * Get bytes per sample
   * @returns {number}
   */
  get bytesPerSample() {
    return bytesPerSample(this.sampleType);
  }
}

/**
 * Channel list - collection of channel descriptions
 */
class ChannelList {
  /**
   * @param {ChannelDescription[]} channels
   */
  constructor(channels) {
    // Sort channels alphabetically by name (EXR requirement)
    this.list = [...channels].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Calculate bytes per pixel
   * @returns {number}
   */
  get bytesPerPixel() {
    return this.list.reduce((sum, ch) => sum + ch.bytesPerSample, 0);
  }

  /**
   * Check if all channels have the same sample type
   * @returns {string|null}
   */
  get uniformSampleType() {
    if (this.list.length === 0) return null;
    const first = this.list[0].sampleType;
    return this.list.every((ch) => ch.sampleType === first) ? first : null;
  }

  /**
   * Write the channel list to a writer
   * @param {BinaryWriter} writer
   */
  write(writer) {
    for (const channel of this.list) {
      // Channel name (null-terminated)
      writer.writeNullTerminatedString(channel.name);
      // Pixel type (i32): 0 = uint, 1 = half, 2 = float
      writer.writeI32(channel.pixelTypeId);
      // pLinear (u8): 0 or 1
      writer.writeU8(channel.quantizeLinearly ? 1 : 0);
      // Reserved (3 bytes)
      writer.writeU8(0);
      writer.writeU8(0);
      writer.writeU8(0);
      // xSampling (i32)
      writer.writeI32(channel.sampling.x);
      // ySampling (i32)
      writer.writeI32(channel.sampling.y);
    }
    // End of channel list (null byte)
    writer.writeU8(0);
  }
}

/**
 * Write channel list attribute
 * @param {BinaryWriter} writer
 * @param {ChannelList} channels
 */
function writeChannelList(writer, channels) {
  writeAttribute(writer, 'channels', AttributeType.CHLIST, (w) => {
    channels.write(w);
  });
}

/**
 * Write the type attribute (scanlineimage, tiledimage, etc.)
 * @param {BinaryWriter} writer
 * @param {string} type - 'scanlineimage' or 'tiledimage'
 */
function writeType(writer, type) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(type);
  writeAttribute(writer, 'type', AttributeType.STRING, bytes);
}

/**
 * Write an int attribute
 * @param {BinaryWriter} writer
 * @param {string} name
 * @param {number} value
 */
function writeInt(writer, name, value) {
  writeAttribute(writer, name, 'int', (w) => {
    w.writeI32(value);
  });
}

/**
 * EXR Header
 *
 * Each layer in an EXR file has a header containing attributes.
 * Headers are written as a sequence of attributes followed by a null byte.
 */


/**
 * Image-level attributes shared across all layers
 */
class ImageAttributes {
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
class LayerAttributes {
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
class Encoding {
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
class Header {
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
function writeHeaders(writer, headers, isMultiPart) {
  for (const header of headers) {
    header.write(writer, isMultiPart);
  }

  // Multi-part files have an extra null byte after all headers
  if (isMultiPart) {
    writer.writeU8(0);
  }
}

/**
 * Meta module - EXR file metadata, headers, and attributes
 */


/**
 * Requirements flags for the file
 */
class Requirements {
  constructor() {
    /** File format version (1 or 2) */
    this.fileFormatVersion = EXR_VERSION;
    /** Single-part tiled image */
    this.isSingleLayerAndTiled = false;
    /** Has long names (> 31 chars) */
    this.hasLongNames = false;
    /** Has deep data */
    this.hasDeepData = false;
    /** Has multiple layers */
    this.hasMultipleLayers = false;
  }

  /**
   * Infer requirements from headers
   * @param {Header[]} headers
   * @returns {Requirements}
   */
  static fromHeaders(headers) {
    const req = new Requirements();

    req.hasMultipleLayers = headers.length > 1;

    if (headers.length === 1 && headers[0].encoding.blocks.isTiled()) {
      req.isSingleLayerAndTiled = true;
    }

    // Check for long names
    for (const header of headers) {
      if (header.ownAttributes.layerName && header.ownAttributes.layerName.length > 31) {
        req.hasLongNames = true;
      }
      for (const channel of header.channels.list) {
        if (channel.name.length > 31) {
          req.hasLongNames = true;
        }
      }
    }

    return req;
  }

  /**
   * Write the requirements to a writer
   * @param {BinaryWriter} writer
   */
  write(writer) {
    let versionAndFlags = this.fileFormatVersion & 0x0f;

    if (this.isSingleLayerAndTiled) {
      versionAndFlags |= VersionFlags.TILED;
    }
    if (this.hasLongNames) {
      versionAndFlags |= VersionFlags.LONG_NAMES;
    }
    if (this.hasDeepData) {
      versionAndFlags |= VersionFlags.DEEP_DATA;
    }
    if (this.hasMultipleLayers) {
      versionAndFlags |= VersionFlags.MULTI_PART;
    }

    writer.writeU32(versionAndFlags);
  }
}

/**
 * Complete file metadata
 */
class MetaData {
  /**
   * @param {Requirements} requirements
   * @param {Header[]} headers
   */
  constructor(requirements, headers) {
    this.requirements = requirements;
    this.headers = headers;
  }

  /**
   * Create metadata from headers
   * @param {Header[]} headers
   * @returns {MetaData}
   */
  static fromHeaders(headers) {
    const requirements = Requirements.fromHeaders(headers);
    return new MetaData(requirements, headers);
  }

  /**
   * Write the magic number to a writer
   * @param {BinaryWriter} writer
   */
  static writeMagicNumber(writer) {
    writer.writeU32(MAGIC_NUMBER);
  }

  /**
   * Write complete metadata (magic, version, headers) to a writer
   * @param {BinaryWriter} writer
   */
  write(writer) {
    MetaData.writeMagicNumber(writer);
    this.requirements.write(writer);
    writeHeaders(writer, this.headers, this.requirements.hasMultipleLayers);
  }

  /**
   * Get total chunk count across all headers
   * @returns {number}
   */
  get totalChunkCount() {
    return this.headers.reduce((sum, h) => sum + h.chunkCount, 0);
  }
}

/**
 * Offset table for chunk locations
 */
class OffsetTable {
  /**
   * @param {number} count - Number of chunks
   */
  constructor(count) {
    this.offsets = new Array(count).fill(0n);
  }

  /**
   * Write the offset table to a writer
   * @param {BinaryWriter} writer
   */
  write(writer) {
    for (const offset of this.offsets) {
      writer.writeU64(offset);
    }
  }

  /**
   * Byte size of the offset table
   * @returns {number}
   */
  get byteSize() {
    return this.offsets.length * 8;
  }
}

/**
 * Platform detection and cross-platform utilities
 */

/** Detect Node.js environment */
const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

/** Detect browser environment */
const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Write ArrayBuffer to file
 * - Node.js: Writes to filesystem
 * - Browser: Triggers download
 * @param {ArrayBuffer} buffer
 * @param {string} filename
 * @returns {Promise<void>}
 */
async function writeToFile(buffer, filename) {
  if (isNode) {
    const fs = await import('fs/promises');
    await fs.writeFile(filename, new Uint8Array(buffer));
  } else if (isBrowser) {
    downloadBlob(buffer, filename);
  } else {
    throw new Error('writeToFile not supported in this environment');
  }
}

/**
 * Trigger a browser download
 * @param {ArrayBuffer} buffer
 * @param {string} filename
 */
function downloadBlob(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Get the native endianness of the platform
 * @returns {'little' | 'big'}
 */
function getNativeEndianness() {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setInt16(0, 256, true);
  return new Int16Array(buffer)[0] === 256 ? 'little' : 'big';
}

/** True if native byte order is little-endian */
getNativeEndianness() === 'little';

/**
 * Layer data structure
 */


/**
 * Single layer with channels and encoding
 */
class Layer {
  /**
   * @param {Vec2} size - Layer resolution
   * @param {LayerAttributes} attributes - Layer attributes
   * @param {Encoding} encoding - Compression and block settings
   * @param {import('./channels.js').AnyChannels|import('./channels.js').SpecificChannels} channelData
   */
  constructor(size, attributes, encoding, channelData) {
    this.size = size;
    this.attributes = attributes;
    this.encoding = encoding;
    this.channelData = channelData;
  }

  /**
   * Create a layer
   * @param {Vec2} size
   * @param {import('./channels.js').AnyChannels|import('./channels.js').SpecificChannels} channelData
   * @param {Encoding} encoding
   * @param {LayerAttributes} attributes
   * @returns {Layer}
   */
  static create(size, channelData, encoding = Encoding.FAST_LOSSLESS, attributes = new LayerAttributes()) {
    return new Layer(size, attributes, encoding, channelData);
  }

  /**
   * Create a named layer
   * @param {string} name
   * @param {Vec2} size
   * @param {import('./channels.js').AnyChannels|import('./channels.js').SpecificChannels} channelData
   * @param {Encoding} encoding
   * @returns {Layer}
   */
  static named(name, size, channelData, encoding = Encoding.FAST_LOSSLESS) {
    return new Layer(size, LayerAttributes.named(name), encoding, channelData);
  }
}

/**
 * Byte optimization utilities for EXR compression
 *
 * EXR compression uses two preprocessing steps before the actual compression:
 * 1. Byte separation (de-interleaving): Separate even and odd bytes
 * 2. Delta encoding: Store differences between consecutive bytes
 *
 * These steps improve compression ratios by grouping similar bytes together
 * and reducing the entropy of the data.
 */

/**
 * Separate bytes such that even-indexed bytes go to the first half,
 * odd-indexed bytes go to the second half.
 *
 * Example: [A0, A1, B0, B1, C0, C1] -> [A0, B0, C0, A1, B1, C1]
 *
 * This is called "de-interleaving" and is the inverse of interleaving.
 * It groups the high bytes and low bytes of multi-byte values together,
 * which typically have similar patterns and compress better.
 *
 * @param {Uint8Array} data - Data to separate (modified in place)
 */
function separateBytesFragments(data) {
  if (data.length <= 1) return;

  const temp = new Uint8Array(data.length);
  const halfLen = Math.ceil(data.length / 2);

  // Even indices go to first half, odd indices go to second half
  let firstIdx = 0;
  let secondIdx = halfLen;

  for (let i = 0; i < data.length; i++) {
    if (i % 2 === 0) {
      temp[firstIdx++] = data[i];
    } else {
      temp[secondIdx++] = data[i];
    }
  }

  data.set(temp);
}

/**
 * Convert sample values to differences.
 * Each byte becomes the difference from the previous byte, plus 128 (bias).
 *
 * This is delta encoding: value[i] = original[i] - original[i-1] + 128
 * The first byte is unchanged.
 *
 * The bias of 128 centers the differences around 128 instead of 0,
 * which works better with unsigned bytes.
 *
 * @param {Uint8Array} data - Data to convert (modified in place)
 */
function samplesToDifferences(data) {
  if (data.length <= 1) return;

  // Process from end to start so we don't overwrite values we need
  data[data.length - 1];
  for (let i = data.length - 1; i >= 1; i--) {
    const current = data[i];
    const previous = data[i - 1];
    // Difference with bias, wrapped to u8
    data[i] = (current - previous + 128) & 0xff;
  }
  // First byte stays unchanged
}

/**
 * Apply both preprocessing steps for compression:
 * 1. Separate bytes (de-interleave)
 * 2. Delta encode
 *
 * @param {Uint8Array} data - Data to preprocess (modified in place)
 */
function preprocessForCompression(data) {
  separateBytesFragments(data);
  samplesToDifferences(data);
}

/**
 * RLE (Run-Length Encoding) compression for EXR
 *
 * RLE compression produces slightly smaller files that can be read/written quickly.
 * Compressed size is usually 60-75% of uncompressed.
 * Works best for images with large flat areas (masks, abstract graphics).
 *
 * Format:
 * - Positive count (0-127): Repeat the next byte (count + 1) times
 * - Negative count (-1 to -127): Copy the next (-count) bytes literally
 */


const MIN_RUN_LENGTH = 3;
const MAX_RUN_LENGTH = 127;

/**
 * Compress data using RLE
 *
 * @param {Uint8Array} data - Uncompressed data (in native/little endian)
 * @returns {Uint8Array} - Compressed data
 */
function compressRLE(data) {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  // Make a copy and preprocess
  const processed = new Uint8Array(data);
  preprocessForCompression(processed);

  // Worst case: no compression + overhead
  const output = [];
  let runStart = 0;
  let runEnd = 1;

  while (runStart < processed.length) {
    // Look for a run of identical bytes
    while (
      runEnd < processed.length &&
      processed[runStart] === processed[runEnd] &&
      runEnd - runStart - 1 < MAX_RUN_LENGTH
    ) {
      runEnd++;
    }

    if (runEnd - runStart >= MIN_RUN_LENGTH) {
      // Emit a run: positive count means repeat
      // count = (runEnd - runStart - 1), so 0 = 1 repeat, 127 = 128 repeats
      output.push((runEnd - runStart - 1) & 0xff);
      output.push(processed[runStart]);
      runStart = runEnd;
    } else {
      // Look for a literal sequence (non-repeating bytes)
      while (
        runEnd < processed.length &&
        runEnd - runStart < MAX_RUN_LENGTH &&
        // Check if next 3 bytes are not all the same (would be a run)
        (runEnd + 1 >= processed.length ||
          processed[runEnd] !== processed[runEnd + 1] ||
          runEnd + 2 >= processed.length ||
          processed[runEnd + 1] !== processed[runEnd + 2])
      ) {
        runEnd++;
      }
      output.push((runStart - runEnd) & 0xff); // This gives negative value as unsigned
      for (let i = runStart; i < runEnd; i++) {
        output.push(processed[i]);
      }

      runStart = runEnd;
      runEnd = runStart + 1;
    }
  }

  return new Uint8Array(output);
}

/**
 * Platform-independent zlib wrapper
 *
 * Uses Node.js zlib in Node environments, pako in browsers.
 * Handles module loading properly to avoid browser compatibility issues.
 */


let _zlib = null;

// Eagerly initialize in Node.js using top-level await
if (isNode) {
  try {
    const nodeZlib = await import('zlib');
    _zlib = {
      deflate: (data, level) => nodeZlib.deflateSync(Buffer.from(data), { level }),
      inflate: (data) => nodeZlib.inflateSync(Buffer.from(data))
    };
  } catch (e) {
    // zlib not available
  }
}

/**
 * Get the zlib implementation for the current environment.
 * Returns an object with deflate/inflate methods, or null if unavailable.
 *
 * @returns {{ deflate: (data: Uint8Array, level: number) => Uint8Array, inflate: (data: Uint8Array) => Uint8Array } | null}
 */
function getZlib() {
  // Return cached Node.js zlib if available
  if (_zlib) return _zlib;

  // Try pako (browser-compatible)
  if (typeof globalThis !== 'undefined' && globalThis.pako) {
    _zlib = {
      deflate: (data, level) => globalThis.pako.deflate(data, { level }),
      inflate: (data) => globalThis.pako.inflate(data)
    };
    return _zlib;
  }

  return null;
}

/**
 * ZIP compression for EXR (ZIP1 and ZIP16)
 *
 * ZIP compression uses zlib deflate to compress pixel data.
 * - ZIP1: Compresses one scanline at a time
 * - ZIP16: Compresses 16 scanlines at a time (better compression)
 *
 * This compression method is lossless and produces small files,
 * but is slower than RLE.
 *
 * In browser environments without pako, falls back to uncompressed storage.
 */


/**
 * Compression level for ZIP (4 is a good balance of speed and size)
 */
const ZIP_COMPRESSION_LEVEL = 4;

/**
 * Compress data using ZIP (zlib deflate)
 *
 * @param {Uint8Array} data - Uncompressed data
 * @returns {Uint8Array} - Compressed data
 */
function compressZIP(data) {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  // Make a copy and preprocess
  const processed = new Uint8Array(data);
  preprocessForCompression(processed);

  const zlib = getZlib();
  if (!zlib) {
    // No zlib available - return preprocessed but uncompressed
    // The file format allows this (decompressor checks sizes)
    return processed;
  }

  // Compress with zlib deflate
  const compressed = zlib.deflate(processed, ZIP_COMPRESSION_LEVEL);

  return new Uint8Array(compressed);
}

/**
 * PXR24 compression for EXR
 *
 * Developed by Pixar Animation Studios. Lossy compression for F32 data
 * (converted to 24 bits), but lossless for F16 and U32 data.
 *
 * Algorithm:
 * 1. Convert F32 values to 24-bit (lossy rounding of significand)
 * 2. Apply delta encoding (difference from previous pixel per channel row)
 * 3. Transpose bytes (group all MSBs together, then second bytes, etc.)
 * 4. Compress with zlib
 *
 * In browser environments without pako, compression will fail.
 */


/**
 * Convert 32-bit float to 24-bit representation
 * This is a lossy conversion that rounds the mantissa from 23 bits to 15 bits.
 *
 * @param {number} float - F32 value
 * @returns {number} - 24-bit representation as u32
 */
function f32ToF24(float) {
  // Get the bit pattern of the float
  const buffer = new ArrayBuffer(4);
  const floatView = new Float32Array(buffer);
  const uintView = new Uint32Array(buffer);
  floatView[0] = float;
  const bits = uintView[0];

  const sign = bits & 0x80000000;
  const exponent = bits & 0x7f800000;
  const mantissa = bits & 0x007fffff;

  let result;

  if (exponent === 0x7f800000) {
    // Infinity or NaN
    if (mantissa !== 0) {
      // NaN: preserve sign and 15 leftmost bits of significand
      // If all 15 bits would be zero, set at least one to avoid turning into infinity
      const truncatedMantissa = mantissa >>> 8;
      result = (exponent >>> 8) | truncatedMantissa | (truncatedMantissa === 0 ? 1 : 0);
    } else {
      // Infinity
      result = exponent >>> 8;
    }
  } else {
    // Finite: round the significand to 15 bits
    result = ((exponent | mantissa) + (mantissa & 0x00000080)) >>> 8;

    if (result >= 0x7f8000) {
      // Overflow due to rounding - truncate instead
      result = (exponent | mantissa) >>> 8;
    }
  }

  return (sign >>> 8) | result;
}

/**
 * Compress data using PXR24
 *
 * @param {Uint8Array} data - Uncompressed pixel data (native endian, per-scanline channel order)
 * @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
 * @param {number} width - Block width in pixels
 * @param {number} height - Block height in scanlines
 * @returns {Uint8Array} - Compressed data
 */
function compressPXR24(data, channels, width, height) {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  // Calculate bytes per pixel in PXR24 encoding (F16=2, F32=3, U32=4)
  const bytesPerPixelPXR24 = channels.reduce((sum, ch) => {
    switch (ch.sampleType) {
      case SampleType.F16:
        return sum + 2;
      case SampleType.F32:
        return sum + 3;
      case SampleType.U32:
        return sum + 4;
      default:
        return sum + 4;
    }
  }, 0);

  // Output buffer for encoded data
  const encodedBE = new Uint8Array(bytesPerPixelPXR24 * width * height);
  let writeOffset = 0;

  // Create a DataView for reading input
  const inputView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let readOffset = 0;

  // Process each scanline
  for (let y = 0; y < height; y++) {
    // Process each channel
    for (const channel of channels) {
      const sampleCount = width; // TODO: handle subsampling

      switch (channel.sampleType) {
        case SampleType.F16: {
          // 2 bytes per sample: delta encode, then transpose
          const byte0Start = writeOffset;
          const byte1Start = writeOffset + sampleCount;
          writeOffset += sampleCount * 2;

          let previousPixel = 0;
          for (let x = 0; x < sampleCount; x++) {
            const pixel = inputView.getUint16(readOffset, true); // little-endian
            readOffset += 2;

            const diff = (pixel - previousPixel) & 0xffff;
            // Write in big-endian (MSB first in first block)
            encodedBE[byte0Start + x] = (diff >>> 8) & 0xff;
            encodedBE[byte1Start + x] = diff & 0xff;
            previousPixel = pixel;
          }
          break;
        }

        case SampleType.F32: {
          // 3 bytes per sample (lossy): convert to F24, delta encode, transpose
          const byte0Start = writeOffset;
          const byte1Start = writeOffset + sampleCount;
          const byte2Start = writeOffset + sampleCount * 2;
          writeOffset += sampleCount * 3;

          let previousPixel = 0;
          for (let x = 0; x < sampleCount; x++) {
            const floatVal = inputView.getFloat32(readOffset, true); // little-endian
            readOffset += 4;

            const pixel = f32ToF24(floatVal);
            const diff = (pixel - previousPixel) & 0xffffff;
            // Write 24-bit difference in big-endian across 3 byte planes
            encodedBE[byte0Start + x] = (diff >>> 16) & 0xff;
            encodedBE[byte1Start + x] = (diff >>> 8) & 0xff;
            encodedBE[byte2Start + x] = diff & 0xff;
            previousPixel = pixel;
          }
          break;
        }

        case SampleType.U32: {
          // 4 bytes per sample: delta encode, then transpose
          const byte0Start = writeOffset;
          const byte1Start = writeOffset + sampleCount;
          const byte2Start = writeOffset + sampleCount * 2;
          const byte3Start = writeOffset + sampleCount * 3;
          writeOffset += sampleCount * 4;

          let previousPixel = 0;
          for (let x = 0; x < sampleCount; x++) {
            const pixel = inputView.getUint32(readOffset, true); // little-endian
            readOffset += 4;

            const diff = (pixel - previousPixel) >>> 0; // force unsigned
            // Write in big-endian across 4 byte planes
            encodedBE[byte0Start + x] = (diff >>> 24) & 0xff;
            encodedBE[byte1Start + x] = (diff >>> 16) & 0xff;
            encodedBE[byte2Start + x] = (diff >>> 8) & 0xff;
            encodedBE[byte3Start + x] = diff & 0xff;
            previousPixel = pixel;
          }
          break;
        }
      }
    }
  }

  // Compress with zlib
  const zlib = getZlib();
  if (!zlib) {
    throw new Error('zlib not available for PXR24 compression. Include pako library in browser.');
  }

  const compressed = zlib.deflate(encodedBE, 4);

  return new Uint8Array(compressed);
}

/**
 * Haar wavelet encoding and decoding for PIZ compression
 *
 * The wavelet transform operates on 2D data, processing pixels in a
 * hierarchical manner. Each level processes pairs of values:
 * - Encode: (a, b) -> (average, difference)
 * - Decode: (avg, diff) -> (a, b)
 *
 * Two modes are supported:
 * - 14-bit: For values < 16384 (faster, simpler math)
 * - 16-bit: For full 16-bit values (requires modular arithmetic)
 */

const BIT_COUNT = 16;
const OFFSET = 1 << (BIT_COUNT - 1); // 32768
const MOD_MASK = (1 << BIT_COUNT) - 1; // 65535

/**
 * Check if a value fits in 14 bits
 * @param {number} value
 * @returns {boolean}
 */
function is14Bit(value) {
  return value < (1 << 14);
}

/**
 * 14-bit encoding: simple average and difference
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]} [average, difference]
 */
function encode14bit(a, b) {
  // Convert to signed for arithmetic
  const as = a > 32767 ? a - 65536 : a;
  const bs = b > 32767 ? b - 65536 : b;

  const m = (as + bs) >> 1;
  const d = as - bs;

  // Convert back to unsigned 16-bit
  return [(m & 0xffff), (d & 0xffff)];
}

/**
 * 16-bit encoding with modular arithmetic
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]} [average, difference]
 */
function encode16bit(a, b) {
  const aOffset = (a + OFFSET) & MOD_MASK;
  let m = (aOffset + b) >> 1;
  let d = aOffset - b;

  if (d < 0) {
    m = (m + OFFSET) & MOD_MASK;
  }
  d = d & MOD_MASK;

  return [m, d];
}

/**
 * Encode (compress) a 2D buffer with Haar wavelet transform
 *
 * @param {Uint16Array} buffer - Data to transform (modified in place)
 * @param {number} countX - Width
 * @param {number} countY - Height
 * @param {number} offsetX - X stride (usually 1 for single channel, or samples_per_pixel for interleaved)
 * @param {number} offsetY - Y stride (usually width * samples_per_pixel)
 * @param {number} maxValue - Maximum value in buffer (determines 14-bit vs 16-bit mode)
 */
function waveletEncode(buffer, countX, countY, offsetX, offsetY, maxValue) {
  const count = Math.min(countX, countY);
  const encode = is14Bit(maxValue) ? encode14bit : encode16bit;

  let p = 1;
  let p2 = 2;

  while (p2 <= count) {
    const offset1X = offsetX * p;
    const offset1Y = offsetY * p;
    const offset2X = offsetX * p2;
    const offset2Y = offsetY * p2;

    const endY = offsetY * (countY - p2);

    // Process 2x2 blocks
    let posY = 0;
    while (posY <= endY) {
      let posX = posY;
      const endX = posX + offsetX * (countX - p2);

      while (posX <= endX) {
        const posRight = posX + offset1X;
        const posTop = posX + offset1Y;
        const posTopRight = posTop + offset1X;

        let [center, right] = encode(buffer[posX], buffer[posRight]);
        let [top, topRight] = encode(buffer[posTop], buffer[posTopRight]);

        [center, top] = encode(center, top);
        [right, topRight] = encode(right, topRight);

        buffer[posX] = center;
        buffer[posTop] = top;
        buffer[posRight] = right;
        buffer[posTopRight] = topRight;

        posX += offset2X;
      }

      // Handle remaining odd pixel column
      if (countX & p) {
        const posTop = posX + offset1Y;
        const [center, top] = encode(buffer[posX], buffer[posTop]);
        buffer[posX] = center;
        buffer[posTop] = top;
      }

      posY += offset2Y;
    }

    // Handle remaining odd row
    if (countY & p) {
      let posX = posY;
      const endX = posY + offsetX * (countX - p2);

      while (posX <= endX) {
        const posRight = posX + offset1X;
        const [center, right] = encode(buffer[posX], buffer[posRight]);
        buffer[posRight] = right;
        buffer[posX] = center;
        posX += offset2X;
      }
    }

    p = p2;
    p2 <<= 1;
  }
}

/**
 * 16-bit Huffman compression and decompression for PIZ
 *
 * Huffman compression and decompression routines written
 * by Christian Rouet for his PIZ image file format.
 */

const ENCODE_BITS = 16; // literal (value) bit length

const ENCODING_TABLE_SIZE = (1 << ENCODE_BITS) + 1; // 65537

const SHORT_ZEROCODE_RUN = 59;
const LONG_ZEROCODE_RUN = 63;
const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;
const LONGEST_LONG_RUN = 255 + SHORTEST_LONG_RUN;

/**
 * Get the code length from an encoding table entry
 * @param {number} code
 * @returns {number}
 */
function codeLength(code) {
  return code & 63;
}

/**
 * Get the Huffman code from an encoding table entry
 * @param {number} code
 * @returns {number}
 */
function codeValue(code) {
  return code >>> 6;
}

/**
 * Compress u16 data using Huffman coding
 *
 * @param {Uint16Array} uncompressed - Data to compress
 * @returns {Uint8Array} - Compressed data
 */
function huffmanCompress(uncompressed) {
  if (uncompressed.length === 0) {
    return new Uint8Array(0);
  }

  // Count frequencies
  const frequencies = new Array(ENCODING_TABLE_SIZE).fill(0);
  for (let i = 0; i < uncompressed.length; i++) {
    frequencies[uncompressed[i]]++;
  }

  // Build encoding table
  const { minCodeIndex, maxCodeIndex } = buildEncodingTable(frequencies);

  // Allocate output buffer (estimate: at most input size + header)
  const output = [];
  for (let i = 0; i < 20; i++) {
    output.push(0);
  }

  const tableStart = output.length;

  // Pack encoding table
  packEncodingTable(frequencies, minCodeIndex, maxCodeIndex, output);

  const dataStart = output.length;

  // Encode data
  const bitCount = encodeWithFrequencies(
    frequencies,
    uncompressed,
    maxCodeIndex,
    output
  );

  // Write header
  const tableLength = dataStart - tableStart;
  writeU32LE(output, 0, minCodeIndex);
  writeU32LE(output, 4, maxCodeIndex);
  writeU32LE(output, 8, tableLength);
  writeU32LE(output, 12, bitCount);
  writeU32LE(output, 16, 0); // padding

  return new Uint8Array(output);
}

/**
 * Write a little-endian u32 to an array
 */
function writeU32LE(arr, offset, value) {
  arr[offset] = value & 0xff;
  arr[offset + 1] = (value >>> 8) & 0xff;
  arr[offset + 2] = (value >>> 16) & 0xff;
  arr[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Build a canonical Huffman encoding table from frequency counts
 */
function buildEncodingTable(frequencies) {
  // Find min and max non-zero indices
  let minCodeIndex = frequencies.findIndex((f) => f !== 0);
  if (minCodeIndex === -1) minCodeIndex = 0;

  let maxCodeIndex = 0;
  let frequencyCount = 0;

  // Build heap of (position, frequency) pairs
  const heap = [];
  for (let i = minCodeIndex; i < ENCODING_TABLE_SIZE; i++) {
    if (frequencies[i] !== 0) {
      heap.push({ position: i, frequency: frequencies[i] });
      maxCodeIndex = i;
      frequencyCount++;
    }
  }

  // Add pseudo-symbol for run-length encoding
  maxCodeIndex++;
  frequencies[maxCodeIndex] = 1;
  heap.push({ position: maxCodeIndex, frequency: 1 });
  frequencyCount++;

  // Build min-heap
  const heapCmp = (a, b) => {
    if (a.frequency !== b.frequency) return a.frequency - b.frequency;
    return a.position - b.position;
  };
  heap.sort(heapCmp);

  // Build code lengths using Huffman algorithm
  const sCode = new Array(ENCODING_TABLE_SIZE).fill(0);
  const links = new Array(ENCODING_TABLE_SIZE);
  for (let i = 0; i < ENCODING_TABLE_SIZE; i++) {
    links[i] = i;
  }

  while (frequencyCount > 1) {
    // Pop smallest
    const smallest = heap.shift();
    frequencyCount--;

    // Add to second smallest
    heap[0].frequency += smallest.frequency;
    const highPos = heap[0].position;
    const lowPos = smallest.position;

    // Re-sort heap
    heap.sort(heapCmp);

    // Update code lengths and links
    let idx = highPos;
    while (true) {
      sCode[idx]++;
      if (links[idx] === idx) {
        links[idx] = lowPos;
        break;
      }
      idx = links[idx];
    }

    idx = lowPos;
    while (true) {
      sCode[idx]++;
      if (links[idx] === idx) {
        break;
      }
      idx = links[idx];
    }
  }

  // Build canonical codes
  buildCanonicalTable(sCode);

  // Copy to frequencies
  for (let i = 0; i < ENCODING_TABLE_SIZE; i++) {
    frequencies[i] = sCode[i];
  }

  return { minCodeIndex, maxCodeIndex };
}

/**
 * Build canonical Huffman code table
 */
function buildCanonicalTable(codeTable) {
  const countPerCode = new Array(59).fill(0);

  for (let i = 0; i < codeTable.length; i++) {
    if (codeTable[i] < 59) {
      countPerCode[codeTable[i]]++;
    }
  }

  // Compute numerically lowest code for each length
  let code = 0;
  for (let i = 58; i >= 0; i--) {
    const nextCode = (code + countPerCode[i]) >>> 1;
    countPerCode[i] = code;
    code = nextCode;
  }

  // Assign codes
  for (let i = 0; i < codeTable.length; i++) {
    const length = codeTable[i];
    if (length > 0 && length < 59) {
      codeTable[i] = length | (countPerCode[length] << 6);
      countPerCode[length]++;
    }
  }
}

/**
 * Pack encoding table with run-length compression of zeros
 */
function packEncodingTable(frequencies, minIndex, maxIndex, output) {
  let codeBits = 0;
  let codeBitCount = 0;

  let i = minIndex;
  while (i <= maxIndex) {
    const len = codeLength(frequencies[i]);

    if (len === 0) {
      // Count zero run
      let zeroRun = 1;
      while (i < maxIndex && zeroRun < LONGEST_LONG_RUN) {
        if (codeLength(frequencies[i + 1]) > 0) break;
        i++;
        zeroRun++;
      }

      if (zeroRun >= 2) {
        if (zeroRun >= SHORTEST_LONG_RUN) {
          writeBits(6, LONG_ZEROCODE_RUN, output, { codeBits, codeBitCount });
          codeBits = output._codeBits;
          codeBitCount = output._codeBitCount;
          writeBits(8, zeroRun - SHORTEST_LONG_RUN, output, {
            codeBits,
            codeBitCount,
          });
          codeBits = output._codeBits;
          codeBitCount = output._codeBitCount;
        } else {
          writeBits(6, SHORT_ZEROCODE_RUN + zeroRun - 2, output, {
            codeBits,
            codeBitCount,
          });
          codeBits = output._codeBits;
          codeBitCount = output._codeBitCount;
        }
        i++;
        continue;
      }
    }

    writeBits(6, len, output, { codeBits, codeBitCount });
    codeBits = output._codeBits;
    codeBitCount = output._codeBitCount;
    i++;
  }

  // Flush remaining bits
  if (codeBitCount > 0) {
    output.push((codeBits << (8 - codeBitCount)) & 0xff);
  }

  // Clean up temporary state
  delete output._codeBits;
  delete output._codeBitCount;
}

/**
 * Helper to write bits to output
 */
function writeBits(count, bits, output, state) {
  let codeBits = state.codeBits;
  let codeBitCount = state.codeBitCount;

  codeBits = ((codeBits << count) | bits) >>> 0;
  codeBitCount += count;

  while (codeBitCount >= 8) {
    codeBitCount -= 8;
    output.push((codeBits >>> codeBitCount) & 0xff);
  }

  output._codeBits = codeBits;
  output._codeBitCount = codeBitCount;
}

/**
 * Encode data using the frequency table
 */
function encodeWithFrequencies(frequencies, uncompressed, runLengthCode, output) {
  let codeBits = 0;
  let codeBitCount = 0;
  const startLen = output.length;

  let runStartValue = uncompressed[0];
  let runLength = 0;

  for (let i = 1; i < uncompressed.length; i++) {
    const currentValue = uncompressed[i];

    if (runStartValue === currentValue && runLength < 255) {
      runLength++;
    } else {
      sendCode(
        frequencies[runStartValue],
        runLength,
        frequencies[runLengthCode],
        output,
        { codeBits, codeBitCount }
      );
      codeBits = output._codeBits;
      codeBitCount = output._codeBitCount;
      runLength = 0;
    }

    runStartValue = currentValue;
  }

  // Send remaining
  sendCode(
    frequencies[runStartValue],
    runLength,
    frequencies[runLengthCode],
    output,
    { codeBits, codeBitCount }
  );
  codeBits = output._codeBits;
  codeBitCount = output._codeBitCount;

  const dataLength = output.length - startLen;

  // Flush remaining bits
  if (codeBitCount > 0) {
    output.push((codeBits << (8 - codeBitCount)) & 0xff);
  }

  delete output._codeBits;
  delete output._codeBitCount;

  return dataLength * 8 + codeBitCount;
}

/**
 * Send a code with optional run-length encoding
 */
function sendCode(sCode, runCount, runCode, output, state) {
  const sLen = codeLength(sCode);
  const runLen = codeLength(runCode);

  // Use RLE if it's shorter
  if (sLen + runLen + 8 < sLen * (runCount + 1)) {
    writeCode(sCode, output, state);
    writeCode(runCode, output, state);
    writeBits(8, runCount, output, state);
  } else {
    for (let i = 0; i <= runCount; i++) {
      writeCode(sCode, output, state);
    }
  }
}

/**
 * Write a Huffman code
 */
function writeCode(sCode, output, state) {
  writeBits(codeLength(sCode), codeValue(sCode), output, state);
}

/**
 * PIZ compression for EXR
 *
 * PIZ compression uses wavelet transform + Huffman coding.
 * Best for noisy/photographic images, typically 35-55% of uncompressed size.
 *
 * Algorithm:
 * 1. Convert to u16 values (treating f16 as raw bits, f32/u32 as two u16s)
 * 2. Build bitmap of used values
 * 3. Create lookup tables to compress value range
 * 4. Apply Haar wavelet transform to each channel
 * 5. Huffman encode the result
 */


const U16_RANGE = 1 << 16; // 65536
const BITMAP_SIZE = U16_RANGE >> 3; // 8192 bytes

/**
 * Build a bitmap of which u16 values are present in the data
 * @param {Uint16Array} data
 * @returns {{minNonZero: number, maxNonZero: number, bitmap: Uint8Array}}
 */
function bitmapFromData(data) {
  const bitmap = new Uint8Array(BITMAP_SIZE);

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    bitmap[value >> 3] |= 1 << (value & 7);
  }

  // Zero is not explicitly stored in bitmap; we assume data always contains zeros
  bitmap[0] &= -2;

  // Find min and max non-zero indices in bitmap
  let minNonZero = -1;
  let maxNonZero = -1;

  for (let i = 0; i < BITMAP_SIZE; i++) {
    if (bitmap[i] !== 0) {
      if (minNonZero === -1) minNonZero = i;
      maxNonZero = i;
    }
  }

  if (minNonZero === -1) {
    minNonZero = 0;
    maxNonZero = 0;
  }

  return { minNonZero, maxNonZero, bitmap };
}

/**
 * Build forward lookup table from bitmap (compress value range)
 * @param {Uint8Array} bitmap
 * @returns {{maxValue: number, table: Uint16Array}}
 */
function forwardLookupTableFromBitmap(bitmap) {
  const table = new Uint16Array(U16_RANGE);
  let count = 0;

  for (let index = 0; index < U16_RANGE; index++) {
    if (index === 0 || (bitmap[index >> 3] & (1 << (index & 7))) !== 0) {
      table[index] = count;
      count++;
    }
  }

  return { maxValue: count - 1, table };
}

/**
 * Apply a lookup table to transform data values
 * @param {Uint16Array} data
 * @param {Uint16Array} table
 */
function applyLookupTable(data, table) {
  for (let i = 0; i < data.length; i++) {
    data[i] = table[data[i]];
  }
}

/**
 * Channel metadata for PIZ compression
 */
class ChannelData {
  constructor(tmpStartIndex, resolution, ySampling, samplesPerPixel) {
    this.tmpStartIndex = tmpStartIndex;
    this.tmpEndIndex = tmpStartIndex;
    this.resolution = resolution; // { x, y }
    this.ySampling = ySampling;
    this.samplesPerPixel = samplesPerPixel; // 1 for f16, 2 for f32/u32
  }
}

/**
 * Compress data using PIZ
 *
 * @param {Uint8Array} data - Uncompressed pixel data (little-endian)
 * @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
 * @param {number} width - Block width
 * @param {number} height - Block height
 * @returns {Uint8Array} - Compressed data
 */
function compressPIZ(data, channels, width, height) {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  // Convert bytes to u16 array
  const u16Count = data.length / 2;
  const tmp = new Uint16Array(u16Count);

  // Build channel metadata and read data into tmp buffer
  const channelDataList = [];
  let tmpEndIndex = 0;

  for (const channel of channels) {
    // Calculate samples per pixel (f16 = 1, f32/u32 = 2 u16s)
    const samplesPerPixel =
      channel.sampleType === SampleType.F16 ? 1 : 2;

    const channelData = new ChannelData(
      tmpEndIndex,
      { x: width, y: height },
      1, // sampling (TODO: support subsampling)
      samplesPerPixel
    );

    tmpEndIndex += width * height * samplesPerPixel;
    channelDataList.push(channelData);
  }

  // Read input bytes into tmp, reordering by channel
  const inputView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let readOffset = 0;

  for (let y = 0; y < height; y++) {
    for (const channelData of channelDataList) {
      const u16sPerLine = channelData.resolution.x * channelData.samplesPerPixel;
      const target = tmp.subarray(
        channelData.tmpEndIndex,
        channelData.tmpEndIndex + u16sPerLine
      );

      for (let i = 0; i < u16sPerLine; i++) {
        target[i] = inputView.getUint16(readOffset, true); // little-endian
        readOffset += 2;
      }

      channelData.tmpEndIndex += u16sPerLine;
    }
  }

  // Build bitmap and lookup table
  const { minNonZero, maxNonZero, bitmap } = bitmapFromData(tmp);
  const { maxValue, table } = forwardLookupTableFromBitmap(bitmap);

  // Apply lookup table to compress value range
  applyLookupTable(tmp, table);

  // Apply wavelet transform to each channel
  for (const channelData of channelDataList) {
    for (let offset = 0; offset < channelData.samplesPerPixel; offset++) {
      // Get the slice for this channel
      const u16Count = channelData.resolution.x * channelData.resolution.y * channelData.samplesPerPixel;
      const channelStart = channelData.tmpStartIndex;

      waveletEncode(
        tmp.subarray(channelStart + offset, channelStart + u16Count),
        channelData.resolution.x,
        channelData.resolution.y,
        channelData.samplesPerPixel,
        channelData.resolution.x * channelData.samplesPerPixel,
        maxValue
      );
    }
  }

  // Huffman compress
  const huffmanCompressed = huffmanCompress(tmp);

  // Build output
  // Format: [minNonZero: u16][maxNonZero: u16][bitmap...][huffmanLength: i32][huffmanData...]
  const output = new Uint8Array(
    4 + // minNonZero + maxNonZero
      (minNonZero <= maxNonZero ? maxNonZero - minNonZero + 1 : 0) +
      4 + // huffman length
      huffmanCompressed.length
  );

  let writeOffset = 0;

  // Write minNonZero (u16 LE)
  output[writeOffset++] = minNonZero & 0xff;
  output[writeOffset++] = (minNonZero >> 8) & 0xff;

  // Write maxNonZero (u16 LE)
  output[writeOffset++] = maxNonZero & 0xff;
  output[writeOffset++] = (maxNonZero >> 8) & 0xff;

  // Write bitmap slice
  if (minNonZero <= maxNonZero) {
    for (let i = minNonZero; i <= maxNonZero; i++) {
      output[writeOffset++] = bitmap[i];
    }
  }

  // Write huffman length (i32 LE)
  const huffmanLen = huffmanCompressed.length;
  output[writeOffset++] = huffmanLen & 0xff;
  output[writeOffset++] = (huffmanLen >> 8) & 0xff;
  output[writeOffset++] = (huffmanLen >> 16) & 0xff;
  output[writeOffset++] = (huffmanLen >> 24) & 0xff;

  // Write huffman data
  output.set(huffmanCompressed, writeOffset);

  return output;
}

/**
 * B44/B44A compression for EXR
 *
 * B44 is a lossy compression method for f16 channels only.
 * - Compresses 4x4 pixel blocks of f16 data to 14 bytes (from 32 bytes)
 * - f32 and u32 channels are stored uncompressed
 * - B44A variant compresses uniform blocks to 3 bytes
 *
 * Fast enough for real-time playback. File size is predictable
 * (depends only on resolution, not content).
 */


const BLOCK_SAMPLE_COUNT = 4;
const BIAS = 0x20;

/**
 * Shift and round a value
 * @param {number} x
 * @param {number} shift
 * @returns {number}
 */
function shiftAndRound(x, shift) {
  const x2 = x << 1;
  const a = (1 << shift) - 1;
  const shiftPlus1 = shift + 1;
  const b = (x2 >> shiftPlus1) & 1;
  return (x2 + a + b) >> shiftPlus1;
}

/**
 * Pack a 4x4 block of 16-bit pixels into 14 or 3 bytes
 * @param {Uint16Array} s - 16 pixel values
 * @param {Uint8Array} b - Output buffer (at least 14 bytes)
 * @param {boolean} optimizeFlatFields - Use 3-byte encoding for flat blocks
 * @returns {number} - Number of bytes written (3 or 14)
 */
function pack(s, b, optimizeFlatFields) {
  const t = new Uint16Array(16);

  // Transform values to put negatives below positives
  for (let i = 0; i < 16; i++) {
    if ((s[i] & 0x7c00) === 0x7c00) {
      // Infinity or NaN
      t[i] = 0x8000;
    } else if ((s[i] & 0x8000) !== 0) {
      // Negative
      t[i] = (~s[i]) & 0xffff;
    } else {
      // Positive
      t[i] = s[i] | 0x8000;
    }
  }

  // Find max value
  let tMax = t[0];
  for (let i = 1; i < 16; i++) {
    if (t[i] > tMax) tMax = t[i];
  }

  // Find shift value such that all differences fit in 6 bits with bias
  let shift = -1;
  const d = new Int32Array(16);
  const r = new Int32Array(15);
  let rMin, rMax;

  do {
    shift++;

    // Compute absolute differences from max, shifted and rounded
    for (let i = 0; i < 16; i++) {
      d[i] = shiftAndRound(tMax - t[i], shift);
    }

    // Convert to running differences with bias
    r[0] = d[0] - d[4] + BIAS;
    r[1] = d[4] - d[8] + BIAS;
    r[2] = d[8] - d[12] + BIAS;

    r[3] = d[0] - d[1] + BIAS;
    r[4] = d[4] - d[5] + BIAS;
    r[5] = d[8] - d[9] + BIAS;
    r[6] = d[12] - d[13] + BIAS;

    r[7] = d[1] - d[2] + BIAS;
    r[8] = d[5] - d[6] + BIAS;
    r[9] = d[9] - d[10] + BIAS;
    r[10] = d[13] - d[14] + BIAS;

    r[11] = d[2] - d[3] + BIAS;
    r[12] = d[6] - d[7] + BIAS;
    r[13] = d[10] - d[11] + BIAS;
    r[14] = d[14] - d[15] + BIAS;

    rMin = r[0];
    rMax = r[0];
    for (let i = 1; i < 15; i++) {
      if (r[i] < rMin) rMin = r[i];
      if (r[i] > rMax) rMax = r[i];
    }
  } while (rMin < 0 || rMax > 0x3f);

  // Check for flat field (B44A optimization)
  if (rMin === BIAS && rMax === BIAS && optimizeFlatFields) {
    // All pixels have same value - encode in 3 bytes
    b[0] = (t[0] >>> 8) & 0xff;
    b[1] = t[0] & 0xff;
    b[2] = 0xfc; // Special marker for 3-byte encoding
    return 3;
  }

  // Pack t[0], shift, and r[0..14] into 14 bytes
  b[0] = (t[0] >>> 8) & 0xff;
  b[1] = t[0] & 0xff;

  b[2] = ((shift << 2) | (r[0] >>> 4)) & 0xff;
  b[3] = ((r[0] << 4) | (r[1] >>> 2)) & 0xff;
  b[4] = ((r[1] << 6) | r[2]) & 0xff;

  b[5] = ((r[3] << 2) | (r[4] >>> 4)) & 0xff;
  b[6] = ((r[4] << 4) | (r[5] >>> 2)) & 0xff;
  b[7] = ((r[5] << 6) | r[6]) & 0xff;

  b[8] = ((r[7] << 2) | (r[8] >>> 4)) & 0xff;
  b[9] = ((r[8] << 4) | (r[9] >>> 2)) & 0xff;
  b[10] = ((r[9] << 6) | r[10]) & 0xff;

  b[11] = ((r[11] << 2) | (r[12] >>> 4)) & 0xff;
  b[12] = ((r[12] << 4) | (r[13] >>> 2)) & 0xff;
  b[13] = ((r[13] << 6) | r[14]) & 0xff;

  return 14;
}

/**
 * Compress data using B44/B44A
 *
 * @param {Uint8Array} data - Uncompressed pixel data (little-endian)
 * @param {Array<{name: string, sampleType: number}>} channels - Channel descriptions
 * @param {number} width - Block width
 * @param {number} height - Block height
 * @param {boolean} optimizeFlatFields - Use B44A (3-byte encoding for flat blocks)
 * @returns {Uint8Array} - Compressed data
 */
function compressB44(data, channels, width, height, optimizeFlatFields = false) {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  // Build channel metadata
  const channelDataList = [];
  let tmpEndIndex = 0;

  for (const channel of channels) {
    const bytesPerSample =
      channel.sampleType === SampleType.F16 ? 2 : 4;

    const channelData = {
      tmpStartIndex: tmpEndIndex,
      tmpEndIndex: tmpEndIndex,
      sampleType: channel.sampleType,
      width,
      height,
    };

    tmpEndIndex += width * height * bytesPerSample;
    channelDataList.push(channelData);
  }

  // Reorganize input data by channel (from interleaved scanlines)
  const tmp = new Uint8Array(data.length);
  new DataView(data.buffer, data.byteOffset, data.byteLength);
  let readOffset = 0;

  for (let y = 0; y < height; y++) {
    for (const channelData of channelDataList) {
      const bytesPerSample =
        channelData.sampleType === SampleType.F16 ? 2 : 4;
      const bytesPerLine = width * bytesPerSample;

      for (let i = 0; i < bytesPerLine; i++) {
        tmp[channelData.tmpEndIndex + i] = data[readOffset++];
      }
      channelData.tmpEndIndex += bytesPerLine;
    }
  }

  // Estimate output size and allocate
  const output = [];
  const blockBuf = new Uint8Array(14);

  for (const channelData of channelDataList) {
    // F32 and U32 are copied uncompressed
    if (channelData.sampleType !== SampleType.F16) {
      const byteCount =
        channelData.width * channelData.height * 4;
      for (let i = 0; i < byteCount; i++) {
        output.push(tmp[channelData.tmpStartIndex + i]);
      }
      continue;
    }

    // F16: compress in 4x4 blocks
    const xSampleCount = channelData.width;
    const ySampleCount = channelData.height;
    const xByteCount = xSampleCount * 2;
    const cdStart = channelData.tmpStartIndex;

    for (let y = 0; y < ySampleCount; y += BLOCK_SAMPLE_COUNT) {
      // Calculate row offsets
      let row0 = cdStart + y * xByteCount;
      let row1 = row0 + xByteCount;
      let row2 = row1 + xByteCount;
      let row3 = row2 + xByteCount;

      // Handle edge cases at bottom of image
      if (y + 3 >= ySampleCount) {
        if (y + 1 >= ySampleCount) row1 = row0;
        if (y + 2 >= ySampleCount) row2 = row1;
        row3 = row2;
      }

      for (let x = 0; x < xSampleCount; x += BLOCK_SAMPLE_COUNT) {
        const s = new Uint16Array(16);

        // Handle edge cases at right of image
        if (x + 3 >= xSampleCount) {
          const n = xSampleCount - x;
          for (let i = 0; i < BLOCK_SAMPLE_COUNT; i++) {
            const j = Math.min(i, n - 1) * 2;
            s[i + 0] = tmp[row0 + j] | (tmp[row0 + j + 1] << 8);
            s[i + 4] = tmp[row1 + j] | (tmp[row1 + j + 1] << 8);
            s[i + 8] = tmp[row2 + j] | (tmp[row2 + j + 1] << 8);
            s[i + 12] = tmp[row3 + j] | (tmp[row3 + j + 1] << 8);
          }
        } else {
          // Read 4 pixels from each row
          for (let i = 0; i < 4; i++) {
            s[i] = tmp[row0 + i * 2] | (tmp[row0 + i * 2 + 1] << 8);
            s[i + 4] = tmp[row1 + i * 2] | (tmp[row1 + i * 2 + 1] << 8);
            s[i + 8] = tmp[row2 + i * 2] | (tmp[row2 + i * 2 + 1] << 8);
            s[i + 12] = tmp[row3 + i * 2] | (tmp[row3 + i * 2 + 1] << 8);
          }
        }

        // Move to next block
        row0 += BLOCK_SAMPLE_COUNT * 2;
        row1 += BLOCK_SAMPLE_COUNT * 2;
        row2 += BLOCK_SAMPLE_COUNT * 2;
        row3 += BLOCK_SAMPLE_COUNT * 2;

        // Compress block
        const packedSize = pack(s, blockBuf, optimizeFlatFields);
        for (let i = 0; i < packedSize; i++) {
          output.push(blockBuf[i]);
        }
      }
    }
  }

  return new Uint8Array(output);
}

/**
 * Compression module - EXR compression methods
 *
 * Supported compression methods:
 * - Uncompressed: No compression, fastest I/O
 * - RLE: Run-length encoding, fast with moderate compression
 * - ZIP1: zlib per scanline, slow but small
 * - ZIP16: zlib per 16 scanlines, better compression than ZIP1
 * - PIZ: Wavelet + Huffman, best for noisy images
 * - PXR24: Lossy for f32, lossless for f16/u32
 * - B44/B44A: Lossy block compression for f16
 */


/**
 * Compression context for channel-aware compression methods
 * @typedef {Object} CompressionContext
 * @property {Array<{name: string, sampleType: number}>} channels - Channel list
 * @property {number} width - Block width in pixels
 * @property {number} height - Block height in scanlines
 */

/**
 * Compress a block of pixel data
 *
 * @param {number} method - Compression method (from Compression enum)
 * @param {Uint8Array} uncompressedLE - Little-endian uncompressed data
 * @param {CompressionContext} [context] - Optional context for channel-aware compression
 * @returns {Uint8Array} - Compressed data (or uncompressed if compression didn't help)
 */
function compressBlock(method, uncompressedLE, context = null) {
  if (uncompressedLE.length === 0) {
    return uncompressedLE;
  }

  let compressed;

  switch (method) {
    case Compression.Uncompressed:
      return uncompressedLE;

    case Compression.RLE:
      compressed = compressRLE(uncompressedLE);
      break;

    case Compression.ZIP1:
    case Compression.ZIP16:
      compressed = compressZIP(uncompressedLE);
      break;

    case Compression.PIZ:
      if (!context) {
        throw new Error('PIZ compression requires channel context');
      }
      compressed = compressPIZ(
        uncompressedLE,
        context.channels,
        context.width,
        context.height
      );
      break;

    case Compression.PXR24:
      if (!context) {
        throw new Error('PXR24 compression requires channel context');
      }
      compressed = compressPXR24(
        uncompressedLE,
        context.channels,
        context.width,
        context.height
      );
      break;

    case Compression.B44:
      if (!context) {
        throw new Error('B44 compression requires channel context');
      }
      compressed = compressB44(
        uncompressedLE,
        context.channels,
        context.width,
        context.height,
        false // B44: don't optimize flat fields
      );
      break;

    case Compression.B44A:
      if (!context) {
        throw new Error('B44A compression requires channel context');
      }
      compressed = compressB44(
        uncompressedLE,
        context.channels,
        context.width,
        context.height,
        true // B44A: optimize flat fields
      );
      break;

    default:
      throw new Error(`Unknown compression method: ${method}`);
  }

  // If compressed is larger than uncompressed, return uncompressed
  // The decompressor will detect this by comparing sizes
  if (compressed.length >= uncompressedLE.length) {
    return uncompressedLE;
  }

  return compressed;
}

/**
 * Channel data structures for EXR images
 */


/**
 * Flat sample storage (one value per pixel per channel)
 */
class FlatSamples {
  /**
   * @param {string} sampleType
   * @param {Float32Array|Uint32Array|Uint16Array} data
   */
  constructor(sampleType, data) {
    this.sampleType = sampleType;
    this.data = data;
  }

  /**
   * Create F16 samples
   * @param {Uint16Array} data - Half-precision data as raw bits
   */
  static f16(data) {
    return new FlatSamples(SampleType.F16, data);
  }

  /**
   * Create F32 samples
   * @param {Float32Array} data
   */
  static f32(data) {
    return new FlatSamples(SampleType.F32, data);
  }

  /**
   * Create U32 samples
   * @param {Uint32Array} data
   */
  static u32(data) {
    return new FlatSamples(SampleType.U32, data);
  }

  get length() {
    return this.data.length;
  }

  /**
   * Get value at index
   * @param {number} index
   * @returns {number}
   */
  valueAt(index) {
    return this.data[index];
  }

  /**
   * Get the raw bytes for a sample at the given index (little-endian)
   * @param {number} index
   * @returns {Uint8Array}
   */
  getBytesAt(index) {
    const bytes = bytesPerSample(this.sampleType);
    const result = new Uint8Array(bytes);
    const view = new DataView(result.buffer);

    switch (this.sampleType) {
      case SampleType.F16:
        view.setUint16(0, this.data[index], true);
        break;
      case SampleType.F32:
        view.setFloat32(0, this.data[index], true);
        break;
      case SampleType.U32:
        view.setUint32(0, this.data[index], true);
        break;
    }

    return result;
  }
}

/**
 * Single channel with name and sample data
 */
class AnyChannel {
  /**
   * @param {string} name
   * @param {FlatSamples} samples
   * @param {boolean} quantizeLinearly
   * @param {Vec2} sampling
   */
  constructor(name, samples, quantizeLinearly = null, sampling = new Vec2(1, 1)) {
    this.name = name;
    this.samples = samples;
    this.quantizeLinearly = quantizeLinearly ?? !['R', 'G', 'B', 'Y', 'L'].includes(name);
    this.sampling = sampling;
  }

  /**
   * Get channel description
   * @returns {ChannelDescription}
   */
  toDescription() {
    return new ChannelDescription(this.name, this.samples.sampleType, this.quantizeLinearly, this.sampling);
  }
}

/**
 * Dynamic channel collection
 */
class AnyChannels {
  /**
   * @param {AnyChannel[]} list
   */
  constructor(list) {
    // Sort alphabetically
    this.list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    this._channelMap = new Map(this.list.map((ch) => [ch.name, ch]));
  }

  /**
   * Get the channel list for metadata
   * @returns {ChannelList}
   */
  getChannelList() {
    return new ChannelList(this.list.map((ch) => ch.toDescription()));
  }

  /**
   * Get sample bytes for a channel at a pixel index
   * @param {string} channelName
   * @param {number} pixelIndex
   * @returns {Uint8Array}
   */
  getSampleBytes(channelName, pixelIndex) {
    const channel = this._channelMap.get(channelName);
    return channel.samples.getBytesAt(pixelIndex);
  }
}

/**
 * Fixed channel configuration with pixel accessor
 */
class SpecificChannels {
  /**
   * @param {ChannelDescription[]} channels - Channel descriptions in order
   * @param {Function|Float32Array} pixels - Pixel accessor or interleaved data
   */
  constructor(channels, pixels) {
    // Sort channels alphabetically for storage order
    this._originalChannels = channels;
    this._sortedChannels = [...channels].sort((a, b) => a.name.localeCompare(b.name));
    this._channelIndices = new Map(channels.map((ch, i) => [ch.name, i]));
    this.pixels = pixels;
  }

  /**
   * Create RGB channels
   * @param {Function|Float32Array} pixels - (pos) => [r, g, b] or interleaved Float32Array
   * @param {string} sampleType
   */
  static rgb(pixels, sampleType = SampleType.F32) {
    return new SpecificChannels(
      [
        ChannelDescription.named('R', sampleType),
        ChannelDescription.named('G', sampleType),
        ChannelDescription.named('B', sampleType),
      ],
      pixels
    );
  }

  /**
   * Create RGBA channels
   * @param {Function|Float32Array} pixels - (pos) => [r, g, b, a] or interleaved Float32Array
   * @param {string} sampleType
   */
  static rgba(pixels, sampleType = SampleType.F32) {
    return new SpecificChannels(
      [
        ChannelDescription.named('R', sampleType),
        ChannelDescription.named('G', sampleType),
        ChannelDescription.named('B', sampleType),
        new ChannelDescription('A', sampleType, true), // Alpha is linear
      ],
      pixels
    );
  }

  /**
   * Builder for custom channels
   */
  static build() {
    return new SpecificChannelsBuilder();
  }

  /**
   * Get the channel list for metadata
   * @returns {ChannelList}
   */
  getChannelList() {
    return new ChannelList(this._sortedChannels);
  }

  /**
   * Get sample bytes for a channel at a pixel index
   * @param {string} channelName
   * @param {number} pixelIndex
   * @returns {Uint8Array}
   */
  getSampleBytes(channelName, pixelIndex) {
    const channelIndex = this._channelIndices.get(channelName);
    const channelDesc = this._originalChannels[channelIndex];
    const bytes = bytesPerSample(channelDesc.sampleType);
    const result = new Uint8Array(bytes);
    const view = new DataView(result.buffer);

    let value;

    if (typeof this.pixels === 'function') {
      // Callback-based: pixels(pixelIndex) returns array of values
      const values = this.pixels(pixelIndex);
      value = values[channelIndex];
    } else if (this.pixels instanceof Float32Array) {
      // Interleaved Float32Array
      const numChannels = this._originalChannels.length;
      value = this.pixels[pixelIndex * numChannels + channelIndex];
    } else {
      throw new Error('Unsupported pixel data type');
    }

    switch (channelDesc.sampleType) {
      case SampleType.F16:
        view.setUint16(0, floatToHalf(value), true);
        break;
      case SampleType.F32:
        view.setFloat32(0, value, true);
        break;
      case SampleType.U32:
        view.setUint32(0, value >>> 0, true);
        break;
    }

    return result;
  }
}

/**
 * Builder for SpecificChannels
 */
class SpecificChannelsBuilder {
  constructor() {
    this._channels = [];
  }

  /**
   * Add a channel
   * @param {string} name
   * @param {string} sampleType
   * @returns {SpecificChannelsBuilder}
   */
  withChannel(name, sampleType = SampleType.F32) {
    this._channels.push(ChannelDescription.named(name, sampleType));
    return this;
  }

  /**
   * Set pixel accessor and build
   * @param {Function|Float32Array} pixels
   * @returns {SpecificChannels}
   */
  withPixels(pixels) {
    return new SpecificChannels(this._channels, pixels);
  }

  /**
   * Set pixel function and build
   * @param {Function} fn - (pixelIndex) => [values...]
   * @returns {SpecificChannels}
   */
  withPixelFn(fn) {
    return new SpecificChannels(this._channels, fn);
  }
}

/**
 * Image container and write functionality
 */


/**
 * Complete EXR image container
 */
class Image {
  /**
   * @param {ImageAttributes} attributes - Image-level attributes
   * @param {Layer|Layer[]} layerData - Single layer or array of layers
   */
  constructor(attributes, layerData) {
    this.attributes = attributes;
    this.layerData = layerData;
  }

  /**
   * Get layers as array
   * @returns {Layer[]}
   */
  get layers() {
    return Array.isArray(this.layerData) ? this.layerData : [this.layerData];
  }

  /**
   * Create image from a single layer
   * @param {Layer} layer
   * @returns {Image}
   */
  static fromLayer(layer) {
    const displayWindow = IntegerBounds.fromDimensions(layer.size.x, layer.size.y);
    return new Image(new ImageAttributes(displayWindow), layer);
  }

  /**
   * Create image from channels (convenience method)
   * @param {Vec2|[number, number]} size - Image dimensions
   * @param {import('./channels.js').AnyChannels|import('./channels.js').SpecificChannels} channels
   * @param {Encoding} encoding
   * @returns {Image}
   */
  static fromChannels(size, channels, encoding = Encoding.FAST_LOSSLESS) {
    const vec = size instanceof Vec2 ? size : new Vec2(size[0], size[1]);
    const layer = Layer.create(vec, channels, encoding);
    return Image.fromLayer(layer);
  }

  /**
   * Create an empty image and add layers
   * @param {ImageAttributes} attributes
   * @returns {Image}
   */
  static empty(attributes) {
    return new Image(attributes, []);
  }

  /**
   * Add a layer to this image
   * @param {Layer} layer
   * @returns {Image}
   */
  withLayer(layer) {
    const layers = [...this.layers, layer];
    return new Image(this.attributes, layers);
  }

  /**
   * Start building a write operation
   * @returns {WriteImageWithOptions}
   */
  write() {
    return new WriteImageWithOptions(this);
  }
}

/**
 * Write operation builder
 */
class WriteImageWithOptions {
  /**
   * @param {Image} image
   */
  constructor(image) {
    this._image = image;
    this._parallel = false;
    this._onProgress = null;
  }

  /**
   * Enable parallel compression (future feature)
   * @returns {WriteImageWithOptions}
   */
  parallel() {
    this._parallel = true;
    return this;
  }

  /**
   * Disable parallel compression
   * @returns {WriteImageWithOptions}
   */
  nonParallel() {
    this._parallel = false;
    return this;
  }

  /**
   * Set progress callback
   * @param {Function} callback - (progress: number) => void, progress 0-1
   * @returns {WriteImageWithOptions}
   */
  onProgress(callback) {
    this._onProgress = callback;
    return this;
  }

  /**
   * Write to an ArrayBuffer
   * @returns {ArrayBuffer}
   */
  toArrayBuffer() {
    return writeImage(this._image, this._onProgress);
  }

  /**
   * Write to a Uint8Array
   * @returns {Uint8Array}
   */
  toUint8Array() {
    return new Uint8Array(this.toArrayBuffer());
  }

  /**
   * Write to a file (Node.js) or trigger download (browser)
   * @param {string} filename
   * @returns {Promise<void>}
   */
  async toFile(filename) {
    const buffer = this.toArrayBuffer();
    await writeToFile(buffer, filename);
  }
}

/**
 * Write an image to an ArrayBuffer
 * @param {Image} image
 * @param {Function|null} onProgress
 * @returns {ArrayBuffer}
 */
function writeImage(image, onProgress) {
  const layers = image.layers;

  // Build headers
  const headers = layers.map((layer, index) => {
    return new Header(
      layer.size,
      layer.channelData.getChannelList(),
      layer.encoding,
      image.attributes,
      layer.attributes
    );
  });

  // Create metadata
  const metaData = MetaData.fromHeaders(headers);
  const isMultiPart = metaData.requirements.hasMultipleLayers;

  // Create offset tables
  const offsetTables = headers.map((h) => new OffsetTable(h.chunkCount));

  // Calculate approximate buffer size
  const estimatedSize = estimateFileSize(headers, layers);
  const writer = new BinaryWriter(estimatedSize);

  // Write metadata
  metaData.write(writer);

  // Reserve space for offset tables and record their positions
  const offsetTablePositions = offsetTables.map((table) => {
    const pos = writer.getPosition();
    table.write(writer);
    return pos;
  });

  // Generate and write all blocks
  let totalBlocks = headers.reduce((sum, h) => sum + h.chunkCount, 0);
  let blocksWritten = 0;

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    headers[layerIndex];
    const offsetTable = offsetTables[layerIndex];

    // Create mip level manager if needed
    const hasMipLevels = layer.encoding.blocks.hasLevels();
    const mipManager = hasMipLevels
      ? new MipLevelManager(layer.channelData, layer.size, layer.encoding.blocks)
      : null;

    // Generate block indices for this layer
    const blockIndices = generateBlockIndices(
      layerIndex,
      layer.size,
      layer.encoding.blocks,
      layer.encoding.compression
    );

    // Write each block
    for (let blockNum = 0; blockNum < blockIndices.length; blockNum++) {
      const blockIndex = blockIndices[blockNum];

      // Record offset
      offsetTable.offsets[blockNum] = BigInt(writer.getPosition());

      // Get channel data for this level
      let channelData, levelSize;
      if (hasMipLevels) {
        channelData = mipManager.getChannelsForLevel(blockIndex.levelIndex);
        levelSize = mipManager.getSizeForLevel(blockIndex.levelIndex);
      } else {
        channelData = layer.channelData;
        levelSize = layer.size;
      }

      // Extract block data
      const blockData = extractBlockData(blockIndex, channelData, levelSize);

      // Build compression context for channel-aware compression
      const channelList = channelData.getChannelList();
      const compressionContext = {
        channels: channelList.list,
        width: blockIndex.pixelSize.x,
        height: blockIndex.pixelSize.y,
      };

      // Apply compression
      const compressedData = compressBlock(layer.encoding.compression, blockData, compressionContext);

      // Create and write chunk
      const chunk = createChunk(layerIndex, blockIndex, compressedData, layer.encoding.blocks);

      if (isMultiPart) {
        chunk.writeMultiPart(writer);
      } else {
        chunk.writeSinglePart(writer);
      }

      blocksWritten++;
      if (onProgress) {
        onProgress(blocksWritten / totalBlocks);
      }
    }
  }

  // Patch offset tables with actual values
  for (let i = 0; i < offsetTables.length; i++) {
    const table = offsetTables[i];
    const pos = offsetTablePositions[i];

    writer.patchAt(pos, (w) => {
      table.write(w);
    });
  }

  return writer.toArrayBuffer();
}

/**
 * Create a chunk from block data
 * @param {number} layerIndex
 * @param {import('../block/index.js').BlockIndex} blockIndex
 * @param {Uint8Array} data
 * @param {import('../core/types.js').Blocks} blocks
 * @returns {Chunk}
 */
function createChunk(layerIndex, blockIndex, data, blocks) {
  if (blocks.isTiled()) {
    // Calculate tile coordinates
    const tileSize = blocks.tileSize;
    const tileX = Math.floor(blockIndex.pixelPosition.x / tileSize.x);
    const tileY = Math.floor(blockIndex.pixelPosition.y / tileSize.y);

    return new Chunk(
      layerIndex,
      data,
      true,
      new Vec2(tileX, tileY),
      blockIndex.levelIndex,
      null
    );
  } else {
    return new Chunk(layerIndex, data, false, null, null, blockIndex.pixelPosition.y);
  }
}

/**
 * Estimate file size for buffer allocation
 * @param {Header[]} headers
 * @param {Layer[]} layers
 * @returns {number}
 */
function estimateFileSize(headers, layers) {
  let size = 1024; // Base overhead for headers

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const layer = layers[i];

    // Offset table
    size += header.chunkCount * 8;

    // Pixel data (uncompressed estimate)
    const bytesPerPixel = header.channels.bytesPerPixel;
    size += layer.size.x * layer.size.y * bytesPerPixel;

    // Chunk headers overhead
    size += header.chunkCount * 20;
  }

  return size;
}

/**
 * Generate downscaled channel data for a mip level
 * Uses box filter (2x2 average) for downscaling
 * @param {AnyChannels|SpecificChannels} channels - Source channel data
 * @param {Vec2} sourceSize - Source resolution
 * @param {Vec2} targetSize - Target resolution
 * @returns {AnyChannels} - Downscaled channel data
 */
function generateMipLevel(channels, sourceSize, targetSize) {
  const channelList = channels.getChannelList();
  const newChannels = [];

  for (const channelDesc of channelList.list) {
    const newData = downsampleChannel(
      channels, channelDesc.name, sourceSize, targetSize, channelDesc.sampleType
    );
    newChannels.push(new AnyChannel(
      channelDesc.name,
      newData,
      channelDesc.quantizeLinearly,
      channelDesc.sampling
    ));
  }

  return new AnyChannels(newChannels);
}

/**
 * Downsample a single channel using box filter
 * @param {AnyChannels|SpecificChannels} channels
 * @param {string} channelName
 * @param {Vec2} sourceSize
 * @param {Vec2} targetSize
 * @param {string} sampleType
 * @returns {FlatSamples}
 */
function downsampleChannel(channels, channelName, sourceSize, targetSize, sampleType) {
  const targetPixels = targetSize.x * targetSize.y;

  // Always use Float32 for intermediate computation
  const values = new Float32Array(targetPixels);

  for (let ty = 0; ty < targetSize.y; ty++) {
    for (let tx = 0; tx < targetSize.x; tx++) {
      // Calculate source region (2x2 box, clamped to bounds)
      const sx0 = tx * 2;
      const sy0 = ty * 2;
      const sx1 = Math.min(sx0 + 1, sourceSize.x - 1);
      const sy1 = Math.min(sy0 + 1, sourceSize.y - 1);

      // Sample 4 source pixels and average
      let sum = 0;
      let count = 0;

      for (const sy of [sy0, sy1]) {
        for (const sx of [sx0, sx1]) {
          if (sx < sourceSize.x && sy < sourceSize.y) {
            const srcIdx = sy * sourceSize.x + sx;
            sum += getChannelValue(channels, channelName, srcIdx, sampleType);
            count++;
          }
        }
      }

      const targetIdx = ty * targetSize.x + tx;
      values[targetIdx] = count > 0 ? sum / count : 0;
    }
  }

  // Convert to target sample type
  switch (sampleType) {
    case SampleType.F16: {
      const halfData = new Uint16Array(targetPixels);
      for (let i = 0; i < targetPixels; i++) {
        halfData[i] = floatToHalf(values[i]);
      }
      return FlatSamples.f16(halfData);
    }
    case SampleType.F32:
      return FlatSamples.f32(values);
    case SampleType.U32: {
      const u32Data = new Uint32Array(targetPixels);
      for (let i = 0; i < targetPixels; i++) {
        u32Data[i] = Math.round(values[i]) >>> 0;
      }
      return FlatSamples.u32(u32Data);
    }
    default:
      return FlatSamples.f32(values);
  }
}

/**
 * Get a channel value as float
 * @param {AnyChannels|SpecificChannels} channels
 * @param {string} channelName
 * @param {number} pixelIndex
 * @param {string} sampleType
 * @returns {number}
 */
function getChannelValue(channels, channelName, pixelIndex, sampleType) {
  const bytes = channels.getSampleBytes(channelName, pixelIndex);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  switch (sampleType) {
    case SampleType.F16:
      return halfToFloat(view.getUint16(0, true));
    case SampleType.F32:
      return view.getFloat32(0, true);
    case SampleType.U32:
      return view.getUint32(0, true);
    default:
      return 0;
  }
}

/**
 * Manages channel data for multiple mip levels
 */
class MipLevelManager {
  /**
   * @param {AnyChannels|SpecificChannels} baseChannels - Level 0 channel data
   * @param {Vec2} baseSize - Level 0 size
   * @param {import('../core/types.js').Blocks} blocks
   */
  constructor(baseChannels, baseSize, blocks) {
    this.baseChannels = baseChannels;
    this.baseSize = baseSize;
    this.blocks = blocks;
    this.levelData = new Map(); // levelKey -> AnyChannels
    this.levelData.set('0,0', baseChannels);
  }

  /**
   * Get channel data for a specific level
   * @param {Vec2} levelIndex
   * @returns {AnyChannels|SpecificChannels}
   */
  getChannelsForLevel(levelIndex) {
    const key = `${levelIndex.x},${levelIndex.y}`;

    if (this.levelData.has(key)) {
      return this.levelData.get(key);
    }

    // Generate the level by downscaling from appropriate source
    const levelSize = getLevelSize(this.baseSize, levelIndex, this.blocks.levelMode, this.blocks.roundingMode);

    if (this.blocks.levelMode === LevelMode.MipMap) {
      // For mip maps, each level is derived from the previous level
      const prevLevel = levelIndex.x - 1;
      const prevChannels = this.getChannelsForLevel(new Vec2(prevLevel, prevLevel));
      const prevSize = getLevelSize(this.baseSize, new Vec2(prevLevel, prevLevel), this.blocks.levelMode, this.blocks.roundingMode);

      const newChannels = generateMipLevel(prevChannels, prevSize, levelSize);
      this.levelData.set(key, newChannels);
      return newChannels;
    } else if (this.blocks.levelMode === LevelMode.RipMap) {
      // For rip maps, derive from the nearest available level
      let sourceChannels, sourceSize;

      if (levelIndex.x > 0 && this.levelData.has(`${levelIndex.x - 1},${levelIndex.y}`)) {
        // Derive from level to the left (reduce X)
        const sourceLevel = new Vec2(levelIndex.x - 1, levelIndex.y);
        sourceChannels = this.getChannelsForLevel(sourceLevel);
        sourceSize = getLevelSize(this.baseSize, sourceLevel, this.blocks.levelMode, this.blocks.roundingMode);
      } else if (levelIndex.y > 0 && this.levelData.has(`${levelIndex.x},${levelIndex.y - 1}`)) {
        // Derive from level above (reduce Y)
        const sourceLevel = new Vec2(levelIndex.x, levelIndex.y - 1);
        sourceChannels = this.getChannelsForLevel(sourceLevel);
        sourceSize = getLevelSize(this.baseSize, sourceLevel, this.blocks.levelMode, this.blocks.roundingMode);
      } else if (levelIndex.x > 0) {
        // Need to generate from left first
        const sourceLevel = new Vec2(levelIndex.x - 1, levelIndex.y);
        sourceChannels = this.getChannelsForLevel(sourceLevel);
        sourceSize = getLevelSize(this.baseSize, sourceLevel, this.blocks.levelMode, this.blocks.roundingMode);
      } else if (levelIndex.y > 0) {
        // Need to generate from above first
        const sourceLevel = new Vec2(levelIndex.x, levelIndex.y - 1);
        sourceChannels = this.getChannelsForLevel(sourceLevel);
        sourceSize = getLevelSize(this.baseSize, sourceLevel, this.blocks.levelMode, this.blocks.roundingMode);
      } else {
        // Level (0,0) should already be in cache
        return this.baseChannels;
      }

      const newChannels = generateMipLevel(sourceChannels, sourceSize, levelSize);
      this.levelData.set(key, newChannels);
      return newChannels;
    }

    return this.baseChannels;
  }

  /**
   * Get size for a specific level
   * @param {Vec2} levelIndex
   * @returns {Vec2}
   */
  getSizeForLevel(levelIndex) {
    return getLevelSize(this.baseSize, levelIndex, this.blocks.levelMode, this.blocks.roundingMode);
  }
}

/**
 * Public API for exr-js
 */


/**
 * Write an RGBA image to a file
 * @param {string|null} path - File path (Node) or null for ArrayBuffer
 * @param {number} width
 * @param {number} height
 * @param {Function|Float32Array} pixels - (index) => [r,g,b,a] or interleaved Float32Array
 * @param {Encoding} encoding
 * @returns {Promise<ArrayBuffer|void>}
 */
async function writeRgbaFile(path, width, height, pixels, encoding = Encoding.FAST_LOSSLESS) {
  const channels = SpecificChannels.rgba(pixels);
  const image = Image.fromChannels(new Vec2(width, height), channels, encoding);

  if (path) {
    return image.write().toFile(path);
  }
  return image.write().toArrayBuffer();
}

/**
 * Write an RGB image to a file
 * @param {string|null} path - File path (Node) or null for ArrayBuffer
 * @param {number} width
 * @param {number} height
 * @param {Function|Float32Array} pixels - (index) => [r,g,b] or interleaved Float32Array
 * @param {Encoding} encoding
 * @returns {Promise<ArrayBuffer|void>}
 */
async function writeRgbFile(path, width, height, pixels, encoding = Encoding.FAST_LOSSLESS) {
  const channels = SpecificChannels.rgb(pixels);
  const image = Image.fromChannels(new Vec2(width, height), channels, encoding);

  if (path) {
    return image.write().toFile(path);
  }
  return image.write().toArrayBuffer();
}

/**
 * High-level EXR writer for render passes
 */
class EXRWriter {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** @type {LayerBuilder[]} */
    this._layers = [];
  }

  /**
   * Add a render pass layer
   * @param {string} name - Layer name
   * @param {object} options
   * @returns {LayerBuilder}
   */
  addLayer(name, options = {}) {
    const builder = new LayerBuilder(this, name, options);
    return builder;
  }

  /**
   * Build and write the EXR
   * @param {string|null} filenameOrNull - Filename or null for ArrayBuffer
   * @returns {Promise<ArrayBuffer|void>}
   */
  async write(filenameOrNull = null) {
    const image = this._buildImage();

    if (filenameOrNull) {
      return image.write().toFile(filenameOrNull);
    }
    return image.write().toArrayBuffer();
  }

  /**
   * Build the Image object
   * @returns {Image}
   */
  _buildImage() {
    const size = new Vec2(this.width, this.height);
    const layers = this._layers.map((builder) => builder._build(size));

    if (layers.length === 1) {
      return Image.fromLayer(layers[0]);
    }

    const displayWindow = IntegerBounds.fromDimensions(this.width, this.height);
    return new Image(new ImageAttributes(displayWindow), layers);
  }
}

/**
 * Builder for a single layer
 */
class LayerBuilder {
  /**
   * @param {EXRWriter} writer
   * @param {string} name
   * @param {object} options
   */
  constructor(writer, name, options) {
    this._writer = writer;
    this._name = name;
    this._encoding = options.encoding || Encoding.FAST_LOSSLESS;
    this._channelDescriptions = [];
    this._pixelSource = null;
    this._isRgba = false;
    this._isRgb = false;
    this._sampleType = SampleType.F32;
  }

  /**
   * Set RGBA channels
   * @param {Float32Array|Function} data
   * @returns {LayerBuilder}
   */
  rgba(data) {
    this._isRgba = true;
    this._pixelSource = data;
    return this;
  }

  /**
   * Set RGB channels
   * @param {Float32Array|Function} data
   * @returns {LayerBuilder}
   */
  rgb(data) {
    this._isRgb = true;
    this._pixelSource = data;
    return this;
  }

  /**
   * Add a single channel
   * @param {string} name - Channel name
   * @param {string} sampleType - Sample type (SampleType.F16, F32, or U32)
   * @param {Float32Array|Uint32Array|Uint16Array} data - Sample data
   * @returns {LayerBuilder}
   */
  channel(name, sampleType, data) {
    this._channelDescriptions.push({ name, sampleType, data });
    return this;
  }

  /**
   * Set compression method
   * @param {number} compression - Compression type from Compression enum
   * @returns {LayerBuilder}
   */
  compression(compression) {
    this._encoding = new Encoding(compression, this._encoding.blocks, this._encoding.lineOrder);
    return this;
  }

  /**
   * Use tiled storage
   * @param {number} tileWidth - Tile width (default 64)
   * @param {number} tileHeight - Tile height (default 64)
   * @returns {LayerBuilder}
   */
  tiled(tileWidth = 64, tileHeight = 64) {
    this._encoding = new Encoding(
      this._encoding.compression,
      Blocks.Tiles(new Vec2(tileWidth, tileHeight)),
      LineOrder.Unspecified
    );
    return this;
  }

  /**
   * Use scanline storage
   * @returns {LayerBuilder}
   */
  scanlines() {
    this._encoding = new Encoding(
      this._encoding.compression,
      Blocks.ScanLines,
      LineOrder.Increasing
    );
    return this;
  }

  /**
   * Set sample type for RGB/RGBA channels
   * @param {string} sampleType - SampleType.F16, F32, or U32
   * @returns {LayerBuilder}
   */
  sampleType(sampleType) {
    this._sampleType = sampleType;
    return this;
  }

  /**
   * Complete this layer and return to writer
   * @returns {EXRWriter}
   */
  end() {
    this._writer._layers.push(this);
    return this._writer;
  }

  /**
   * Build the Layer object
   * @param {Vec2} size
   * @returns {Layer}
   */
  _build(size) {
    let channelData;

    if (this._isRgba) {
      channelData = SpecificChannels.rgba(this._pixelSource, this._sampleType);
    } else if (this._isRgb) {
      channelData = SpecificChannels.rgb(this._pixelSource, this._sampleType);
    } else {
      // Build from individual channels
      const channels = this._channelDescriptions.map(({ name, sampleType, data }) => {
        let samples;
        if (sampleType === SampleType.F16 || data instanceof Uint16Array) {
          samples = FlatSamples.f16(data);
        } else if (sampleType === SampleType.U32 || data instanceof Uint32Array) {
          samples = FlatSamples.u32(data);
        } else {
          samples = FlatSamples.f32(data);
        }
        return new AnyChannel(name, samples);
      });
      channelData = new AnyChannels(channels);
    }

    return new Layer(size, LayerAttributes.named(this._name), this._encoding, channelData);
  }
}

export { AnyChannel, AnyChannels, Blocks, ChannelDescription, ChannelList, Compression, EXRWriter, Encoding, FlatSamples, Image, ImageAttributes, IntegerBounds, Layer, LayerAttributes, LevelMode, LineOrder, RoundingMode, SampleType, SpecificChannels, Vec2, float32ArrayToHalf, floatToHalf, halfToFloat, halfToFloat32Array, writeRgbFile, writeRgbaFile };
