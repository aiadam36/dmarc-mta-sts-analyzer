'use strict';

/**
 * Minimal ZIP reader using only Node.js built-ins.
 * Supports DEFLATE (method 8) and stored (method 0) entries.
 */
const zlib = require('zlib');

function readUInt16LE(buf, offset) { return buf.readUInt16LE(offset); }
function readUInt32LE(buf, offset) { return buf.readUInt32LE(offset); }

/**
 * Extract first entry matching the predicate from a ZIP buffer.
 * Returns the entry content as a Buffer, or null.
 */
function extractFirst(zipBuf, predicate) {
  const sig = 0x04034b50; // Local file header signature
  let offset = 0;

  while (offset < zipBuf.length - 30) {
    if (readUInt32LE(zipBuf, offset) !== sig) break;

    const method      = readUInt16LE(zipBuf, offset + 8);
    const compSize    = readUInt32LE(zipBuf, offset + 18);
    const uncompSize  = readUInt32LE(zipBuf, offset + 22);
    const fnLen       = readUInt16LE(zipBuf, offset + 26);
    const extraLen    = readUInt16LE(zipBuf, offset + 28);
    const fnStart     = offset + 30;
    const dataStart   = fnStart + fnLen + extraLen;
    const filename    = zipBuf.slice(fnStart, fnStart + fnLen).toString('utf8');

    if (predicate(filename)) {
      const compData = zipBuf.slice(dataStart, dataStart + compSize);
      if (method === 0) return compData;
      if (method === 8) return zlib.inflateRawSync(compData, { maxOutputLength: 50 * 1024 * 1024 });
      throw new Error(`Unsupported ZIP compression method: ${method} for ${filename}`);
    }

    offset = dataStart + compSize;
  }
  return null;
}

module.exports = { extractFirst };
