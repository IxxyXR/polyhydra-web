import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'blender_addon');   // permanent source files
const TMP_DIR    = path.join(ROOT, '_blender_tmp');    // vite build output (deleted after)
const OUTPUT     = path.join(ROOT, 'polyhydra-blender-addon.zip');

// CRC32
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c >>> 0;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

function dosDateTime() {
  const d = new Date();
  return {
    time: (d.getSeconds() >> 1) | (d.getMinutes() << 5) | (d.getHours() << 11),
    date: d.getDate() | ((d.getMonth() + 1) << 5) | ((Math.max(1980, d.getFullYear()) - 1980) << 9),
  };
}

function walkDir(dir, base = '') {
  const results = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) {
      results.push(...walkDir(full, rel));
    } else {
      results.push({ full, zipPath: `blender_addon/${rel}` });
    }
  }
  return results;
}

// Source files (blender_addon/__init__.py etc.) + built web files (_blender_tmp/web/...)
// Both are placed under blender_addon/ in the zip.
const files = [
  ...walkDir(SOURCE_DIR),
  ...walkDir(TMP_DIR),
];

const { time: dosTime, date: dosDate } = dosDateTime();
const localParts = [];
const centralParts = [];
let offset = 0;

for (const { full, zipPath } of files) {
  const raw = fs.readFileSync(full);
  const deflated = zlib.deflateRawSync(raw, { level: 6 });
  const useDeflate = deflated.length < raw.length;
  const data = useDeflate ? deflated : raw;
  const crc = crc32(raw);
  const name = Buffer.from(zipPath, 'utf8');

  const local = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0),
    u16(useDeflate ? 8 : 0), u16(dosTime), u16(dosDate),
    u32(crc), u32(data.length), u32(raw.length),
    u16(name.length), u16(0),
    name,
  ]);

  const central = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0),
    u16(useDeflate ? 8 : 0), u16(dosTime), u16(dosDate),
    u32(crc), u32(data.length), u32(raw.length),
    u16(name.length), u16(0), u16(0), u16(0), u16(0),
    u32(0), u32(offset),
    name,
  ]);

  localParts.push(local, data);
  centralParts.push(central);
  offset += local.length + data.length;
}

const centralDir = Buffer.concat(centralParts);
const eocd = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0),
  u16(files.length), u16(files.length),
  u32(centralDir.length), u32(offset),
  u16(0),
]);

fs.writeFileSync(OUTPUT, Buffer.concat([...localParts, centralDir, eocd]));

fs.rmSync(TMP_DIR, { recursive: true });

console.log(`${path.basename(OUTPUT)}  (${files.length} files, ${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB)`);
