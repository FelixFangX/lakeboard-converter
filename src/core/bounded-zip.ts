import pako from 'pako';

/** Caps for every zip the readers open. Values are exact; messages quote them. */
export const ARCHIVE_LIMITS = {
  maxArchiveBytes: 32 * 1024 * 1024,
  maxMembers: 1024,
  maxUncompressedBytes: 32 * 1024 * 1024,
  maxNameBytes: 512,
  maxInflateMs: 10_000,
  inflateChunkBytes: 16 * 1024,
} as const;

export class ZipLimitError extends Error {
  /** Inflated bytes retained when the reader stopped. Zero when it stopped before inflate. */
  readonly outputBytes: number;

  constructor(message: string, outputBytes: number) {
    super(message);
    this.name = 'ZipLimitError';
    this.outputBytes = outputBytes;
  }
}

interface ZipMember {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  directory: boolean;
}

export interface ZipArchive {
  names: readonly string[];
  readText(name: string): string;
}

function fail(kind: string, detail: string): ZipLimitError {
  return new ZipLimitError(`Cannot unzip ${kind} file: ${detail}`, 0);
}

function corrupt(kind: string): Error {
  return new Error(`Cannot unzip ${kind} file: it may be corrupt or not a valid ZIP archive.`);
}

function limitMessage(kind: string, detail: string, outputBytes: number): ZipLimitError {
  return new ZipLimitError(`Cannot unzip ${kind} file: ${detail}`, outputBytes);
}

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new RangeError('short');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new RangeError('short');
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readU64(bytes: Uint8Array, offset: number): number {
  const lo = readU32(bytes, offset);
  const hi = readU32(bytes, offset + 4);
  if (hi !== 0) return Number.MAX_SAFE_INTEGER;
  return lo;
}

function findEocd(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (readU32(bytes, offset) !== 0x06054b50) continue;
    const commentLength = readU16(bytes, offset + 20);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  throw new RangeError('eocd');
}

function applyZip64Extra(bytes: Uint8Array, start: number, length: number, member: { compressedSize: number; uncompressedSize: number; localOffset: number }): void {
  let cursor = start;
  const end = start + length;
  while (cursor + 4 <= end) {
    const id = readU16(bytes, cursor);
    const size = readU16(bytes, cursor + 2);
    const value = cursor + 4;
    if (value + size > end) return;
    if (id === 0x0001) {
      let field = value;
      if (member.uncompressedSize === 0xffffffff) {
        member.uncompressedSize = readU64(bytes, field);
        field += 8;
      }
      if (member.compressedSize === 0xffffffff) {
        member.compressedSize = readU64(bytes, field);
        field += 8;
      }
      if (member.localOffset === 0xffffffff) member.localOffset = readU64(bytes, field);
      return;
    }
    cursor = value + size;
  }
}

