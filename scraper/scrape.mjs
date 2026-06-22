// 東京法務局・不動産（権利）登記の完了予定日スクレイパ
// 出力: ../app/data/kanryo.json
// 仕様: 申請日 -> 完了予定日（不動産（権利）登記）。AM/PMは無視し、同一申請日の遅い方を採用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "app", "data", "kanryo.json");
const BASE = "https://houmukyoku.moj.go.jp/tokyo/static/";
const INDEX = "https://houmukyoku.moj.go.jp/tokyo/category_00019.html";

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

// "6月11日（木）AM" -> { mm, dd, ampm } / 完了側は "7月10日（金）AM" でも可
const DATE_RE = /(\d{1,2})月(\d{1,2})日(?:（.?）)?\s*(AM|PM)?/;
function parseMD(s) {
  const m = s.match(DATE_RE);
  if (!m) return null;
  return { mm: Number(m[1]), dd: Number(m[2]), ampm: m[3] || null };
}
const iso = (y, mm, dd) => `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

function parseDetail(html, store) {
  const baseYear = reiwaToYear(html);
  const rows = rowsOf(html).map(cellsOf);
  let currentOffice = null;
  let inTable = false;

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].filter((x) => x !== "");
    if (c.length === 0) continue;

    // 庁名候補（単独セルで「局/支局/出張所/部門」を含む）
    if (c.length === 1 && /(支局|出張所|部門|本局)/.test(c[0]) && !/クリック|戻る|ご覧/.test(c[0])) {
      currentOffice = c[0].replace(/\s/g, "");
      inTable = false;
      continue;
    }
    // ヘッダ行検出
    if (c[0] === "申請日") { inTable = true; continue; }
    if (/^不動産（権利）/.test(c[0])) continue; // サブヘッダ

    if (!inTable || !currentOffice) continue;

    const appl = parseMD(c[0]);
    if (!appl || !c[0].includes("月")) { // 表の終端（注記など）
      if (/^（注）|確認方法|庁選択/.test(c[0])) inTable = false;
      continue;
    }
    // 列: [申請日, 不動産（権利）, 不動産（表示）, 商業・法人]
    const kenri = parseMD(c[1] || "");
    if (!kenri) continue;

    const applYear = baseYear;
    const applISO = iso(applYear, appl.mm, appl.dd);
    // 完了が申請より前の月＝翌年
    const compYear = kenri.mm < appl.mm ? applYear + 1 : applYear;
    const compISO = iso(compYear, kenri.mm, kenri.dd);

    const office = (store[currentOffice] ||= {});
    // 同一申請日でAM/PMの遅い方を採用
    if (!office[applISO] || compISO > office[applISO]) office[applISO] = compISO;
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

  const store = {};
  let fetched = 0;
  for (const url of uniq) {
    try {
      const html = dec(await getBuf(url));
      parseDetail(html, store);
      fetched++;
      process.stdout.write(".");
    } catch (e) {
      console.error("\n失敗:", url, e.message);
    }
  }
  console.log("");

  // 庁ごとに申請日昇順へ整列
  const offices = Object.keys(store).sort();
  const data = {};
  for (const o of offices) {
    data[o] = Object.fromEntries(Object.entries(store[o]).sort(([a], [b]) => a.localeCompare(b)));
  }
  const total = offices.reduce((n, o) => n + Object.keys(data[o]).length, 0);
  if (fetched === 0 || offices.length < 10 || total < 50) {
    throw new Error(
      `取得結果が少なすぎるため更新を中止しました（成功ページ: ${fetched}、庁数: ${offices.length}、申請日: ${total}）。`
    );
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: "東京法務局 登記完了予定日（不動産（権利）登記）",
    sourceUrl: INDEX,
    note: "AM/PMは区別せず、同一申請日の遅い方の完了予定日を採用。",
    offices,
    data,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
  // file:// で開いても読めるようJS版も出力（fetch不可環境向け）
  const JSOUT = OUT.replace(/\.json$/, ".js");
  fs.writeFileSync(JSOUT, "window.KANRYO_DATA = " + JSON.stringify(out) + ";\n", "utf8");

  console.log(`出力: ${OUT}`);
  console.log(`庁数: ${offices.length} / 申請日エントリ総数: ${total}`);
  console.log("庁一覧:", offices.join("、"));
}

main();
