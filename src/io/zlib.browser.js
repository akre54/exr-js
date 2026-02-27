// Browser-safe zlib stub — no node:zlib import.
// Falls back to globalThis.pako if available, otherwise returns null.

let _zlib = null

export function getZlib() {
  if (_zlib) return _zlib

  if (typeof globalThis !== 'undefined' && globalThis.pako) {
    _zlib = {
      deflate: (data, level) => globalThis.pako.deflate(data, { level }),
      inflate: (data) => globalThis.pako.inflate(data),
    }
    return _zlib
  }

  return null
}
