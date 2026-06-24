// 東京・大阪・鹿児島地方法務局の登記完了予定日スクレイパ
// 出力: ../app/data/kanryo.json / ../app/data/kanryo.js
// 仕様: 申請日 -> 完了予定日。AM/PMは無視し、同一申請日の遅い方を採用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "app", "data", "kanryo.json");

const TYPES = [
  { id: "realEstate", label: "不動産（権利）", column: 1 },
  { id: "commercial", label: "商業・法人", column: 3 },
];

const JURISDICTIONS = [
  {
    id: "tokyo",
    label: "東京法務局",
    kind: "indexLinks",
    indexUrl: "https://houmukyoku.moj.go.jp/tokyo/category_00019.html",
    linkPattern: /kanryoyotei[^\"]*\.html?/i,
    minimums: {
      realEstate: { offices: 10, entries: 50 },
      commercial: { offices: 10, entries: 50 },
    },
  },
  {
    id: "osaka",
    label: "大阪法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/osaka/static/kanryobi.html",
    minimums: {
      realEstate: { offices: 8, entries: 40 },
      commercial: { offices: 3, entries: 20 },
    },
  },
  {
    id: "kagoshima",
    label: "鹿児島地方法務局",
    kind: "pdfFromIndex",
    indexUrl: "https://houmukyoku.moj.go.jp/kagoshima/category_00015.html",
    minimums: {
      realEstate: { offices: 5, entries: 25 },
      commercial: { offices: 1, entries: 10 },
    },
  },
];

function dec(buf) {
  const head = buf.toString("ascii", 0, Math.min(buf.length, 4096));
  const m = head.match(/charset=["']?([^"' >]+)/i);
  const charset = (m?.[1] || "utf-8").toLowerCase();
  const encoding = /shift|sjis|windows-31j/.test(charset) ? "shift_jis" : "utf-8";
  return new TextDecoder(encoding).decode(buf);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getBuf(url) {
  let lastError;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 touki-kanryo-app" } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
      if (i < 3) await sleep(700 * i);
    }
  }
  throw lastError;
}

function cleanText(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellsOf(tr) {
  return [...tr.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)].map((td) => cleanText(td[0]));
}

// "令和8年" を西暦へ
function reiwaToYear(text) {
  const m = String(text || "").match(/令和\s*(\d+)\s*年/);
  return m ? 2018 + Number(m[1]) : new Date().getFullYear();
}

// "6月11日（木）AM" / "6月11日(木)" -> { mm, dd, ampm }
const DATE_RE = /(\d{1,2})月(\d{1,2})日(?:[（(].?[）)])?\s*(AM|PM)?/;
const DATE_RE_GLOBAL = /(\d{1,2})月(\d{1,2})日(?:[（(].?[）)])?\s*(AM|PM)?/g;

function parseMD(s) {
  const m = String(s || "").match(DATE_RE);
  if (!m) return null;
  return { mm: Number(m[1]), dd: Number(m[2]), ampm: m[3] || null };
}

function datesInText(s) {
  return [...String(s || "").matchAll(DATE_RE_GLOBAL)].map((m) => ({
    mm: Number(m[1]),
    dd: Number(m[2]),
    ampm: m[3] || null,
  }));
}

const iso = (y, mm, dd) => `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

// 法務局ページの「令和○年」は完了予定日側の年として扱う。
// 例: 令和8年ページで「12月26日申請 -> 1月8日完了」は 2025-12-26 -> 2026-01-08。
function resolveYears(baseYear, appliedMonth, completedMonth) {
  const crossesYear = completedMonth < appliedMonth;
  return {
    applyYear: crossesYear ? baseYear - 1 : baseYear,
    completeYear: baseYear,
  };
}

function makeStores() {
  return Object.fromEntries(
    JURISDICTIONS.map((j) => [j.id, Object.fromEntries(TYPES.map((type) => [type.id, {}]))])
  );
}

function officeFromText(text, jurisdiction) {
  let t = cleanText(text).replace(/\s/g, "");
  if (!t) return null;
  if (/必ず|ご覧|クリック|戻る|申請日|更新日|各庁別|登記完了予定日|トップページ/.test(t)) {
    return null;
  }
  if (jurisdiction.id === "osaka" && /^本局/.test(t)) return "本局";
  if (jurisdiction.id === "kagoshima" && t === "鹿児島地方法務局本局") return "本局";
  if (/(支局|出張所|部門|本局)$/.test(t)) return t;
  return null;
}

function addEntry(stores, jurisdictionId, typeId, officeName, baseYear, applied, completed) {
  const { applyYear, completeYear } = resolveYears(baseYear, applied.mm, completed.mm);
  const applyISO = iso(applyYear, applied.mm, applied.dd);
  const completeISO = iso(completeYear, completed.mm, completed.dd);
  const office = (stores[jurisdictionId][typeId][officeName] ||= {});
  // 同一申請日でAM/PM等の複数行がある場合は、遅い完了予定日を採用。
  if (!office[applyISO] || completeISO > office[applyISO]) office[applyISO] = completeISO;
}

function parseDateRow(raw, stores, jurisdiction, currentOffice, baseYear) {
  if (!currentOffice) return false;
  const applied = parseMD(raw[0] || "");
  if (!applied) return false;

  let found = false;
  for (const type of TYPES) {
    const completed = parseMD(raw[type.column] || "");
    if (!completed) continue;
    addEntry(stores, jurisdiction.id, type.id, currentOffice, baseYear, applied, completed);
    found = true;
  }
  return found;
}

function parseHtmlTables(html, stores, jurisdiction) {
  const baseYear = reiwaToYear(html);
  const tokenRe = /<h[1-6]\b[\s\S]*?<\/h[1-6]>|<tr\b[\s\S]*?<\/tr>/gi;
  let currentOffice = null;
  let inTable = false;

  for (const token of html.matchAll(tokenRe)) {
    const rawToken = token[0];
    if (/^<h/i.test(rawToken)) {
      const office = officeFromText(rawToken, jurisdiction);
      if (office) {
        currentOffice = office;
        inTable = false;
      } else if (/必ずお読みください/.test(cleanText(rawToken))) {
        inTable = false;
      }
      continue;
    }

    const raw = cellsOf(rawToken);
    const cells = raw.filter((x) => x !== "");
    if (cells.length === 0) continue;

    const office = cells.length === 1 ? officeFromText(cells[0], jurisdiction) : null;
    if (office) {
      currentOffice = office;
      inTable = false;
      continue;
    }

    const joined = cells.join(" ");
    if (/申請日/.test(joined) || /不動産（権利）/.test(joined)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!parseDateRow(raw, stores, jurisdiction, currentOffice, baseYear)) {
      if (/^（注）|確認方法|庁選択/.test(cells[0])) inTable = false;
    }
  }
}

function absoluteUrl(href, baseUrl) {
  return new URL(href, baseUrl).toString();
}

function extractLinks(html, source) {
  return [...html.matchAll(/href="([^"]+)"/gi)]
    .map((m) => m[1])
    .filter((href) => source.linkPattern.test(href))
    .map((href) => absoluteUrl(href, source.indexUrl));
}

function extractPdfLink(html, source) {
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], text: cleanText(m[2]) }));
  const hit = anchors.find((a) => /登記完了予定日/.test(a.text));
  if (!hit) throw new Error("登記完了予定日のPDFリンクが見つかりません。");
  return absoluteUrl(hit.href, source.indexUrl);
}

async function pdfLines(buf) {
  const pdf = await getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise;
  const lines = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const byLine = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const row = byLine.get(y) || [];
      row.push({ x: item.transform[4], text: item.str });
      byLine.set(y, row);
    }
    for (const [, row] of [...byLine.entries()].sort((a, b) => b[0] - a[0])) {
      lines.push(row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
    }
  }
  return lines.map(cleanText).filter(Boolean);
}

async function parsePdf(buf, stores, jurisdiction) {
  const lines = await pdfLines(buf);
  const baseYear = reiwaToYear(lines.join("\n"));
  let currentOffice = null;

  for (const line of lines) {
    const office = officeFromText(line, jurisdiction);
    if (office) {
      currentOffice = office;
      continue;
    }
    if (!currentOffice) continue;

    const dates = datesInText(line);
    if (dates.length < 2) continue;

    addEntry(stores, jurisdiction.id, "realEstate", currentOffice, baseYear, dates[0], dates[1]);
    // 鹿児島PDFは本局のみ「申請日 / 不動産（権利） / 不動産（表示） / 商業・法人」の4日付。
    if (dates.length >= 4) {
      addEntry(stores, jurisdiction.id, "commercial", currentOffice, baseYear, dates[0], dates[3]);
    }
  }
}

function countEntries(store) {
  return Object.values(store).reduce((n, office) => n + Object.keys(office).length, 0);
}

function validateJurisdiction(stores, jurisdiction) {
  for (const type of TYPES) {
    const min = jurisdiction.minimums?.[type.id];
    if (!min) continue;
    const typeStore = stores[jurisdiction.id][type.id];
    const offices = Object.keys(typeStore).length;
    const entries = countEntries(typeStore);
    if (offices < min.offices || entries < min.entries) {
      throw new Error(
        `${jurisdiction.label}・${type.label}の取得結果が少なすぎるため更新を中止しました` +
        `（庁数: ${offices}、申請日: ${entries}）。`
      );
    }
  }
}

async function scrapeJurisdiction(stores, jurisdiction) {
  console.log(`\n${jurisdiction.label}を取得中…`);
  const sourcePages = [];

  if (jurisdiction.kind === "indexLinks") {
    const idx = dec(await getBuf(jurisdiction.indexUrl));
    const links = [...new Set(extractLinks(idx, jurisdiction))];
    if (links.length === 0) throw new Error("完了予定日ページが見つかりません。");
    console.log(`完了予定日ページ ${links.length} 件`);
    for (const url of links) {
      const html = dec(await getBuf(url));
      parseHtmlTables(html, stores, jurisdiction);
      sourcePages.push(url);
      process.stdout.write(".");
    }
    console.log("");
  } else if (jurisdiction.kind === "htmlPage") {
    const html = dec(await getBuf(jurisdiction.pageUrl));
    parseHtmlTables(html, stores, jurisdiction);
    sourcePages.push(jurisdiction.pageUrl);
  } else if (jurisdiction.kind === "pdfFromIndex") {
    const idx = dec(await getBuf(jurisdiction.indexUrl));
    const pdfUrl = extractPdfLink(idx, jurisdiction);
    console.log(`PDF: ${pdfUrl}`);
    await parsePdf(await getBuf(pdfUrl), stores, jurisdiction);
    sourcePages.push(pdfUrl);
  } else {
    throw new Error(`未対応の取得形式です: ${jurisdiction.kind}`);
  }

  validateJurisdiction(stores, jurisdiction);
  return sourcePages;
}

function sortedObject(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, "ja")));
}

function buildOutput(stores, sourcePages) {
  const data = {};
  const officesByJurisdiction = {};
  const totals = {};

  for (const jurisdiction of JURISDICTIONS) {
    data[jurisdiction.id] = {};
    officesByJurisdiction[jurisdiction.id] = {};
    totals[jurisdiction.id] = {};

    for (const type of TYPES) {
      const offices = Object.keys(stores[jurisdiction.id][type.id]).sort((a, b) => a.localeCompare(b, "ja"));
      officesByJurisdiction[jurisdiction.id][type.id] = offices;
      data[jurisdiction.id][type.id] = {};
      for (const office of offices) {
        data[jurisdiction.id][type.id][office] = sortedObject(stores[jurisdiction.id][type.id][office]);
      }
      totals[jurisdiction.id][type.id] = offices.reduce(
        (n, office) => n + Object.keys(data[jurisdiction.id][type.id][office]).length,
        0
      );
    }
  }

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    source: "登記完了予定日（東京法務局・大阪法務局・鹿児島地方法務局）",
    sources: JURISDICTIONS.map((j) => ({
      id: j.id,
      label: j.label,
      sourceUrl: j.indexUrl || j.pageUrl,
      fetchedPages: sourcePages[j.id] || [],
    })),
    note: "AM/PMは区別せず、同一申請日の遅い方の完了予定日を採用。不動産（表示）登記は対象外。",
    jurisdictions: JURISDICTIONS.map(({ id, label }) => ({ id, label })),
    types: TYPES.map(({ id, label }) => ({ id, label })),
    officesByJurisdiction,
    totals,
    data,
  };
}

async function main() {
  const stores = makeStores();
  const sourcePages = {};

  for (const jurisdiction of JURISDICTIONS) {
    try {
      sourcePages[jurisdiction.id] = await scrapeJurisdiction(stores, jurisdiction);
    } catch (e) {
      throw new Error(`${jurisdiction.label}の取得に失敗しました: ${e.message}`);
    }
  }

  const out = buildOutput(stores, sourcePages);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
  const JSOUT = OUT.replace(/\.json$/, ".js");
  fs.writeFileSync(JSOUT, "window.KANRYO_DATA = " + JSON.stringify(out) + ";\n", "utf8");

  console.log(`\n出力: ${OUT}`);
  for (const jurisdiction of JURISDICTIONS) {
    for (const type of TYPES) {
      const offices = out.officesByJurisdiction[jurisdiction.id][type.id].length;
      const entries = out.totals[jurisdiction.id][type.id];
      console.log(`${jurisdiction.label}・${type.label}: 庁数 ${offices} / 申請日エントリ ${entries}`);
    }
  }
}

main();


