/** Synthetic ZIP bytes for limit tests. Not a user archive. */

function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value & 0xffff);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value >>> 0);
  return out;
}

export interface ZipMemberSpec {
  name: string;
  data: Buffer;
  method?: number;
  flags?: number;
  compressedSize?: number;
  uncompressedSize?: number;
  extra?: Buffer;
}

export function makeZip(files: ZipMemberSpec[], disk = 0): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const extra = file.extra ?? Buffer.alloc(0);
    const method = file.method ?? 0;
    const flags = file.flags ?? 0;
    const compressedSize = file.compressedSize ?? file.data.length;
    const uncompressedSize = file.uncompressedSize ?? file.data.length;
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(0),
      u32(compressedSize), u32(uncompressedSize), u16(name.length), u16(extra.length), name, extra, file.data,
    ]);
    locals.push(local);
    centrals.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(0),
      u32(compressedSize), u32(uncompressedSize), u16(name.length), u16(extra.length), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name, extra,
    ]));
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50), u16(disk), u16(disk), u16(files.length), u16(files.length),
    u32(directory.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...locals, directory, end]);
}
