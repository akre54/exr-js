// 16-bit Huffman compression and decompression for PIZ
// Huffman compression and decompression routines written
// by Christian Rouet for his PIZ image file format.

const ENCODE_BITS = 16; // literal (value) bit length
const DECODE_BITS = 14; // decoding bit size (>= 8)

const ENCODING_TABLE_SIZE = (1 << ENCODE_BITS) + 1; // 65537
const DECODING_TABLE_SIZE = 1 << DECODE_BITS; // 16384
const DECODE_MASK = DECODING_TABLE_SIZE - 1;

const SHORT_ZEROCODE_RUN = 59;
const LONG_ZEROCODE_RUN = 63;
const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;
const LONGEST_LONG_RUN = 255 + SHORTEST_LONG_RUN;

// Get the code length from an encoding table entry
// @param {number} code
// @returns {number}
function codeLength(code) {
  return code & 63;
}

// Get the Huffman code from an encoding table entry
// @param {number} code
// @returns {number}
function codeValue(code) {
  return code >>> 6;
}

// Compress u16 data using Huffman coding
// @param {Uint16Array} uncompressed - Data to compress
// @returns {Uint8Array} - Compressed data
export function huffmanCompress(uncompressed) {
  if (uncompressed.length === 0) {
    return new Uint8Array(0);
  }

  // Count frequencies
  const frequencies = new Array(ENCODING_TABLE_SIZE).fill(0);
  for (let i = 0; i < uncompressed.length; i++) {
    frequencies[uncompressed[i]]++;
  }

  // Build encoding table
  const { minCodeIndex, maxCodeIndex } = buildEncodingTable(frequencies);

  // Allocate output buffer (estimate: at most input size + header)
  const output = [];

  // Write header placeholders (we'll fill these in later)
  // minCodeIndex (4 bytes)
  // maxCodeIndex (4 bytes)
  // tableSize (4 bytes)
  // bitCount (4 bytes)
  // padding (4 bytes)
  const headerStart = 0;
  for (let i = 0; i < 20; i++) {
    output.push(0);
  }

  const tableStart = output.length;

  // Pack encoding table
  packEncodingTable(frequencies, minCodeIndex, maxCodeIndex, output);

  const dataStart = output.length;

  // Encode data
  const bitCount = encodeWithFrequencies(
    frequencies,
    uncompressed,
    maxCodeIndex,
    output
  );

  // Write header
  const tableLength = dataStart - tableStart;
  writeU32LE(output, 0, minCodeIndex);
  writeU32LE(output, 4, maxCodeIndex);
  writeU32LE(output, 8, tableLength);
  writeU32LE(output, 12, bitCount);
  writeU32LE(output, 16, 0); // padding

  return new Uint8Array(output);
}

// Decompress Huffman-coded data
// @param {Uint8Array} compressed - Compressed data
// @param {number} expectedSize - Expected number of u16 values
// @returns {Uint16Array} - Decompressed data
export function huffmanDecompress(compressed, expectedSize) {
  if (compressed.length === 0) {
    return new Uint16Array(0);
  }

  let offset = 0;

  // Read header
  const minCodeIndex = readU32LE(compressed, offset);
  offset += 4;
  const maxCodeIndex = readU32LE(compressed, offset);
  offset += 4;
  const tableSize = readU32LE(compressed, offset);
  offset += 4;
  const bitCount = readU32LE(compressed, offset);
  offset += 4;
  offset += 4; // skip padding

  if (minCodeIndex >= ENCODING_TABLE_SIZE || maxCodeIndex >= ENCODING_TABLE_SIZE) {
    throw new Error('Invalid Huffman table size');
  }

  // Read and build encoding table
  const { encodingTable, bytesRead } = readEncodingTable(
    compressed,
    offset,
    minCodeIndex,
    maxCodeIndex
  );
  offset += bytesRead;

  // Build decoding table
  const decodingTable = buildDecodingTable(
    encodingTable,
    minCodeIndex,
    maxCodeIndex
  );

  // Decode data
  const result = decodeWithTables(
    encodingTable,
    decodingTable,
    compressed.subarray(offset),
    bitCount,
    maxCodeIndex,
    expectedSize
  );

  return result;
}

