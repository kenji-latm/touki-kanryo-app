// 登記完了予定日スクレイパ
// 出力: ../app/data/kanryo.json / ../app/data/kanryo.js
// 仕様: 申請日 -> 完了予定日。AM/PMは無視し、同一申請日の遅い方を採用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "app", "data", "kanryo.json");

const TYPES = [
  { id: "realEstate", label: "不動産（権利）" },
  { id: "commercial", label: "商業・法人" },
];

const minimum = (realEstateOffices, realEstateEntries, commercialOffices = 1, commercialEntries = 3) => ({
  realEstate: { offices: realEstateOffices, entries: realEstateEntries },
  commercial: { offices: commercialOffices, entries: commercialEntries },
});

const JURISDICTIONS = [
  {
    id: "sapporo",
    label: "札幌法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/sapporo/static/page000061.html",
    minimums: minimum(10, 70, 1, 8),
  },
  {
    id: "asahikawa",
    label: "旭川地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/asahikawa/static/touki.htm",
    minimums: minimum(4, 15, 1, 3),
  },
  {
    id: "kushiro",
    label: "釧路地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/kushiro/static/page000075.html",
    minimums: minimum(4, 15, 4, 15),
  },
  {
    id: "sendai",
    label: "仙台法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/sendai/static/Touki_kanryou.htm",
    minimums: minimum(6, 30, 1, 5),
  },
  {
    id: "yamagata",
    label: "山形地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/yamagata/static/sinkanryoubi.htm",
    minimums: minimum(5, 30, 1, 4),
  },
  {
    id: "morioka",
    label: "盛岡地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/morioka/static/category_00015.html",
    minimums: minimum(5, 25, 1, 7),
  },
  {
    id: "akita",
    label: "秋田地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/akita/static/newpege1.htm",
    minimums: minimum(4, 20, 1, 4),
  },
  {
    id: "aomori",
    label: "青森地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/aomori/static/kanryoubi.htm",
    minimums: minimum(5, 20, 1, 3),
  },
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
    id: "kofu",
    label: "甲府地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/kofu/static/kanryou.htm",
    minimums: minimum(4, 20, 1, 4),
  },
  {
    id: "nagano",
    label: "長野地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/nagano/static/kanryou.htm",
    minimums: minimum(8, 80, 1, 8),
  },
  {
    id: "niigata",
    label: "新潟地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/niigata/static/yotei.htm",
    minimums: minimum(10, 100, 1, 10),
  },
  {
    id: "tsu",
    label: "津地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/tsu/static/toki_kanryo.html",
    minimums: minimum(7, 25, 1, 3),
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
    id: "otsu",
    label: "大津地方法務局",
    kind: "htmlMatrixByOfficeRows",
    pageUrl: "https://houmukyoku.moj.go.jp/otsu/content/001465437.htm",
    minimums: minimum(5, 30, 1, 5),
  },
  {
    id: "hiroshima",
    label: "広島法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/hiroshima/static/kanryoubi.htm",
    minimums: minimum(6, 25, 1, 3),
  },
  {
    id: "yamaguchi",
    label: "山口地方法務局",
    kind: "htmlPage",
    pageUrl: "https://houmukyoku.moj.go.jp/yamaguchi/static/kanryou.htm",
    minimums: minimum(5, 20, 1, 3),
  },
  {
    id: "saga",
    label: "佐賀地方法務局",
    kind: "htmlSagaMatrix",
    pageUrl: "https://houmukyoku.moj.go.jp/saga/static/saga.htm",
    minimums: minimum(4, 35, 1, 5),
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
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowsOf(html) {
  return [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => cellsOf(m[0]));
}

function cellsOf(tr) {
  return [...tr.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)].map((td) => cleanText(td[0]));
}

// "令和8年" を西暦へ
function reiwaToYear(text) {
  const m = String(text || "").match(/令和\s*(\d+)\s*年/);
  return m ? 2018 + Number(m[1]) : new Date().getFullYear();
}

// "令和8年6月11日（木）AM" / "6月11日(木)" -> { mm, dd, ampm }
const DATE_RE = /(?:令和\s*\d+\s*年\s*)?(\d{1,2})月\s*(\d{1,2})日(?:[（(].?[）)])?\s*(AM|PM|午前|午後)?/;
const DATE_RE_GLOBAL = /(?:令和\s*\d+\s*年\s*)?(\d{1,2})月\s*(\d{1,2})日(?:[（(].?[）)])?\s*(AM|PM|午前|午後)?/g;

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

