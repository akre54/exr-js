// Platform-independent zlib wrapper
// Uses Node.js zlib in Node environments, pako in browsers.
// Handles module loading properly to avoid browser compatibility issues.

import { isNode } from './platform.js';
import { createRequire } from 'module';

let _zlib = null;
let _initialized = false;

/**
 * Initialize Node.js zlib module synchronously using require
 */
function initNodeZlib() {
  if (_initialized) return;
  _initialized = true;

  if (isNode) {
    try {
      // Use createRequire to load zlib synchronously in ES modules
      const require = createRequire(import.meta.url);
      const nodeZlib = require('zlib');
      _zlib = {
        deflate: (data, level) => nodeZlib.deflateSync(Buffer.from(data), { level }),
        inflate: (data) => nodeZlib.inflateSync(Buffer.from(data))
      };
    } catch (e) {
      // zlib not available
    }
  }
}

// Get the zlib implementation for the current environment.
// Returns an object with deflate/inflate methods, or null if unavailable.
// @returns {{ deflate: (data: Uint8Array, level: number) => Uint8Array, inflate: (data: Uint8Array) => Uint8Array } | null}
export function getZlib() {
  // Initialize Node.js zlib if needed
  if (!_initialized) {
    initNodeZlib();
  }

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