// Write a little-endian u32 to an array
function writeU32LE(arr, offset, value) {
  arr[offset] = value & 0xff;
  arr[offset + 1] = (value >>> 8) & 0xff;
  arr[offset + 2] = (value >>> 16) & 0xff;
  arr[offset + 3] = (value >>> 24) & 0xff;
}

// Read a little-endian u32 from a buffer
function readU32LE(buf, offset) {
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  ) >>> 0;
}

// Build a canonical Huffman encoding table from frequency counts
function buildEncodingTable(frequencies) {
  // Find min and max non-zero indices
  let minCodeIndex = frequencies.findIndex((f) => f !== 0);
  if (minCodeIndex === -1) minCodeIndex = 0;

  let maxCodeIndex = 0;
  let frequencyCount = 0;

  // Build heap of (position, frequency) pairs
  const heap = [];
  for (let i = minCodeIndex; i < ENCODING_TABLE_SIZE; i++) {
    if (frequencies[i] !== 0) {
      heap.push({ position: i, frequency: frequencies[i] });
      maxCodeIndex = i;
      frequencyCount++;
    }
  }

  // Add pseudo-symbol for run-length encoding
  maxCodeIndex++;
  frequencies[maxCodeIndex] = 1;
  heap.push({ position: maxCodeIndex, frequency: 1 });
  frequencyCount++;

  // Build min-heap
  const heapCmp = (a, b) => {
    if (a.frequency !== b.frequency) return a.frequency - b.frequency;
    return a.position - b.position;
  };
  heap.sort(heapCmp);

  // Build code lengths using Huffman algorithm
  const sCode = new Array(ENCODING_TABLE_SIZE).fill(0);
  const links = new Array(ENCODING_TABLE_SIZE);
  for (let i = 0; i < ENCODING_TABLE_SIZE; i++) {
    links[i] = i;
  }

  while (frequencyCount > 1) {
    // Pop smallest
    const smallest = heap.shift();
    frequencyCount--;

    // Add to second smallest
    heap[0].frequency += smallest.frequency;
    const highPos = heap[0].position;
    const lowPos = smallest.position;

    // Re-sort heap
    heap.sort(heapCmp);

    // Update code lengths and links
    let idx = highPos;
    while (true) {
      sCode[idx]++;
      if (links[idx] === idx) {
        links[idx] = lowPos;
        break;
      }
      idx = links[idx];
    }

    idx = lowPos;
    while (true) {
      sCode[idx]++;
      if (links[idx] === idx) {
        break;
      }
      idx = links[idx];
    }
  }

  // Build canonical codes
  buildCanonicalTable(sCode);

  // Copy to frequencies
  for (let i = 0; i < ENCODING_TABLE_SIZE; i++) {
    frequencies[i] = sCode[i];
  }

  return { minCodeIndex, maxCodeIndex };
}

// Build canonical Huffman code table
function buildCanonicalTable(codeTable) {
  const countPerCode = new Array(59).fill(0);

  for (let i = 0; i < codeTable.length; i++) {
    if (codeTable[i] < 59) {
      countPerCode[codeTable[i]]++;
    }
  }

  // Compute numerically lowest code for each length
  let code = 0;
  for (let i = 58; i >= 0; i--) {
    const nextCode = (code + countPerCode[i]) >>> 1;
    countPerCode[i] = code;
    code = nextCode;
  }

  // Assign codes
  for (let i = 0; i < codeTable.length; i++) {
    const length = codeTable[i];
    if (length > 0 && length < 59) {
      codeTable[i] = length | (countPerCode[length] << 6);
      countPerCode[length]++;
    }
  }
}

