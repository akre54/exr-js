# CLAUDE.md

JavaScript library for writing OpenEXR images. Supports multi-layer/multi-part EXR files, all 8 compression methods, tiled and scanline storage, mip maps, and half-precision floats. Works in Node.js and browsers.

## Commands

```bash
yarn build        # Build with Rollup → dist/
yarn test         # Run tests with Vitest
yarn test:watch   # Run tests in watch mode
yarn bench        # Run benchmarks
```

**Setup needed**: Project requires `rollup.config.js` for build and `vitest.config.js` for tests (test files use plain `.js` extension, not `.test.js`).

## Architecture

```
src/
├── api/          # Public API (writeRgbaFile, writeRgbFile, EXRWriter)
├── compression/  # B44, PIZ, PXR24, ZIP, RLE compression
├── core/         # Types, constants, errors
├── image/        # Image, Layer, Channel structures
├── io/           # Binary writing, platform abstractions
├── lib/          # Half-float utilities
├── meta/         # Encoding, attributes, headers
├── block/        # Block/tile handling
└── index.js      # Main exports

test/             # Vitest test files
docs/             # API.md, COMPRESSION.md, examples/
```

## Code Style

- ES6 modules (type: "module")
- Pure JavaScript, no TypeScript
- Single production dependency: fflate (compression)
- Three-tier API: Simple (writeRgbaFile), Builder (EXRWriter), Advanced (Image/Layer classes)

## Testing

Tests use Vitest. Each test file covers a specific feature:
- `write-simple.js` - Basic image writing
- `write-compressed.js` - Compression methods
- `write-multilayer.js` - Multi-layer EXR
- `write-mipmaps.js` / `write-ripmaps.js` - Mip/rip maps
