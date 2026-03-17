// Platform-independent zlib wrapper using fflate (synchronous, works in Node and browsers)
import { unzlibSync, zlibSync } from 'fflate'

// Get the zlib implementation.
// Returns an object with deflate/inflate methods.
// @returns {{ deflate: (data: Uint8Array, level: number) => Uint8Array, inflate: (data: Uint8Array) => Uint8Array }}
export function getZlib() {
  return {
    deflate: (data, level) => zlibSync(data, { level }),
    inflate: (data) => unzlibSync(data),
  }
}
