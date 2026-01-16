/**
 * Meta module - EXR file metadata, headers, and attributes
 */

import { BinaryWriter } from '../io/binary-writer.js';
import { MAGIC_NUMBER, EXR_VERSION, VersionFlags } from '../core/constants.js';
import { Header, writeHeaders } from './header.js';

export * from './attributes.js';
export * from './header.js';
export * from './read-attributes.js';
export * from './read-header.js';

/**
 * Requirements flags for the file
 */
export class Requirements {
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
export class MetaData {
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
export class OffsetTable {
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
