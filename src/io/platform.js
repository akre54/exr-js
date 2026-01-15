/**
 * Platform detection and cross-platform utilities
 */

/** Detect Node.js environment */
export const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

/** Detect browser environment */
export const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

/** Detect Web Worker environment */
export const isWebWorker =
  typeof self !== 'undefined' &&
  typeof self.postMessage === 'function' &&
  !isBrowser;

/**
 * Write ArrayBuffer to file
 * - Node.js: Writes to filesystem
 * - Browser: Triggers download
 * @param {ArrayBuffer} buffer
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function writeToFile(buffer, filename) {
  if (isNode) {
    const fs = await import('fs/promises');
    await fs.writeFile(filename, new Uint8Array(buffer));
  } else if (isBrowser) {
    downloadBlob(buffer, filename);
  } else {
    throw new Error('writeToFile not supported in this environment');
  }
}

/**
 * Trigger a browser download
 * @param {ArrayBuffer} buffer
 * @param {string} filename
 */
function downloadBlob(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Get the native endianness of the platform
 * @returns {'little' | 'big'}
 */
export function getNativeEndianness() {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setInt16(0, 256, true);
  return new Int16Array(buffer)[0] === 256 ? 'little' : 'big';
}

/** True if native byte order is little-endian */
export const isLittleEndian = getNativeEndianness() === 'little';
