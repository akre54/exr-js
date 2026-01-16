// Little-endian binary writer with automatic buffer growth

import { floatToHalf } from '../lib/half.js';

const DEFAULT_CAPACITY = 65536;
const GROWTH_FACTOR = 2;

// Binary writer for constructing EXR files
// All multi-byte values are written in little-endian format
export class BinaryWriter {
  // @param {number} initialCapacity - Initial buffer size in bytes
  constructor(initialCapacity = DEFAULT_CAPACITY) {
    this.buffer = new ArrayBuffer(initialCapacity);
    this.view = new DataView(this.buffer);
    this.u8 = new Uint8Array(this.buffer);
    this.position = 0;
  }

  // Ensure buffer has capacity for additional bytes
// @param {number} additional - Number of bytes needed
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

  // Write unsigned 8-bit integer
// @param {number} value
  writeU8(value) {
    this.ensureCapacity(1);
    this.u8[this.position++] = value;
  }

  // Write signed 8-bit integer
// @param {number} value
  writeI8(value) {
    this.ensureCapacity(1);
    this.view.setInt8(this.position++, value);
  }

  // Write unsigned 16-bit integer (little-endian)
// @param {number} value
  writeU16(value) {
    this.ensureCapacity(2);
    this.view.setUint16(this.position, value, true);
    this.position += 2;
  }

  // Write signed 16-bit integer (little-endian)
// @param {number} value
  writeI16(value) {
    this.ensureCapacity(2);
    this.view.setInt16(this.position, value, true);
    this.position += 2;
  }

  // Write unsigned 32-bit integer (little-endian)
// @param {number} value
  writeU32(value) {
    this.ensureCapacity(4);
    this.view.setUint32(this.position, value, true);
    this.position += 4;
  }

  // Write signed 32-bit integer (little-endian)
// @param {number} value
  writeI32(value) {
    this.ensureCapacity(4);
    this.view.setInt32(this.position, value, true);
    this.position += 4;
  }

  // Write unsigned 64-bit integer (little-endian)
// @param {number|bigint} value
  writeU64(value) {
    this.ensureCapacity(8);
    this.view.setBigUint64(this.position, BigInt(value), true);
    this.position += 8;
  }

  // Write signed 64-bit integer (little-endian)
// @param {number|bigint} value
  writeI64(value) {
    this.ensureCapacity(8);
    this.view.setBigInt64(this.position, BigInt(value), true);
    this.position += 8;
  }

  // Write 32-bit float (little-endian)
// @param {number} value
  writeF32(value) {
    this.ensureCapacity(4);
    this.view.setFloat32(this.position, value, true);
    this.position += 4;
  }

  // Write 64-bit float (little-endian)
// @param {number} value
  writeF64(value) {
    this.ensureCapacity(8);
    this.view.setFloat64(this.position, value, true);
    this.position += 8;
  }

  // Write 16-bit half-precision float (little-endian)
// @param {number} value - 32-bit float to convert and write
  writeF16(value) {
    this.writeU16(floatToHalf(value));
  }

  // Write raw bytes
// @param {Uint8Array|ArrayBuffer} bytes
  writeBytes(bytes) {
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    this.ensureCapacity(data.length);
    this.u8.set(data, this.position);
    this.position += data.length;
  }

  // Write null-terminated string (ASCII/UTF-8)
// @param {string} str
  writeNullTerminatedString(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.writeBytes(bytes);
    this.writeU8(0); // Null terminator
  }

  // Write fixed-length string (padded with nulls if shorter)
// @param {string} str
// @param {number} length
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

  // Write string with length prefix (u32)
// @param {string} str
  writeLengthPrefixedString(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.writeU32(bytes.length);
    this.writeBytes(bytes);
  }

  // Get current write position
// @returns {number}
  getPosition() {
    return this.position;
  }

  // Set write position (for patching values later)
// @param {number} pos
  setPosition(pos) {
    if (pos < 0 || pos > this.buffer.byteLength) {
      throw new RangeError(`Position ${pos} out of bounds`);
    }
    this.position = pos;
  }

  // Write a value at a specific position without changing current position
// @param {number} pos - Position to write at
// @param {(writer: BinaryWriter) => void} writeFn - Function to perform the write
  patchAt(pos, writeFn) {
    const savedPosition = this.position;
    this.position = pos;
    writeFn(this);
    this.position = savedPosition;
  }

  // Reserve space and return the position for later patching
// @param {number} bytes - Number of bytes to reserve
// @returns {number} - Position of reserved space
  reserve(bytes) {
    const pos = this.position;
    this.ensureCapacity(bytes);
    this.position += bytes;
    return pos;
  }

  // Get the written data as an ArrayBuffer
// @returns {ArrayBuffer}
  toArrayBuffer() {
    return this.buffer.slice(0, this.position);
  }

  // Get the written data as a Uint8Array
// @returns {Uint8Array}
  toUint8Array() {
    return new Uint8Array(this.buffer, 0, this.position);
  }

  // Get the current byte length of written data
// @returns {number}
  get byteLength() {
    return this.position;
  }
}
