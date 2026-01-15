/**
 * Platform-independent zlib wrapper
 *
 * Uses Node.js zlib in Node environments, pako in browsers.
 * Handles module loading properly to avoid browser compatibility issues.
 */

import { isNode } from './platform.js';

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
export function getZlib() {
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
