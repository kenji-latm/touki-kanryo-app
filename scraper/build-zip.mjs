// dist/ の配布物を1つのZIP(store)にまとめる
// 同梱: はじめにお読みください.txt / touki-kanryo-standalone.html
// 出力: dist/アゲテナ.zip
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
const OUT = path.join(DIST, "アゲテナ.zip");
const GUIDE = path.join(DIST, "はじめにお読みください.txt");
const GUIDE_TEMPLATE = path.join(__dirname, "readme-template.txt");
const DATA = path.join(__dirname, "..", "app", "data", "kanryo.json");

// 案内文は最新データの日付を差し込んで毎回生成する。
const meta = JSON.parse(fs.readFileSync(DATA, "utf8"));
const rawDate = new Date(meta.generatedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
const dataDate = rawDate.replace(/^(\d+)\/(\d+)\/(\d+)$/, "$1年$2月$3日");
const guide = fs.readFileSync(GUIDE_TEMPLATE, "utf8").replace("{{DATA_DATE}}", dataDate);
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(GUIDE, guide, "utf8");

// 同梱ファイル（Zip内の名前, 実ファイル）
const ENTRIES = [
  { name: "はじめにお読みください.txt", file: "はじめにお読みください.txt" },
  { name: "touki-kanryo-standalone.html", file: "touki-kanryo-standalone.html" },
];

const crc32 =
  zlib.crc32 ||
  ((buf) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  });

const d = new Date();
const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

const locals = [];
const centrals = [];
let offset = 0;

for (const e of ENTRIES) {
  const content = fs.readFileSync(path.join(DIST, e.file));
  const nameBuf = Buffer.from(e.name, "utf8");
  const isAscii = /^[\x00-\x7f]*$/.test(e.name);
  const flags = isAscii ? 0 : 0x0800; // bit11: ファイル名がUTF-8
  const crc = crc32(content);
  const size = content.length;

  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(20, 4);
  lfh.writeUInt16LE(flags, 6);
  lfh.writeUInt16LE(0, 8); // store
  lfh.writeUInt16LE(dosTime, 10);
  lfh.writeUInt16LE(dosDate, 12);
  lfh.writeUInt32LE(crc, 14);
  lfh.writeUInt32LE(size, 18);
  lfh.writeUInt32LE(size, 22);
  lfh.writeUInt16LE(nameBuf.length, 26);
  lfh.writeUInt16LE(0, 28);

  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt16LE(20, 4);
  cdh.writeUInt16LE(20, 6);
  cdh.writeUInt16LE(flags, 8);
  cdh.writeUInt16LE(0, 10);
  cdh.writeUInt16LE(dosTime, 12);
  cdh.writeUInt16LE(dosDate, 14);
  cdh.writeUInt32LE(crc, 16);
  cdh.writeUInt32LE(size, 20);
  cdh.writeUInt32LE(size, 24);
  cdh.writeUInt16LE(nameBuf.length, 28);
  cdh.writeUInt16LE(0, 30);
  cdh.writeUInt16LE(0, 32);
  cdh.writeUInt16LE(0, 34);
  cdh.writeUInt16LE(0, 36);
  cdh.writeUInt32LE(0, 38);
  cdh.writeUInt32LE(offset, 42);

  locals.push(lfh, nameBuf, content);
  centrals.push(Buffer.concat([cdh, nameBuf]));
  offset += lfh.length + nameBuf.length + content.length;
}

const localPart = Buffer.concat(locals);
const central = Buffer.concat(centrals);

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(ENTRIES.length, 8);
eocd.writeUInt16LE(ENTRIES.length, 10);
eocd.writeUInt32LE(central.length, 12);
eocd.writeUInt32LE(localPart.length, 16);
eocd.writeUInt16LE(0, 20);

const zip = Buffer.concat([localPart, central, eocd]);
fs.writeFileSync(OUT, zip);

console.log(`出力: ${OUT}`);
console.log(`サイズ: ${Math.round(zip.length / 1024)} KB / 先頭: ${zip.slice(0, 2).toString("ascii")}`);
console.log(`同梱: ${ENTRIES.map((e) => e.name).join(" , ")}`);
