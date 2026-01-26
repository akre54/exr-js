// Platform-independent zlib wrapper
// Uses Node.js zlib in Node environments, pako in browsers.
// Handles module loading properly to avoid browser compatibility issues.

// Detect Node.js environment
const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null

let _zlib = null

// Start loading Node.js zlib eagerly using dynamic import (but don't await)
// This avoids static imports that would cause Rollup to create global references
// In browsers, this dynamic import will fail gracefully and fall back to pako
// Note: We don't use top-level await to maintain CJS compatibility
if (isNode) {
  import('node:zlib')
    .then((nodeZlib) => {
      _zlib = {
        deflate: (data, level) =>
          nodeZlib.deflateSync(Buffer.from(data), { level }),
        inflate: (data) => nodeZlib.inflateSync(Buffer.from(data)),
      }
    })
    .catch(() => {
      // zlib not available - will fall back to pako in browsers
    })
}

// Get the zlib implementation for the current environment.
// Returns an object with deflate/inflate methods, or null if unavailable.
// @returns {{ deflate: (data: Uint8Array, level: number) => Uint8Array, inflate: (data: Uint8Array) => Uint8Array } | null}
export function getZlib() {
  // Return cached Node.js zlib if available
  if (_zlib) return _zlib

  // Try pako (browser-compatible)
  if (typeof globalThis !== 'undefined' && globalThis.pako) {
    _zlib = {
      deflate: (data, level) => globalThis.pako.deflate(data, { level }),
      inflate: (data) => globalThis.pako.inflate(data),
    }
    return _zlib
  }

  return null
}
