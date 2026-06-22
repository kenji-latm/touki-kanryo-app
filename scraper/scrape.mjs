// 東京法務局・不動産（権利）／商業・法人登記の完了予定日スクレイパ
// 出力: ../app/data/kanryo.json
// 仕様: 申請日 -> 完了予定日。AM/PMは無視し、同一申請日の遅い方を採用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "app", "data", "kanryo.json");
const BASE = "https://houmukyoku.moj.go.jp/tokyo/static/";
const INDEX = "https://houmukyoku.moj.go.jp/tokyo/category_00019.html";
const TYPES = [
  { id: "realEstate", label: "不動産（権利）", column: 1 },
  { id: "commercial", label: "商業・法人", column: 3 },
];

const dec = (buf) => new TextDecoder("shift_jis").decode(buf);

async function getBuf(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 touki-kanryo-app" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function rowsOf(html) {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
}
function cellsOf(tr) {
  return [...tr.matchAll(/<td[\s\S]*?<\/td>/gi)].map((td) =>
    td[0].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  );
}

// "令和8年" を西暦へ
function reiwaToYear(html) {
  const m = html.match(/令和(\d+)年/);
  return m ? 2018 + Number(m[1]) : new Date().getFullYear();
}

// "6月11日（木）AM" -> { mm, dd, ampm }
const DATE_RE = /(\d{1,2})月(\d{1,2})日(?:（.?）)?\s*(AM|PM)?/;
function parseMD(s) {
  const m = s.match(DATE_RE);
  if (!m) return null;
  return { mm: Number(m[1]), dd: Number(m[2]), ampm: m[3] || null };
}
const iso = (y, mm, dd) => `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

function parseDetail(html, stores) {
  const baseYear = reiwaToYear(html);
  const rows = rowsOf(html).map(cellsOf);
  let currentOffice = null;
  let inTable = false;

  for (const raw of rows) {
    const cells = raw.filter((x) => x !== "");
    if (cells.length === 0) continue;

    // 庁名候補（単独セルで「局/支局/出張所/部門」を含む）
    if (
      cells.length === 1 &&
      /(支局|出張所|部門|本局)/.test(cells[0]) &&
      !/クリック|戻る|ご覧/.test(cells[0])
    ) {
      currentOffice = cells[0].replace(/\s/g, "");
      inTable = false;
      continue;
    }
    if (raw[0] === "申請日") { inTable = true; continue; }
    if (/^不動産（権利）/.test(cells[0])) continue;
    if (!inTable || !currentOffice) continue;

    const applied = parseMD(raw[0] || "");
    if (!applied || !raw[0].includes("月")) {
      if (/^（注）|確認方法|庁選択/.test(cells[0])) inTable = false;
      continue;
    }

    const applyISO = iso(baseYear, applied.mm, applied.dd);
    // 列: [申請日, 不動産（権利）, 不動産（表示）, 商業・法人]
    // 空欄を除くと列位置がずれるため、raw の固定列を参照する。
    for (const type of TYPES) {
      const completed = parseMD(raw[type.column] || "");
      if (!completed) continue;
      const completeYear = completed.mm < applied.mm ? baseYear + 1 : baseYear;
      const completeISO = iso(completeYear, completed.mm, completed.dd);
      const office = (stores[type.id][currentOffice] ||= {});
      // 同一申請日でAM/PMの遅い方を採用
      if (!office[applyISO] || completeISO > office[applyISO]) office[applyISO] = completeISO;
    }
  }
}

async function main() {
  console.log("インデックス取得中…");
  const idx = dec(await getBuf(INDEX));
  const links = [...idx.matchAll(/href="([^"]*kanryoyotei[^"]*\.html?)"/gi)]
    .map((m) => m[1])
    .map((h) => (h.startsWith("http") ? h : BASE + h.replace(/^.*\//, "")));
  const uniq = [...new Set(links)];
  console.log(`完了予定日ページ ${uniq.length} 件`);
  if (uniq.length === 0) {
    throw new Error("完了予定日ページが見つかりません。法務局サイトの構成変更を確認してください。");
  }

  const stores = Object.fromEntries(TYPES.map((type) => [type.id, {}]));
  let fetched = 0;
  for (const url of uniq) {
    try {
      const html = dec(await getBuf(url));
      parseDetail(html, stores);
      fetched++;
      process.stdout.write(".");
    } catch (e) {
      console.error("\n失敗:", url, e.message);
    }
  }
  console.log("");

  const data = {};
  const officesByType = {};
  const totals = {};
  for (const type of TYPES) {
    const offices = Object.keys(stores[type.id]).sort();
    officesByType[type.id] = offices;
    data[type.id] = {};
    for (const office of offices) {
      data[type.id][office] = Object.fromEntries(
        Object.entries(stores[type.id][office]).sort(([a], [b]) => a.localeCompare(b))
      );
    }
    totals[type.id] = offices.reduce(
      (n, office) => n + Object.keys(data[type.id][office]).length,
      0
    );
    if (fetched === 0 || offices.length < 10 || totals[type.id] < 50) {
      throw new Error(
        `${type.label}の取得結果が少なすぎるため更新を中止しました` +
        `（成功ページ: ${fetched}、庁数: ${offices.length}、申請日: ${totals[type.id]}）。`
      );
    }
  }

  const out = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: "東京法務局 登記完了予定日",
    sourceUrl: INDEX,
    note: "AM/PMは区別せず、同一申請日の遅い方の完了予定日を採用。",
    types: TYPES.map(({ id, label }) => ({ id, label })),
    officesByType,
    data,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
  const JSOUT = OUT.replace(/\.json$/, ".js");
  fs.writeFileSync(JSOUT, "window.KANRYO_DATA = " + JSON.stringify(out) + ";\n", "utf8");

  console.log(`出力: ${OUT}`);
  for (const type of TYPES) {
    console.log(
      `${type.label}: 庁数 ${officesByType[type.id].length} / 申請日エントリ ${totals[type.id]}`
    );
  }
}

main();