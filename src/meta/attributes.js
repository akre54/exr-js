// EXR Header Attributes
// Attributes are key-value pairs stored in headers.
// Each attribute has: name (null-terminated), type (null-terminated), size (i32), value (bytes)

import { BinaryWriter } from '../io/binary-writer.js';
import { Vec2, IntegerBounds, SampleType, bytesPerSample, Compression, LineOrder, LevelMode, RoundingMode, Blocks } from '../core/types.js';
import { AttributeType } from '../core/constants.js';

// Write a null-terminated string
// @param {BinaryWriter} writer
// @param {string} str
export function writeNullTerminatedString(writer, str) {
  writer.writeNullTerminatedString(str);
}

// Write an attribute to the writer
// @param {BinaryWriter} writer
// @param {string} name - Attribute name
// @param {string} typeName - Attribute type name
// @param {Uint8Array|function} value - Value bytes or write function
export function writeAttribute(writer, name, typeName, value) {
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

// Write a box2i (integer bounds) attribute
// @param {BinaryWriter} writer
// @param {string} name
// @param {IntegerBounds} bounds
export function writeBox2i(writer, name, bounds) {
  writeAttribute(writer, name, AttributeType.BOX2I, (w) => {
    // xMin, yMin, xMax, yMax (all i32, max is inclusive)
    w.writeI32(bounds.position.x);
    w.writeI32(bounds.position.y);
    w.writeI32(bounds.position.x + bounds.size.x - 1);
    w.writeI32(bounds.position.y + bounds.size.y - 1);
  });
}

// Write a compression attribute
// @param {BinaryWriter} writer
// @param {number} compression
export function writeCompression(writer, compression) {
  writeAttribute(writer, 'compression', AttributeType.COMPRESSION, (w) => {
    w.writeU8(compression);
  });
}

// Write a line order attribute
// @param {BinaryWriter} writer
// @param {number} lineOrder
export function writeLineOrder(writer, lineOrder) {
  writeAttribute(writer, 'lineOrder', AttributeType.LINE_ORDER, (w) => {
    w.writeU8(lineOrder);
  });
}

// Write a float attribute
// @param {BinaryWriter} writer
// @param {string} name
// @param {number} value
export function writeFloat(writer, name, value) {
  writeAttribute(writer, name, AttributeType.FLOAT, (w) => {
    w.writeF32(value);
  });
}

// Write a v2f (Vec2<f32>) attribute
// @param {BinaryWriter} writer
// @param {string} name
// @param {Vec2} value
export function writeV2f(writer, name, value) {
  writeAttribute(writer, name, AttributeType.V2F, (w) => {
    w.writeF32(value.x);
    w.writeF32(value.y);
  });
}

// Write a string attribute
// @param {BinaryWriter} writer
// @param {string} name
// @param {string} value
export function writeString(writer, name, value) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  writeAttribute(writer, name, AttributeType.STRING, bytes);
}

// Write a tiledesc attribute
// @param {BinaryWriter} writer
// @param {Vec2} tileSize
// @param {number} levelMode
// @param {number} roundingMode
export function writeTileDescription(writer, tileSize, levelMode, roundingMode) {
  writeAttribute(writer, 'tiles', AttributeType.TILE_DESC, (w) => {
    w.writeU32(tileSize.x);
    w.writeU32(tileSize.y);
    // mode byte: bits 0-3 = level mode, bits 4-7 = rounding mode
    const mode = (levelMode & 0x0f) | ((roundingMode & 0x0f) << 4);
    w.writeU8(mode);
  });
}

// Channel description for the channel list
export class ChannelDescription {
  // @param {string} name - Channel name
// @param {string} sampleType - Sample type (f16, f32, u32)
// @param {boolean} quantizeLinearly - True for alpha/depth, false for RGB
// @param {Vec2} sampling - Subsampling (usually 1,1)
  constructor(name, sampleType = SampleType.F32, quantizeLinearly = null, sampling = new Vec2(1, 1)) {
    this.name = name;
    this.sampleType = sampleType;
    // Auto-detect quantization based on channel name
    this.quantizeLinearly = quantizeLinearly ?? !['R', 'G', 'B', 'Y', 'L'].includes(name);
    this.sampling = sampling;
  }

  // Create a channel description with just name and type
// @param {string} name
// @param {string} sampleType
// @returns {ChannelDescription}
  static named(name, sampleType = SampleType.F32) {
    return new ChannelDescription(name, sampleType);
  }

  // Get the pixel type ID for the file format
// @returns {number}
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

  // Get bytes per sample
// @returns {number}
  get bytesPerSample() {
    return bytesPerSample(this.sampleType);
  }
}

// Channel list - collection of channel descriptions
export class ChannelList {
  // @param {ChannelDescription[]} channels
  constructor(channels) {
    // Sort channels alphabetically by name (EXR requirement)
    this.list = [...channels].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Calculate bytes per pixel
// @returns {number}
  get bytesPerPixel() {
    return this.list.reduce((sum, ch) => sum + ch.bytesPerSample, 0);
  }

  // Check if all channels have the same sample type
// @returns {string|null}
  get uniformSampleType() {
    if (this.list.length === 0) return null;
    const first = this.list[0].sampleType;
    return this.list.every((ch) => ch.sampleType === first) ? first : null;
  }

  // Write the channel list to a writer
// @param {BinaryWriter} writer
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

// Write channel list attribute
// @param {BinaryWriter} writer
// @param {ChannelList} channels
export function writeChannelList(writer, channels) {
  writeAttribute(writer, 'channels', AttributeType.CHLIST, (w) => {
    channels.write(w);
  });
}

// Write the type attribute (scanlineimage, tiledimage, etc.)
// @param {BinaryWriter} writer
// @param {string} type - 'scanlineimage' or 'tiledimage'
export function writeType(writer, type) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(type);
  writeAttribute(writer, 'type', AttributeType.STRING, bytes);
}

// Write an int attribute
// @param {BinaryWriter} writer
// @param {string} name
// @param {number} value
export function writeInt(writer, name, value) {
  writeAttribute(writer, name, 'int', (w) => {
    w.writeI32(value);
  });
}
