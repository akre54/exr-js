/**
 * EXR file format constants
 */

/** Magic number identifying an EXR file */
export const MAGIC_NUMBER = 0x01312f76; // Little-endian: 0x76, 0x2f, 0x31, 0x01

/** Current EXR version */
export const EXR_VERSION = 2;

/** Version flags */
export const VersionFlags = Object.freeze({
  /** Single-part tiled image */
  TILED: 1 << 9,
  /** Attribute or channel names longer than 31 characters */
  LONG_NAMES: 1 << 10,
  /** Deep data (not yet supported) */
  DEEP_DATA: 1 << 11,
  /** Multi-part file */
  MULTI_PART: 1 << 12,
});

/** Maximum attribute name/value length without LONG_NAMES flag */
export const MAX_SHORT_NAME_LENGTH = 31;

/** Maximum attribute name/value length with LONG_NAMES flag */
export const MAX_LONG_NAME_LENGTH = 255;

/** Attribute type names as written in the file */
export const AttributeType = Object.freeze({
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

/** Required header attributes */
export const RequiredAttributes = Object.freeze([
  'channels',
  'compression',
  'dataWindow',
  'displayWindow',
  'lineOrder',
  'pixelAspectRatio',
  'screenWindowCenter',
  'screenWindowWidth',
]);

/** Additional required attributes for tiled images */
export const TiledAttributes = Object.freeze(['tiles']);

/** Additional required attributes for multi-part files */
export const MultiPartAttributes = Object.freeze(['name', 'type']);

/** Layer type identifiers */
export const LayerType = Object.freeze({
  SCANLINE: 'scanlineimage',
  TILED: 'tiledimage',
  DEEP_SCANLINE: 'deepscanline',
  DEEP_TILED: 'deeptile',
});

/** Default tile size */
export const DEFAULT_TILE_SIZE = 64;

/** Compression IDs as written in the file */
export const CompressionId = Object.freeze({
  NO_COMPRESSION: 0,
  RLE_COMPRESSION: 1,
  ZIPS_COMPRESSION: 2,
  ZIP_COMPRESSION: 3,
  PIZ_COMPRESSION: 4,
  PXR24_COMPRESSION: 5,
  B44_COMPRESSION: 6,
  B44A_COMPRESSION: 7,
  DWAA_COMPRESSION: 8,
  DWAB_COMPRESSION: 9,
});
