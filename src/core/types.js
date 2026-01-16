// Core data types for EXR images

// 2D vector for coordinates and dimensions
export class Vec2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  area() {
    return this.x * this.y;
  }

  // Convert 2D position to flat array index
  flatIndex(width) {
    return this.y * width + this.x;
  }

  add(other) {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  sub(other) {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  mul(scalar) {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  div(scalar) {
    return new Vec2(Math.floor(this.x / scalar), Math.floor(this.y / scalar));
  }

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

// Integer rectangle bounds (data window, display window, block bounds)
export class IntegerBounds {
  constructor(position, size) {
    this.position = position;
    this.size = size;
  }

  // Create bounds from dimensions starting at origin
  static fromDimensions(width, height) {
    return new IntegerBounds(new Vec2(0, 0), new Vec2(width, height));
  }

  // Create bounds from min/max coordinates
  static fromMinMax(minX, minY, maxX, maxY) {
    return new IntegerBounds(
      new Vec2(minX, minY),
      new Vec2(maxX - minX, maxY - minY)
    );
  }

  end() {
    return new Vec2(
      this.position.x + this.size.x,
      this.position.y + this.size.y
    );
  }

  area() {
    return this.size.area();
  }

  // Check if a position is within bounds
  contains(pos) {
    const end = this.end();
    return (
      pos.x >= this.position.x &&
      pos.x < end.x &&
      pos.y >= this.position.y &&
      pos.y < end.y
    );
  }

  // Intersect with another bounds
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

// Sample type enumeration - the type of each pixel sample value
export const SampleType = Object.freeze({
  // 16-bit IEEE 754 half-precision float
  F16: 'f16',
  // 32-bit IEEE 754 single-precision float
  F32: 'f32',
  // 32-bit unsigned integer
  U32: 'u32',
});

// Get the number of bytes per sample for a given sample type
export function bytesPerSample(sampleType) {
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

// Get the TypedArray constructor for a given sample type
export function typedArrayForSampleType(sampleType) {
  switch (sampleType) {
    case SampleType.F16:
      return Uint16Array; // F16 stored as raw bits in Uint16
    case SampleType.F32:
      return Float32Array;
    case SampleType.U32:
      return Uint32Array;
    default:
      throw new Error(`Unknown sample type: ${sampleType}`);
  }
}

// Compression method enumeration
export const Compression = Object.freeze({
  // No compression
  Uncompressed: 0,
  // Run-length encoding
  RLE: 1,
  // zlib compression, one scan line at a time
  ZIP1: 2,
  // zlib compression, 16 scan lines at a time
  ZIP16: 3,
  // PIZ-based wavelet compression
  PIZ: 4,
  // lossy 24-bit float compression
  PXR24: 5,
  // lossy 4x4 pixel block compression, fixed rate
  B44: 6,
  // lossy 4x4 pixel block compression, flat fields compressed more
  B44A: 7,
});

// Get the number of scan lines per block for a compression method
export function scanLinesPerBlock(compression) {
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

// Line order enumeration
export const LineOrder = Object.freeze({
  // Scan lines are stored in increasing Y order
  Increasing: 0,
  // Scan lines are stored in decreasing Y order
  Decreasing: 1,
  // Scan lines are stored in unspecified order (for tiled images)
  Unspecified: 2,
});

// Block storage mode
export class Blocks {
  constructor(type, tileSize = null, levelMode = 0, roundingMode = 0) {
    this.type = type;
    this.tileSize = tileSize;
    this.levelMode = levelMode;
    this.roundingMode = roundingMode;
  }

  static ScanLines = new Blocks('scanlines');

  // Create tiled block mode
  static Tiles(size) {
    return new Blocks('tiles', size, 0, 0); // Singular, RoundDown
  }

  // Create tiled block mode with mip maps
  static MipMaps(size, roundingMode = 0) {
    return new Blocks('tiles', size, 1, roundingMode); // MipMap
  }

  // Create tiled block mode with rip maps
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

// Level mode for mip/rip maps
export const LevelMode = Object.freeze({
  // Single resolution
  Singular: 0,
  // Mip maps (powers of 2 reduction in both dimensions)
  MipMap: 1,
  // Rip maps (independent powers of 2 reduction in each dimension)
  RipMap: 2,
});

// Rounding mode for level size calculations
export const RoundingMode = Object.freeze({
  // Round down
  Down: 0,
  // Round up
  Up: 1,
});

// Calculate the size at a given mip level
export function mipLevelSize(fullSize, level, roundingMode) {
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

// Calculate the number of mip levels for a given dimension
export function mipLevelCount(fullSize) {
  if (fullSize <= 0) return 0;
  return 1 + Math.floor(Math.log2(fullSize));
}

// Calculate mip level counts for an image
// For mip maps: both dimensions use max(width, height) level count
// For rip maps: each dimension has its own level count
export function getLevelCounts(size, levelMode) {
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

// Calculate the size of a level for mip/rip maps
export function getLevelSize(fullSize, levelIndex, levelMode, roundingMode) {
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