// Pack encoding table with run-length compression of zeros
function packEncodingTable(frequencies, minIndex, maxIndex, output) {
  let codeBits = 0;
  let codeBitCount = 0;

  let i = minIndex;
  while (i <= maxIndex) {
    const len = codeLength(frequencies[i]);

    if (len === 0) {
      // Count zero run
      let zeroRun = 1;
      while (i < maxIndex && zeroRun < LONGEST_LONG_RUN) {
        if (codeLength(frequencies[i + 1]) > 0) break;
        i++;
        zeroRun++;
      }

      if (zeroRun >= 2) {
        if (zeroRun >= SHORTEST_LONG_RUN) {
          writeBits(6, LONG_ZEROCODE_RUN, output, { codeBits, codeBitCount });
          codeBits = output._codeBits;
          codeBitCount = output._codeBitCount;
          writeBits(8, zeroRun - SHORTEST_LONG_RUN, output, {
            codeBits,
            codeBitCount,
          });
          codeBits = output._codeBits;
          codeBitCount = output._codeBitCount;
        } else {
          writeBits(6, SHORT_ZEROCODE_RUN + zeroRun - 2, output, {
            codeBits,
            codeBitCount,
          });
          codeBits = output._codeBits;
          codeBitCount = output._codeBitCount;
        }
        i++;
        continue;
      }
    }

    writeBits(6, len, output, { codeBits, codeBitCount });
    codeBits = output._codeBits;
    codeBitCount = output._codeBitCount;
    i++;
  }

  // Flush remaining bits
  if (codeBitCount > 0) {
    output.push((codeBits << (8 - codeBitCount)) & 0xff);
  }

  // Clean up temporary state
  delete output._codeBits;
  delete output._codeBitCount;
}

// Helper to write bits to output
function writeBits(count, bits, output, state) {
  let codeBits = state.codeBits;
  let codeBitCount = state.codeBitCount;

  codeBits = ((codeBits << count) | bits) >>> 0;
  codeBitCount += count;

  while (codeBitCount >= 8) {
    codeBitCount -= 8;
    output.push((codeBits >>> codeBitCount) & 0xff);
  }

  output._codeBits = codeBits;
  output._codeBitCount = codeBitCount;
}

// Encode data using the frequency table
function encodeWithFrequencies(frequencies, uncompressed, runLengthCode, output) {
  let codeBits = 0;
  let codeBitCount = 0;
  const startLen = output.length;

  let runStartValue = uncompressed[0];
  let runLength = 0;

  for (let i = 1; i < uncompressed.length; i++) {
    const currentValue = uncompressed[i];

    if (runStartValue === currentValue && runLength < 255) {
      runLength++;
    } else {
      sendCode(
        frequencies[runStartValue],
        runLength,
        frequencies[runLengthCode],
        output,
        { codeBits, codeBitCount }
      );
      codeBits = output._codeBits;
      codeBitCount = output._codeBitCount;
      runLength = 0;
    }

    runStartValue = currentValue;
  }

  // Send remaining
  sendCode(
    frequencies[runStartValue],
    runLength,
    frequencies[runLengthCode],
    output,
    { codeBits, codeBitCount }
  );
  codeBits = output._codeBits;
  codeBitCount = output._codeBitCount;

  const dataLength = output.length - startLen;

  // Flush remaining bits
  if (codeBitCount > 0) {
    output.push((codeBits << (8 - codeBitCount)) & 0xff);
  }

  delete output._codeBits;
  delete output._codeBitCount;

  return dataLength * 8 + codeBitCount;
}

// Send a code with optional run-length encoding
function sendCode(sCode, runCount, runCode, output, state) {
  const sLen = codeLength(sCode);
  const runLen = codeLength(runCode);

  // Use RLE if it's shorter
  if (sLen + runLen + 8 < sLen * (runCount + 1)) {
    writeCode(sCode, output, state);
    writeCode(runCode, output, state);
    writeBits(8, runCount, output, state);
  } else {
    for (let i = 0; i <= runCount; i++) {
      writeCode(sCode, output, state);
    }
  }
}

// Write a Huffman code
function writeCode(sCode, output, state) {
  writeBits(codeLength(sCode), codeValue(sCode), output, state);
}