function normalizeName(name: string): string {
  return name.replaceAll('\\', '/').replace(/^\.\//, '');
}

function inflateLimited(kind: string, compressed: Uint8Array, maxOut: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let kept = 0;
  const started = Date.now();
  const inflator = new pako.Inflate({ raw: true, chunkSize: ARCHIVE_LIMITS.inflateChunkBytes });
  let stop: ZipLimitError | undefined;
  inflator.onData = (chunk) => {
    if (Date.now() - started > ARCHIVE_LIMITS.maxInflateMs) {
      stop = limitMessage(kind, `decompression took longer than ${ARCHIVE_LIMITS.maxInflateMs / 1000} seconds.`, kept);
      throw stop;
    }
    if (kept + chunk.length > maxOut) {
      stop = limitMessage(kind, `inflated data would pass ${ARCHIVE_LIMITS.maxUncompressedBytes / 1024 / 1024} MiB (stopped after ${kept} bytes).`, kept);
      throw stop;
    }
    chunks.push(chunk);
    kept += chunk.length;
  };
  inflator.onEnd = () => {};
  try {
    const finished = inflator.push(compressed, true);
    if (stop) throw stop;
    if (!finished) throw corrupt(kind);
  } catch (error) {
    if (stop) throw stop;
    if (error instanceof ZipLimitError) throw error;
    throw corrupt(kind);
  }
  const out = new Uint8Array(kept);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function readMember(kind: string, bytes: Uint8Array, member: ZipMember, maxOut: number): Uint8Array {
  if ((member.flags & 0x1) !== 0) throw fail(kind, 'encrypted members are not supported.');
  if (member.method !== 0 && member.method !== 8) throw fail(kind, 'a member uses an unsupported compression method.');
  if (member.compressedSize > ARCHIVE_LIMITS.maxArchiveBytes) throw fail(kind, `a member claims more than ${ARCHIVE_LIMITS.maxArchiveBytes / 1024 / 1024} MiB of compressed data.`);
  if (member.localOffset > bytes.length || member.localOffset + 30 > bytes.length) throw corrupt(kind);
  if (readU32(bytes, member.localOffset) !== 0x04034b50) throw corrupt(kind);
  const nameLength = readU16(bytes, member.localOffset + 26);
  const extraLength = readU16(bytes, member.localOffset + 28);
  const start = member.localOffset + 30 + nameLength + extraLength;
  if (start > bytes.length || member.compressedSize > bytes.length - start) throw corrupt(kind);
  const slice = bytes.subarray(start, start + member.compressedSize);
  if (member.method === 0) {
    if (slice.length > maxOut) throw limitMessage(kind, `inflated data would pass ${ARCHIVE_LIMITS.maxUncompressedBytes / 1024 / 1024} MiB (stopped after 0 bytes).`, 0);
    return slice;
  }
  if (slice.length === 0) return new Uint8Array();
  if (member.uncompressedSize > maxOut) throw limitMessage(kind, `inflated data would pass ${ARCHIVE_LIMITS.maxUncompressedBytes / 1024 / 1024} MiB (stopped after 0 bytes).`, 0);
  return inflateLimited(kind, slice, maxOut);
}

/** Read the central directory and inflate only the members the caller asks for. */
export function openZip(buffer: ArrayBuffer | Uint8Array, kind: string): ZipArchive {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length > ARCHIVE_LIMITS.maxArchiveBytes) throw fail(kind, `the archive is larger than ${ARCHIVE_LIMITS.maxArchiveBytes / 1024 / 1024} MiB.`);
  let eocd: number;
  try {
    eocd = findEocd(bytes);
  } catch {
    throw corrupt(kind);
  }
  if (readU16(bytes, eocd + 4) !== 0 || readU16(bytes, eocd + 6) !== 0) throw fail(kind, 'this zip layout is not supported.');
  let records = readU16(bytes, eocd + 10);
  let directorySize = readU32(bytes, eocd + 12);
  let directoryOffset = readU32(bytes, eocd + 16);
  if (records === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    if (eocd < 20 || readU32(bytes, eocd - 20) !== 0x07064b50) throw corrupt(kind);
    const zip64Offset = readU64(bytes, eocd - 12);
    if (zip64Offset > bytes.length || zip64Offset + 56 > bytes.length || readU32(bytes, zip64Offset) !== 0x06064b50) throw corrupt(kind);
    if (readU32(bytes, zip64Offset + 16) !== 0) throw fail(kind, 'this zip layout is not supported.');
    records = readU64(bytes, zip64Offset + 32);
    directorySize = readU64(bytes, zip64Offset + 40);
    directoryOffset = readU64(bytes, zip64Offset + 48);
  }
  if (!Number.isSafeInteger(records) || records > ARCHIVE_LIMITS.maxMembers) throw fail(kind, `it has more than ${ARCHIVE_LIMITS.maxMembers} members.`);
  if (directoryOffset > bytes.length || directorySize > bytes.length - directoryOffset) throw corrupt(kind);
  const directoryEnd = directoryOffset + directorySize;
  const members: ZipMember[] = [];
  let cursor = directoryOffset;
  try {
    for (let index = 0; index < records; index += 1) {
      if (cursor + 46 > directoryEnd || readU32(bytes, cursor) !== 0x02014b50) throw new RangeError('cd');
      const flags = readU16(bytes, cursor + 8);
      const method = readU16(bytes, cursor + 10);
      const member: ZipMember = {
        name: '',
        method,
        flags,
        compressedSize: readU32(bytes, cursor + 20),
        uncompressedSize: readU32(bytes, cursor + 24),
        localOffset: readU32(bytes, cursor + 42),
        directory: false,
      };
      const nameLength = readU16(bytes, cursor + 28);
      const extraLength = readU16(bytes, cursor + 30);
      const commentLength = readU16(bytes, cursor + 32);
      const nameStart = cursor + 46;
      const extraStart = nameStart + nameLength;
      const next = extraStart + extraLength + commentLength;
      if (next > directoryEnd) throw new RangeError('cd');
      if (nameLength > ARCHIVE_LIMITS.maxNameBytes) throw fail(kind, `a member name is longer than ${ARCHIVE_LIMITS.maxNameBytes} bytes.`);
      if (member.uncompressedSize === 0xffffffff || member.compressedSize === 0xffffffff || member.localOffset === 0xffffffff) {
        applyZip64Extra(bytes, extraStart, extraLength, member);
      }
      member.name = normalizeName(new TextDecoder().decode(bytes.subarray(nameStart, extraStart)));
      member.directory = member.name.endsWith('/');
      if (member.name.split('/').includes('..')) throw corrupt(kind);
      members.push(member);
      cursor = next;
    }
  } catch (error) {
    if (error instanceof ZipLimitError) throw error;
    throw corrupt(kind);
  }
  let spent = 0;
  const byName = new Map<string, ZipMember>();
  for (const member of members) if (!member.directory && !byName.has(member.name)) byName.set(member.name, member);
  return {
    names: [...byName.keys()],
    readText(name: string): string {
      const member = byName.get(name);
      if (!member) throw corrupt(kind);
      const remaining = ARCHIVE_LIMITS.maxUncompressedBytes - spent;
      const data = readMember(kind, bytes, member, remaining);
      spent += data.length;
      return new TextDecoder().decode(data);
    },
  };
}
