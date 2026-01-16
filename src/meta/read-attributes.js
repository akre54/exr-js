// EXR Attribute Reading
// Parse attributes from EXR headers.
// Each attribute has: name (null-terminated), type (null-terminated), size (i32), value (bytes)

import { Vec2, IntegerBounds, SampleType, LevelMode, RoundingMode } from '../core/types.js';
import { AttributeType } from '../core/constants.js';
import { ChannelDescription, ChannelList } from './attributes.js';

// Read a single attribute from the reader
// @param {import('../io/binary-reader.js').BinaryReader} reader
// @returns {{ name: string, type: string, size: number, value: any } | null} - null if header end
export function readAttribute(reader) {
  // Check for header end (null byte as name)
  if (reader.peekU8() === 0) {
    reader.skip(1); // Consume the null byte
    return null;
  }

  const name = reader.readNullTerminatedString();
  const type = reader.readNullTerminatedString();
  const size = reader.readI32();

  // Read raw value bytes
  const valueBytes = reader.readBytesView(size);

  // Parse value based on type
  const value = parseAttributeValue(type, valueBytes, size);

  return { name, type, size, value };
}

// Parse an attribute value based on its type
// @param {string} type - Attribute type name
// @param {Uint8Array} bytes - Raw value bytes
// @param {number} size - Size in bytes
// @returns {any}
function parseAttributeValue(type, bytes, size) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  switch (type) {
    case AttributeType.BOX2I:
    case 'box2i':
      return readBox2iFromView(view);

    case AttributeType.COMPRESSION:
    case 'compression':
      return bytes[0];

    case AttributeType.LINE_ORDER:
    case 'lineOrder':
      return bytes[0];

    case AttributeType.FLOAT:
    case 'float':
      return view.getFloat32(0, true);

    case AttributeType.V2F:
    case 'v2f':
      return new Vec2(view.getFloat32(0, true), view.getFloat32(4, true));

    case AttributeType.V2I:
    case 'v2i':
      return new Vec2(view.getInt32(0, true), view.getInt32(4, true));

    case AttributeType.STRING:
    case 'string':
      return new TextDecoder().decode(bytes);

    case AttributeType.INT:
    case 'int':
      return view.getInt32(0, true);

    case AttributeType.TILE_DESC:
    case 'tiledesc':
      return readTileDescFromView(view);

    case AttributeType.CHLIST:
    case 'chlist':
      return readChannelListFromBytes(bytes);

    case AttributeType.DOUBLE:
    case 'double':
      return view.getFloat64(0, true);

    case AttributeType.RATIONAL:
    case 'rational':
      return {
        numerator: view.getInt32(0, true),
        denominator: view.getUint32(4, true),
      };

    case AttributeType.M33F:
    case 'm33f':
      return readMatrix(view, 9);

    case AttributeType.M44F:
    case 'm44f':
      return readMatrix(view, 16);

    case AttributeType.V3F:
    case 'v3f':
      return {
        x: view.getFloat32(0, true),
        y: view.getFloat32(4, true),
        z: view.getFloat32(8, true),
      };

    case AttributeType.V3I:
    case 'v3i':
      return {
        x: view.getInt32(0, true),
        y: view.getInt32(4, true),
        z: view.getInt32(8, true),
      };

    case AttributeType.BOX2F:
    case 'box2f':
      return {
        min: new Vec2(view.getFloat32(0, true), view.getFloat32(4, true)),
        max: new Vec2(view.getFloat32(8, true), view.getFloat32(12, true)),
      };

    case AttributeType.CHROMATICITIES:
    case 'chromaticities':
      return {
        redX: view.getFloat32(0, true),
        redY: view.getFloat32(4, true),
        greenX: view.getFloat32(8, true),
        greenY: view.getFloat32(12, true),
        blueX: view.getFloat32(16, true),
        blueY: view.getFloat32(20, true),
        whiteX: view.getFloat32(24, true),
        whiteY: view.getFloat32(28, true),
      };

    case AttributeType.TIMECODE:
    case 'timecode':
      return {
        timeAndFlags: view.getUint32(0, true),
        userData: view.getUint32(4, true),
      };

    case AttributeType.KEYCODE:
    case 'keycode':
      return {
        filmMfcCode: view.getInt32(0, true),
        filmType: view.getInt32(4, true),
        prefix: view.getInt32(8, true),
        count: view.getInt32(12, true),
        perfOffset: view.getInt32(16, true),
        perfsPerFrame: view.getInt32(20, true),
        perfsPerCount: view.getInt32(24, true),
      };

    case AttributeType.ENVMAP:
    case 'envmap':
      return bytes[0]; // 0 = latlong, 1 = cube

    case AttributeType.PREVIEW:
    case 'preview':
      return {
        width: view.getUint32(0, true),
        height: view.getUint32(4, true),
        pixels: bytes.slice(8), // RGBA pixels
      };

    case AttributeType.STRING_VECTOR:
    case 'stringvector':
      return readStringVector(bytes);

    default:
      // Unknown type - return raw bytes
      return bytes.slice();
  }
}