// Read encoding table from compressed data
function readEncodingTable(data, startOffset, minCodeIndex, maxCodeIndex) {
  const encodingTable = new Array(ENCODING_TABLE_SIZE).fill(0);

  let offset = startOffset;
  let codeBits = 0;
  let codeBitCount = 0;

  let codeIndex = minCodeIndex;
  while (codeIndex <= maxCodeIndex) {
    // Read 6 bits for code length
    while (codeBitCount < 6 && offset < data.length) {
      codeBits = ((codeBits << 8) | data[offset]) >>> 0;
      codeBitCount += 8;
      offset++;
    }

    codeBitCount -= 6;
    const codeLen = (codeBits >>> codeBitCount) & 63;

    if (codeLen === LONG_ZEROCODE_RUN) {
      // Read 8 more bits for run length
      while (codeBitCount < 8 && offset < data.length) {
        codeBits = ((codeBits << 8) | data[offset]) >>> 0;
        codeBitCount += 8;
        offset++;
      }
      codeBitCount -= 8;
      const zerun = ((codeBits >>> codeBitCount) & 255) + SHORTEST_LONG_RUN;

      for (let j = 0; j < zerun && codeIndex <= maxCodeIndex; j++) {
        encodingTable[codeIndex++] = 0;
      }
    } else if (codeLen >= SHORT_ZEROCODE_RUN) {
      const duplicationCount = codeLen - SHORT_ZEROCODE_RUN + 2;
      for (let j = 0; j < duplicationCount && codeIndex <= maxCodeIndex; j++) {
        encodingTable[codeIndex++] = 0;
      }
    } else {
      encodingTable[codeIndex++] = codeLen;
    }
  }

  // Build canonical codes
  buildCanonicalTable(encodingTable);

  return { encodingTable, bytesRead: offset - startOffset };
}

// Build decoding table from encoding table
function buildDecodingTable(encodingTable, minCodeIndex, maxCodeIndex) {
  // Decoding table entry types:
  // { type: 'empty' }
  // { type: 'short', value: number, len: number }
  // { type: 'long', codes: number[] }
  const decodingTable = new Array(DECODING_TABLE_SIZE);
  for (let i = 0; i < DECODING_TABLE_SIZE; i++) {
    decodingTable[i] = { type: 'empty' };
  }

  for (let codeIndex = minCodeIndex; codeIndex <= maxCodeIndex; codeIndex++) {
    const encoded = encodingTable[codeIndex];
    const code = codeValue(encoded);
    const length = codeLength(encoded);

    if (length === 0) continue;

    if (code >>> length !== 0) {
      throw new Error('Invalid Huffman table entry');
    }

    if (length > DECODE_BITS) {
      // Long code
      const idx = code >>> (length - DECODE_BITS);
      const entry = decodingTable[idx];

      if (entry.type === 'empty') {
        decodingTable[idx] = { type: 'long', codes: [codeIndex] };
      } else if (entry.type === 'long') {
        entry.codes.push(codeIndex);
      } else {
        throw new Error('Invalid Huffman table entry');
      }
    } else if (length !== 0) {
      // Short code - fill all matching entries
      const startIndex = code << (DECODE_BITS - length);
      const count = 1 << (DECODE_BITS - length);

      for (let i = 0; i < count; i++) {
        decodingTable[startIndex + i] = {
          type: 'short',
          value: codeIndex,
          len: length,
        };
      }
    }
  }

  return decodingTable;
}

