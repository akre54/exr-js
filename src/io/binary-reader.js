/**
 * Little-endian binary reader for parsing EXR files
 */

import { halfToFloat } from '../lib/half.js';

/**
 * Binary reader for parsing EXR files
 * All multi-byte values are read in little-endian format
 */
export class BinaryReader {
  /**
   * @param {ArrayBuffer|Uint8Array} buffer - Buffer to read from
   */
  constructor(buffer) {
    if (buffer instanceof Uint8Array) {
      this.buffer = buffer.buffer;
      this.byteOffset = buffer.byteOffset;
      this.byteLength = buffer.byteLength;
    } else {
      this.buffer = buffer;
      this.byteOffset = 0;
      this.byteLength = buffer.byteLength;
    }
    this.view = new DataView(this.buffer, this.byteOffset, this.byteLength);
    this.u8 = new Uint8Array(this.buffer, this.byteOffset, this.byteLength);
    this.position = 0;
  }

  /**
   * Check if there are enough bytes remaining
   * @param {number} count - Number of bytes needed
   */
  checkBounds(count) {
    if (this.position + count > this.byteLength) {
      throw new RangeError(
        `Cannot read ${count} bytes at position ${this.position}, only ${this.byteLength - this.position} bytes remaining`
      );
    }
  }

  /**
   * Read unsigned 8-bit integer
   * @returns {number}
   */
  readU8() {
    this.checkBounds(1);
    return this.u8[this.position++];
  }

  /**
   * Read signed 8-bit integer
   * @returns {number}
   */
  readI8() {
    this.checkBounds(1);
    return this.view.getInt8(this.position++);
  }

  /**
   * Read unsigned 16-bit integer (little-endian)
   * @returns {number}
   */
  readU16() {
    this.checkBounds(2);
    const value = this.view.getUint16(this.position, true);
    this.position += 2;
    return value;
  }

  /**
   * Read signed 16-bit integer (little-endian)
   * @returns {number}
   */
  readI16() {
    this.checkBounds(2);
    const value = this.view.getInt16(this.position, true);
    this.position += 2;
    return value;
  }

  /**
   * Read unsigned 32-bit integer (little-endian)
   * @returns {number}
   */
  readU32() {
    this.checkBounds(4);
    const value = this.view.getUint32(this.position, true);
    this.position += 4;
    return value;
  }

  /**
   * Read signed 32-bit integer (little-endian)
   * @returns {number}
   */
  readI32() {
    this.checkBounds(4);
    const value = this.view.getInt32(this.position, true);
    this.position += 4;
    return value;
  }

  /**
   * Read unsigned 64-bit integer (little-endian)
   * @returns {bigint}
   */
  readU64() {
    this.checkBounds(8);
    const value = this.view.getBigUint64(this.position, true);
    this.position += 8;
    return value;
  }

  /**
   * Read signed 64-bit integer (little-endian)
   * @returns {bigint}
   */
  readI64() {
    this.checkBounds(8);
    const value = this.view.getBigInt64(this.position, true);
    this.position += 8;
    return value;
  }

  /**
   * Read 32-bit float (little-endian)
   * @returns {number}
   */
  readF32() {
    this.checkBounds(4);
    const value = this.view.getFloat32(this.position, true);
    this.position += 4;
    return value;
  }

  /**
   * Read 64-bit float (little-endian)
   * @returns {number}
   */
  readF64() {
    this.checkBounds(8);
    const value = this.view.getFloat64(this.position, true);
    this.position += 8;
    return value;
  }

  /**
   * Read 16-bit half-precision float (little-endian)
   * @returns {number} - 32-bit float value
   */
  readF16() {
    return halfToFloat(this.readU16());
  }

  /**
   * Read raw bytes
   * @param {number} count - Number of bytes to read
   * @returns {Uint8Array}
   */
  readBytes(count) {
    this.checkBounds(count);
    const bytes = this.u8.slice(this.position, this.position + count);
    this.position += count;
    return bytes;
  }

  /**
   * Read raw bytes as a view (no copy)
   * @param {number} count - Number of bytes to read
   * @returns {Uint8Array}
   */
  readBytesView(count) {
    this.checkBounds(count);
    const bytes = this.u8.subarray(this.position, this.position + count);
    this.position += count;
    return bytes;
  }

  /**
   * Read null-terminated string (ASCII/UTF-8)
   * @returns {string}
   */
  readNullTerminatedString() {
    const start = this.position;
    while (this.position < this.byteLength && this.u8[this.position] !== 0) {
      this.position++;
    }
    const bytes = this.u8.subarray(start, this.position);
    if (this.position < this.byteLength) {
      this.position++; // Skip null terminator
    }
    return new TextDecoder().decode(bytes);
  }

  /**
   * Read fixed-length string
   * @param {number} length - Number of bytes to read
   * @returns {string}
   */
  readFixedString(length) {
    this.checkBounds(length);
    const bytes = this.u8.subarray(this.position, this.position + length);
    this.position += length;
    // Find null terminator if present
    let end = bytes.length;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) {
        end = i;
        break;
      }
    }
    return new TextDecoder().decode(bytes.subarray(0, end));
  }

  /**
   * Read string with length prefix (i32)
   * @returns {string}
   */
  readLengthPrefixedString() {
    const length = this.readI32();
    if (length < 0) {
      throw new Error(`Invalid string length: ${length}`);
    }
    this.checkBounds(length);
    const bytes = this.u8.subarray(this.position, this.position + length);
    this.position += length;
    return new TextDecoder().decode(bytes);
  }

  /**
   * Peek unsigned 8-bit integer without advancing position
   * @returns {number}
   */
  peekU8() {
    this.checkBounds(1);
    return this.u8[this.position];
  }

  /**
   * Peek unsigned 32-bit integer without advancing position
   * @returns {number}
   */
  peekU32() {
    this.checkBounds(4);
    return this.view.getUint32(this.position, true);
  }

  /**
   * Get current read position
   * @returns {number}
   */
  getPosition() {
    return this.position;
  }

  /**
   * Set read position
   * @param {number} pos
   */
  setPosition(pos) {
    if (pos < 0 || pos > this.byteLength) {
      throw new RangeError(`Position ${pos} out of bounds (0-${this.byteLength})`);
    }
    this.position = pos;
  }

  /**
   * Skip bytes
   * @param {number} count
   */
  skip(count) {
    this.checkBounds(count);
    this.position += count;
  }

  /**
   * Get number of bytes remaining
   * @returns {number}
   */
  remaining() {
    return this.byteLength - this.position;
  }

  /**
   * Check if there are more bytes to read
   * @returns {boolean}
   */
  hasRemaining() {
    return this.position < this.byteLength;
  }

  /**
   * Check if at end of buffer
   * @returns {boolean}
   */
  isAtEnd() {
    return this.position >= this.byteLength;
  }

  /**
   * Create a sub-reader for a portion of the buffer
   * @param {number} length - Length of sub-buffer
   * @returns {BinaryReader}
   */
  subReader(length) {
    this.checkBounds(length);
    const subBuffer = this.u8.subarray(this.position, this.position + length);
    this.position += length;
    return new BinaryReader(subBuffer);
  }
}