// Read box2i from DataView
// @param {DataView} view
// @returns {IntegerBounds}
function readBox2iFromView(view) {
  const xMin = view.getInt32(0, true);
  const yMin = view.getInt32(4, true);
  const xMax = view.getInt32(8, true);
  const yMax = view.getInt32(12, true);

  // Convert from inclusive max to exclusive (size)
  return new IntegerBounds(new Vec2(xMin, yMin), new Vec2(xMax - xMin + 1, yMax - yMin + 1));
}

// Read tile description from DataView
// @param {DataView} view
// @returns {{ tileSize: Vec2, levelMode: number, roundingMode: number }}
function readTileDescFromView(view) {
  const tileWidth = view.getUint32(0, true);
  const tileHeight = view.getUint32(4, true);
  const mode = view.getUint8(8);

  return {
    tileSize: new Vec2(tileWidth, tileHeight),
    levelMode: mode & 0x0f,
    roundingMode: (mode >> 4) & 0x0f,
  };
}

// Read channel list from bytes
// @param {Uint8Array} bytes
// @returns {ChannelList}
function readChannelListFromBytes(bytes) {
  const channels = [];
  let offset = 0;

  while (offset < bytes.length) {
    // Check for list terminator
    if (bytes[offset] === 0) {
      break;
    }

    // Read channel name (null-terminated)
    let nameEnd = offset;
    while (nameEnd < bytes.length && bytes[nameEnd] !== 0) {
      nameEnd++;
    }
    const name = new TextDecoder().decode(bytes.subarray(offset, nameEnd));
    offset = nameEnd + 1; // Skip null terminator

    // Read channel attributes
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 16);
    const pixelTypeId = view.getInt32(0, true);
    const pLinear = view.getUint8(4);
    // Skip 3 reserved bytes
    const xSampling = view.getInt32(8, true);
    const ySampling = view.getInt32(12, true);
    offset += 16;

    // Convert pixel type ID to sample type
    let sampleType;
    switch (pixelTypeId) {
      case 0:
        sampleType = SampleType.U32;
        break;
      case 1:
        sampleType = SampleType.F16;
        break;
      case 2:
        sampleType = SampleType.F32;
        break;
      default:
        throw new Error(`Unknown pixel type ID: ${pixelTypeId}`);
    }

    channels.push(new ChannelDescription(name, sampleType, pLinear !== 0, new Vec2(xSampling, ySampling)));
  }

  return new ChannelList(channels);
}

// Read matrix from DataView
// @param {DataView} view
// @param {number} count - Number of floats (9 for 3x3, 16 for 4x4)
// @returns {Float32Array}
function readMatrix(view, count) {
  const matrix = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    matrix[i] = view.getFloat32(i * 4, true);
  }
  return matrix;
}

// Read string vector from bytes
// @param {Uint8Array} bytes
// @returns {string[]}
function readStringVector(bytes) {
  const strings = [];
  let offset = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (offset < bytes.length) {
    const length = view.getInt32(offset, true);
    offset += 4;
    if (length > 0 && offset + length <= bytes.length) {
      strings.push(new TextDecoder().decode(bytes.subarray(offset, offset + length)));
      offset += length;
    } else {
      break;
    }
  }

  return strings;
}

// Map pixel type ID to sample type string
// @param {number} pixelTypeId
// @returns {string}
export function pixelTypeIdToSampleType(pixelTypeId) {
  switch (pixelTypeId) {
    case 0:
      return SampleType.U32;
    case 1:
      return SampleType.F16;
    case 2:
      return SampleType.F32;
    default:
      throw new Error(`Unknown pixel type ID: ${pixelTypeId}`);
  }
}

// Map sample type string to pixel type ID
// @param {string} sampleType
// @returns {number}
export function sampleTypeToPixelTypeId(sampleType) {
  switch (sampleType) {
    case SampleType.U32:
      return 0;
    case SampleType.F16:
      return 1;
    case SampleType.F32:
      return 2;
    default:
      throw new Error(`Unknown sample type: ${sampleType}`);
  }
}