// Decode data using encoding and decoding tables
function decodeWithTables(
  encodingTable,
  decodingTable,
  input,
  inputBitCount,
  runLengthCode,
  expectedOutputSize
) {
  const output = new Uint16Array(expectedOutputSize);
  let outIdx = 0;
  let inputIdx = 0;

  let codeBits = 0;
  let codeBitCount = 0;

  // Main decoding loop
  while (inputIdx < input.length) {
    // Read a byte
    codeBits = ((codeBits << 8) | input[inputIdx]) >>> 0;
    codeBitCount += 8;
    inputIdx++;

    // Decode while we have enough bits
    while (codeBitCount >= DECODE_BITS) {
      const codeIndex = (codeBits >>> (codeBitCount - DECODE_BITS)) & DECODE_MASK;
      const entry = decodingTable[codeIndex];

      if (entry.type === 'short') {
        codeBitCount -= entry.len;

        outIdx = readCodeIntoArray(
          entry.value,
          runLengthCode,
          input,
          { inputIdx, codeBits, codeBitCount },
          output,
          outIdx,
          expectedOutputSize
        );
        inputIdx = input._inputIdx || inputIdx;
        codeBits = input._codeBits || codeBits;
        codeBitCount = input._codeBitCount || codeBitCount;
      } else if (entry.type === 'long') {
        let found = false;

        for (const longCode of entry.codes) {
          const encodedLongCode = encodingTable[longCode];
          const length = codeLength(encodedLongCode);

          // Read more bytes if needed
          while (codeBitCount < length && inputIdx < input.length) {
            codeBits = ((codeBits << 8) | input[inputIdx]) >>> 0;
            codeBitCount += 8;
            inputIdx++;
          }

          if (codeBitCount >= length) {
            const requiredCode =
              (codeBits >>> (codeBitCount - length)) & ((1 << length) - 1);

            if (codeValue(encodedLongCode) === requiredCode) {
              codeBitCount -= length;

              outIdx = readCodeIntoArray(
                longCode,
                runLengthCode,
                input,
                { inputIdx, codeBits, codeBitCount },
                output,
                outIdx,
                expectedOutputSize
              );
              inputIdx = input._inputIdx || inputIdx;
              codeBits = input._codeBits || codeBits;
              codeBitCount = input._codeBitCount || codeBitCount;

              found = true;
              break;
            }
          }
        }

        if (!found) {
          throw new Error('Invalid Huffman code');
        }
      } else {
        throw new Error('Invalid Huffman code');
      }
    }
  }

  // Process remaining bits
  const count = (8 - inputBitCount) & 7;
  codeBits >>>= count;
  codeBitCount -= count;

  while (codeBitCount > 0) {
    const index = (codeBits << (DECODE_BITS - codeBitCount)) & DECODE_MASK;
    const entry = decodingTable[index];

    if (entry.type === 'short') {
      if (entry.len > codeBitCount) break;
      codeBitCount -= entry.len;

      outIdx = readCodeIntoArray(
        entry.value,
        runLengthCode,
        input,
        { inputIdx, codeBits, codeBitCount },
        output,
        outIdx,
        expectedOutputSize
      );
      codeBits = input._codeBits || codeBits;
      codeBitCount = input._codeBitCount || codeBitCount;
    } else {
      break;
    }
  }

  // Clean up
  delete input._inputIdx;
  delete input._codeBits;
  delete input._codeBitCount;

  if (outIdx !== expectedOutputSize) {
    throw new Error(`Huffman decode size mismatch: got ${outIdx}, expected ${expectedOutputSize}`);
  }

  return output;
}

// Read a decoded code into the output array
function readCodeIntoArray(
  code,
  runLengthCode,
  input,
  state,
  output,
  outIdx,
  maxLen
) {
  let { inputIdx, codeBits, codeBitCount } = state;

  if (code === runLengthCode) {
    // Read 8 bits for run count
    while (codeBitCount < 8 && inputIdx < input.length) {
      codeBits = ((codeBits << 8) | input[inputIdx]) >>> 0;
      codeBitCount += 8;
      inputIdx++;
    }

    codeBitCount -= 8;
    const codeRepetitions = (codeBits >>> codeBitCount) & 0xff;

    if (outIdx + codeRepetitions > maxLen) {
      throw new Error('Too much Huffman data');
    }

    if (outIdx === 0) {
      throw new Error('Not enough Huffman data');
    }

    const repeatedCode = output[outIdx - 1];
    for (let i = 0; i < codeRepetitions; i++) {
      output[outIdx++] = repeatedCode;
    }
  } else if (outIdx < maxLen) {
    output[outIdx++] = code;
  } else {
    throw new Error('Too much Huffman data');
  }

  input._inputIdx = inputIdx;
  input._codeBits = codeBits;
  input._codeBitCount = codeBitCount;

  return outIdx;
}