function normalizeOfficeName(text, jurisdiction) {
  let t = cleanText(text)
    .replace(/一覧に戻る|庁選択に戻る|庁選択にもどる|TOP/g, "")
    .replace(/[【】\[\]■◆●]/g, "")
    .replace(/\s/g, "")
    .trim();
  if (!t) return null;
  if (/必ず|ご覧|クリック|戻る|申請日|更新日|各庁別|登記完了予定日|トップページ|以下|下記以前|完了予定日について/.test(t)) {
    return null;
  }
  if (/^\d+$/.test(t)) return null;
  if (jurisdiction.id === "osaka" && /^本局/.test(t)) return "本局";
  if (jurisdiction.id === "kagoshima" && t === "鹿児島地方法務局本局") return "本局";
  if (/^本局[（(]/.test(t)) return "本局";
  if (/^本局（山口）$/.test(t)) return "本局";
  if (t === "登記部門") return "本局登記部門";
  if (/(支局|出張所|部門|本局)$/.test(t)) return t;
  return null;
}

function officeFromCells(cells, jurisdiction) {
  const nonempty = cells.filter(Boolean);
  if (nonempty.length === 0) return null;
  if (nonempty.length === 1) return normalizeOfficeName(nonempty[0], jurisdiction);
  if (/戻る|もどる/.test(nonempty.join(" "))) return normalizeOfficeName(nonempty[0], jurisdiction);
  if (/^\d+$/.test(nonempty[0])) return normalizeOfficeName(nonempty[1], jurisdiction);
  if (/^■?本局/.test(nonempty[0])) return normalizeOfficeName(nonempty[0], jurisdiction);
  const firstOffice = normalizeOfficeName(nonempty[0], jurisdiction);
  if (firstOffice && nonempty.length <= 2 && !/申請日|登記完了|完了予定|不動産|商業/.test(nonempty.join(" "))) return firstOffice;
  if (firstOffice && nonempty.length <= 4 && /更新|取り扱|取扱/.test(nonempty.join(" "))) return firstOffice;
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

function rowHasCommercial(text) {
  return /商業\s*[・･・]?\s*法人|商業法人/.test(text);
}
function rowHasRealEstate(text) {
  return /不動産.*権利|不動産登記（権利）|不動産登記\(権利\)/.test(text);
}

function parseDateRow(raw, stores, jurisdiction, currentOffice, baseYear, tableState) {
  if (!currentOffice) return false;
  const cells = raw.filter(Boolean);
  if (cells.length === 0) return false;
  const joined = cells.join(" ");
  const dates = datesInText(joined);
  if (dates.length === 0) return false;

  const firstCellDate = parseMD(cells[0]);
  let applied;
  let dueDates;
  if (firstCellDate && dates.length >= 2) {
    applied = dates[0];
    dueDates = dates.slice(1);
    tableState.lastApplied = applied;
  } else if (tableState.lastApplied && dates.length >= 1) {
    applied = tableState.lastApplied;
    dueDates = dates;
  } else {
    return false;
  }

  if (dueDates.length === 0) return false;
  if (tableState.hasRealEstate || !tableState.hasCommercial) {
    addEntry(stores, jurisdiction.id, "realEstate", currentOffice, baseYear, applied, dueDates[0]);
  }
  if (tableState.hasCommercial) {
    // 「商業・法人」列が見出しにあっても、支局では「-」で日付がない場合がある。
    // 不動産（権利）＋不動産（表示）＋商業・法人の3日付以上があるときだけ商業を採用する。
    const commercialDate = tableState.hasRealEstate
      ? (dueDates.length >= 3 ? dueDates[dueDates.length - 1] : null)
      : dueDates[0];
    if (commercialDate) addEntry(stores, jurisdiction.id, "commercial", currentOffice, baseYear, applied, commercialDate);
  }
  return true;
}

function parseHtmlTables(html, stores, jurisdiction) {
  const baseYear = reiwaToYear(html);
  const tokenRe = /<h[1-6]\b[\s\S]*?<\/h[1-6]>|<a\b[^>]*name=["'][^"']+["'][^>]*>[\s\S]*?<\/a>|<tr\b[\s\S]*?<\/tr>/gi;
  let currentOffice = null;
  let inTable = false;
  let tableState = { hasRealEstate: false, hasCommercial: false, lastApplied: null };

  for (const token of html.matchAll(tokenRe)) {
    const rawToken = token[0];
    if (/^<h/i.test(rawToken) || /^<a/i.test(rawToken)) {
      const office = normalizeOfficeName(rawToken, jurisdiction);
      if (office) {
        currentOffice = office;
        inTable = false;
        tableState = { hasRealEstate: false, hasCommercial: false, lastApplied: null };
      } else if (/必ずお読みください/.test(cleanText(rawToken))) {
        inTable = false;
      }
      continue;
    }

    const raw = cellsOf(rawToken);
    const cells = raw.filter((x) => x !== "");
    if (cells.length === 0) continue;

    const office = officeFromCells(cells, jurisdiction);
    if (office) {
      currentOffice = office;
      inTable = false;
      tableState = { hasRealEstate: false, hasCommercial: false, lastApplied: null };
      continue;
    }

    const joined = cells.join(" ");
    const looksLikeHeader = /申\s*請\s*日|登記完了|完了予定日|不動産.*権利|商業/.test(joined) && !parseMD(cells[0]);
    if (looksLikeHeader) {
      inTable = true;
      if (rowHasRealEstate(joined)) tableState.hasRealEstate = true;
      if (rowHasCommercial(joined)) tableState.hasCommercial = true;
      continue;
    }
    if (!inTable) continue;
    if (!parseDateRow(raw, stores, jurisdiction, currentOffice, baseYear, tableState)) {
      if (/^（注）|確認方法|庁選択/.test(cells[0])) inTable = false;
    }
  }
}

function parseHtmlMatrixByOfficeRows(html, stores, jurisdiction) {
  const baseYear = reiwaToYear(html);
  const rows = rowsOf(html).map((row) => row.filter(Boolean));
  let offices = [];
  let currentApply = null;

  for (const row of rows) {
    if (row.length === 0) continue;
    const joined = row.join(" ");
    if (/庁\s*名/.test(joined)) continue;
    if (row.some((cell) => /支局|出張所|本局/.test(cell)) && row.length >= 3 && !/申請日|登記の種類/.test(joined)) {
      offices = row.map((cell) => normalizeOfficeName(cell, jurisdiction)).filter(Boolean);
      continue;
    }

    const firstDate = parseMD(row[0]);
    let typeText = "";
    let dueCells = [];
    if (firstDate) {
      currentApply = firstDate;
      typeText = row[1] || "";
      dueCells = row.slice(2);
    } else if (currentApply && /(権利|商業)/.test(row[0] || "")) {
      typeText = row[0] || "";
      dueCells = row.slice(1);
    } else {
      continue;
    }

    if (!offices.length) continue;
    for (let i = 0; i < offices.length; i++) {
      const due = parseMD(dueCells[i] || "");
      if (!due) continue;
      if (/権利/.test(typeText)) addEntry(stores, jurisdiction.id, "realEstate", offices[i], baseYear, currentApply, due);
      if (/商業/.test(typeText)) addEntry(stores, jurisdiction.id, "commercial", offices[i], baseYear, currentApply, due);
    }
  }
}

function parseHtmlSagaMatrix(html, stores, jurisdiction) {
  const baseYear = reiwaToYear(html);
  const rows = rowsOf(html).map((row) => row.filter(Boolean));
  let offices = [];

  for (const row of rows) {
    if (row[0] === "申請日") {
      offices = row.slice(1).map((cell) => normalizeOfficeName(cell, jurisdiction)).filter(Boolean);
      continue;
    }
    const dates = datesInText(row.join(" "));
    if (!offices.length || dates.length < 2 || !parseMD(row[0] || "")) continue;

    const applied = dates[0];
    const dueDates = dates.slice(1);
    if (offices[0] && dueDates[0]) {
      addEntry(stores, jurisdiction.id, "realEstate", offices[0], baseYear, applied, dueDates[0]);
    }

    let offset = 1;
    if (dueDates.length > offices.length && dueDates[1]) {
      addEntry(stores, jurisdiction.id, "commercial", offices[0], baseYear, applied, dueDates[1]);
      offset = 2;
    }
    for (let i = 1; i < offices.length; i++) {
      const due = dueDates[offset + i - 1];
      if (due) addEntry(stores, jurisdiction.id, "realEstate", offices[i], baseYear, applied, due);
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
    const office = normalizeOfficeName(line, jurisdiction);
    if (office) {
      currentOffice = office;
      continue;
    }
    if (!currentOffice) continue;

    const dates = datesInText(line);
    if (dates.length < 2) continue;

    addEntry(stores, jurisdiction.id, "realEstate", currentOffice, baseYear, dates[0], dates[1]);
    // PDFでは、本局など一部だけ「申請日 / 不動産（権利） / 不動産（表示） / 商業・法人」の4日付。
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
  } else if (jurisdiction.kind === "htmlMatrixByOfficeRows") {
    const html = dec(await getBuf(jurisdiction.pageUrl));
    parseHtmlMatrixByOfficeRows(html, stores, jurisdiction);
    sourcePages.push(jurisdiction.pageUrl);
  } else if (jurisdiction.kind === "htmlSagaMatrix") {
    const html = dec(await getBuf(jurisdiction.pageUrl));
    parseHtmlSagaMatrix(html, stores, jurisdiction);
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
    source: `登記完了予定日（${JURISDICTIONS.length}法務局対応）`,
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


