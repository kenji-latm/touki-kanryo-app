"use strict";
(function () {
  const STORE_KEY = "touki_cases_v1";
  const DEFAULT_JURISDICTION = "tokyo";
  const DEFAULT_TYPE = "realEstate";
  const FALLBACK_JURISDICTIONS = [
    { id: "tokyo", label: "東京法務局" },
  ];
  const FALLBACK_TYPES = [
    { id: "realEstate", label: "不動産（権利）" },
    { id: "commercial", label: "商業・法人" },
  ];

  function normalizeOption(item) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id) return null;
    return { id: item.id, label: typeof item.label === "string" && item.label ? item.label : item.id };
  }

  function normalizeTypes(source) {
    const types = Array.isArray(source.types) ? source.types.map(normalizeOption).filter(Boolean) : [];
    return types.length ? types : FALLBACK_TYPES;
  }

  function isSchema3Data(data) {
    return Object.values(data || {}).some(
      (value) => value && typeof value === "object" && (value.realEstate || value.commercial)
    );
  }

  function normalizeMeta(meta) {
    const source = meta && typeof meta === "object" ? meta : {};
    const types = normalizeTypes(source);

    // schemaVersion 3: 法務局 -> 登記種別 -> 庁 -> 申請日
    if (source.data && isSchema3Data(source.data)) {
      const jurisdictionIds = Object.keys(source.data).sort();
      const jurisdictions = Array.isArray(source.jurisdictions) && source.jurisdictions.length
        ? source.jurisdictions.map(normalizeOption).filter(Boolean)
        : jurisdictionIds.map((id) => ({ id, label: id }));
      const officesByJurisdiction = source.officesByJurisdiction || Object.fromEntries(
        jurisdictions.map((j) => [
          j.id,
          Object.fromEntries(types.map((type) => [
            type.id,
            Object.keys(source.data?.[j.id]?.[type.id] || {}).sort(),
          ])),
        ])
      );
      return { ...source, jurisdictions, types, officesByJurisdiction };
    }

    // schemaVersion 2: 登記種別 -> 庁 -> 申請日（東京法務局として包む）
    if (source.data && source.data.realEstate) {
      const officesByType = source.officesByType || Object.fromEntries(
        types.map((type) => [type.id, Object.keys(source.data[type.id] || {}).sort()])
      );
      return {
        ...source,
        jurisdictions: FALLBACK_JURISDICTIONS,
        types,
        officesByJurisdiction: { [DEFAULT_JURISDICTION]: officesByType },
        data: { [DEFAULT_JURISDICTION]: source.data },
      };
    }

    // schemaVersion 1: 不動産のみ（東京法務局として包む）
    const oldData = source.data || {};
    return {
      ...source,
      jurisdictions: FALLBACK_JURISDICTIONS,
      types: [FALLBACK_TYPES[0]],
      officesByJurisdiction: {
        [DEFAULT_JURISDICTION]: {
          realEstate: source.offices || Object.keys(oldData).sort(),
        },
      },
      data: { [DEFAULT_JURISDICTION]: { realEstate: oldData } },
    };
  }

  let META = normalizeMeta(window.KANRYO_DATA || {});
  let DB = META.data || {};
  let TYPES = META.types || [];
  let JURISDICTIONS = META.jurisdictions || [];

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const isISODate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

  function fmtJP(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    const wd = WD[new Date(y, m - 1, d).getDay()];
    return `${m}月${d}日（${wd}）`;
  }
  function diffDays(fromISO, toISO) {
    const a = new Date(fromISO + "T00:00:00");
    const b = new Date(toISO + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const jurisdictionLabel = (jurisdictionId) =>
    JURISDICTIONS.find((j) => j.id === jurisdictionId)?.label ||
    FALLBACK_JURISDICTIONS.find((j) => j.id === jurisdictionId)?.label ||
    jurisdictionId;
  const typeLabel = (typeId) =>
    TYPES.find((type) => type.id === typeId)?.label ||
    FALLBACK_TYPES.find((type) => type.id === typeId)?.label ||
    typeId;
  const selectedJurisdiction = () => $("f-jurisdiction")?.value || DEFAULT_JURISDICTION;
  const selectedType = () =>
    document.querySelector('input[name="registration-type"]:checked')?.value || DEFAULT_TYPE;
  const officesFor = (jurisdictionId, typeId) =>
    META.officesByJurisdiction?.[jurisdictionId]?.[typeId] ||
    Object.keys(DB[jurisdictionId]?.[typeId] || {}).sort();

  // 法務局・登記種別・庁・申請日 -> 完了予定日 or null
  const lookupDue = (jurisdictionId, typeId, office, applyISO) =>
    (DB[jurisdictionId] && DB[jurisdictionId][typeId] && DB[jurisdictionId][typeId][office] &&
      DB[jurisdictionId][typeId][office][applyISO]) || null;
  const publishedDatesFor = (jurisdictionId, typeId, office) =>
    META.publishedDates?.[jurisdictionId]?.[typeId]?.[office] || null;
  function lookupSourceStatus(jurisdictionId, typeId, office, applyISO) {
    if (!lookupDue(jurisdictionId, typeId, office, applyISO)) return "missing";
    if (!META.publishedDates) return "unknown";
    const dates = publishedDatesFor(jurisdictionId, typeId, office);
    if (!Array.isArray(dates)) return "history";
    return dates.includes(applyISO) ? "current" : "history";
  }
  function sourceText(status) {
    if (status === "current") return "現在掲載中";
    if (status === "history") return "過去取得済み（現在の公式掲載表には未掲載）";
    return "";
  }

  function useData(meta) {
    const normalized = normalizeMeta(meta);
    if (!normalized.data || !Array.isArray(normalized.types) || normalized.types.length === 0) return false;
    META = normalized;
    DB = normalized.data;
    TYPES = normalized.types;
    JURISDICTIONS = normalized.jurisdictions || FALLBACK_JURISDICTIONS;
    window.KANRYO_DATA = normalized;
    return true;
  }

  async function fetchLatestData() {
    if (!location.protocol.startsWith("http")) return null;
    try {
      const url = new URL("data/kanryo.json", location.href);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = await res.json();
      return meta && meta.data ? meta : null;
    } catch (e) {
      console.warn("最新データを取得できないため、端末内データを使います。", e);
      return null;
    }
  }

  // ---- storage ----
  function normalizeCase(item) {
    if (!item || typeof item !== "object") return null;
    const office = typeof item.office === "string" ? item.office.trim() : "";
    const applyDate = isISODate(item.applyDate) ? item.applyDate : "";
    if (!office || !applyDate) return null;
    return {
      id: typeof item.id === "string" && item.id ? item.id : uid(),
      label: typeof item.label === "string" ? item.label : "",
      jurisdiction: typeof item.jurisdiction === "string" && item.jurisdiction ? item.jurisdiction : DEFAULT_JURISDICTION,
      registrationType: typeof item.registrationType === "string" && item.registrationType ? item.registrationType : DEFAULT_TYPE,
      office,
      applyDate,
      dueDate: isISODate(item.dueDate) ? item.dueDate : null,
      status: item.status === "done" ? "done" : "active",
      createdAt: typeof item.createdAt === "string" && item.createdAt ? item.createdAt : new Date().toISOString(),
    };
  }

  const load = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
      const list = Array.isArray(raw) ? raw : [];
      const normalized = list.map(normalizeCase).filter(Boolean);
      if (JSON.stringify(list) !== JSON.stringify(normalized)) {
        localStorage.setItem(STORE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      return [];
    }
  };
  const save = (list) => localStorage.setItem(STORE_KEY, JSON.stringify(list));
  let cases = load();

  function refreshSavedDueDates() {
    let changed = false;
    for (const c of cases) {
      const latest = lookupDue(c.jurisdiction || DEFAULT_JURISDICTION, c.registrationType || DEFAULT_TYPE, c.office, c.applyDate);
      // 掲載期間外になった既存案件は、以前取得した予定日を保持する。
      if (latest && latest !== c.dueDate) {
        c.dueDate = latest;
        changed = true;
      }
    }
    if (changed) save(cases);
  }

  // ---- result panel ----
  function updateResult() {
    const jurisdictionId = selectedJurisdiction();
    const typeId = selectedType();
    const office = $("f-office").value;
    const apply = $("f-apply").value;
    const box = $("result");
    const dateEl = $("result-date");
    const hintEl = $("result-hint");
    const addBtn = $("f-add");

    if (officesFor(jurisdictionId, typeId).length === 0) {
      box.className = "result result--warn";
      dateEl.textContent = "データ未収録";
      hintEl.textContent = `${jurisdictionLabel(jurisdictionId)}・${typeLabel(typeId)}のデータを読み込めませんでした。オンラインで開き直してください。`;
      addBtn.disabled = true;
      return;
    }

    if (!office || !apply) {
      box.className = "result result--empty";
      dateEl.textContent = "— — —";
      hintEl.textContent = "↑ 法務局・登記種別・管轄・申請日を選ぶと、ここに自動表示されます";
      addBtn.disabled = true;
      return;
    }

    const due = lookupDue(jurisdictionId, typeId, office, apply);
    addBtn.disabled = false;

    if (!due) {
      box.className = "result result--warn";
      dateEl.textContent = "未掲載";
      hintEl.textContent = "この申請日は現在の掲載表・過去取得済みデータのどちらにもありません（休日・対象期間外など）。保存すると後日データ更新で再判定できます。";
      return;
    }

    const n = diffDays(todayISO(), due);
    const context = `${jurisdictionLabel(jurisdictionId)}・${typeLabel(typeId)}・${office}`;
    const sourceNote = sourceText(lookupSourceStatus(jurisdictionId, typeId, office, apply));
    const sourceSuffix = sourceNote ? ` ／ ${sourceNote}` : "";
    if (n > 0) {
      box.className = "result result--ok";
      hintEl.textContent = `あと ${n} 日（${context}）${sourceSuffix}`;
    } else if (n === 0) {
      box.className = "result result--due";
      hintEl.textContent = `本日が予定日です（${context}）${sourceSuffix}`;
    } else {
      box.className = "result result--over";
      hintEl.textContent = `予定日を ${-n} 日過ぎています（${context}）${sourceSuffix}`;
    }
    dateEl.textContent = fmtJP(due);
  }

  // ---- list ----
  function caseState(c) {
    if (c.status === "done") return "done";
    if (!c.dueDate) return "unknown";
    const t = todayISO();
    if (t > c.dueDate) return "over";
    if (t === c.dueDate) return "due";
    return "wait";
  }
  function badge(state, c) {
    if (state === "done") return { cls: "badge--done", text: "完了" };
    if (state === "unknown") return { cls: "badge--unknown", text: "予定日 未掲載" };
    if (state === "over") return { cls: "badge--over", text: `${diffDays(c.dueDate, todayISO())}日超過` };
    if (state === "due") return { cls: "badge--due", text: "本日が予定日" };
    return { cls: "badge--wait", text: `あと${diffDays(todayISO(), c.dueDate)}日` };
  }

  function updateBanner() {
    const t = todayISO();
    const hit = cases.filter((c) => c.status === "active" && c.dueDate && t > c.dueDate);
    const banner = $("alert-banner");
    if (hit.length === 0) { banner.hidden = true; banner.textContent = ""; return; }
    const names = hit
      .map((c) => (c.label && c.label.trim() ? c.label : "（メモなし）"))
      .join("、");
    banner.hidden = false;
    banner.textContent = "";
    const main = document.createElement("span");
    main.textContent = `完了予定日を過ぎている案件が ${hit.length} 件あります`;
    const sub = document.createElement("span");
    sub.className = "alert-banner__sub";
    sub.textContent = names;
    banner.append(main, sub);
  }

  function render() {
    const showDone = $("show-done").checked;
    const list = $("list");
    list.innerHTML = "";
    const visible = cases
      .filter((c) => showDone || c.status !== "done")
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    $("empty").hidden = visible.length > 0;
    updateBanner();

    for (const c of visible) {
      const st = caseState(c);
      const b = badge(st, c);
      const el = document.createElement("div");
      el.className = `item item--${st}`;
      el.innerHTML = `
        <div class="item__top">
          <span class="item__label"></span>
          <span class="badge ${b.cls}">${b.text}</span>
        </div>
        <div class="item__office"></div>
        <div class="item__row">申請日 <span class="apply"></span></div>
        <div class="item__due">完了予定日 <b class="due"></b><span class="item__source"></span></div>
        <div class="item__actions"></div>`;
      el.querySelector(".item__label").textContent =
        c.label && c.label.trim() ? c.label : "（メモなし）";
      el.querySelector(".item__office").textContent =
        `${jurisdictionLabel(c.jurisdiction || DEFAULT_JURISDICTION)} ｜ ${typeLabel(c.registrationType || DEFAULT_TYPE)} ｜ ${c.office}`;
      el.querySelector(".apply").textContent = fmtJP(c.applyDate);
      el.querySelector(".due").textContent = c.dueDate ? fmtJP(c.dueDate) : "未掲載";
      const sourceEl = el.querySelector(".item__source");
      const status = c.dueDate
        ? lookupSourceStatus(c.jurisdiction || DEFAULT_JURISDICTION, c.registrationType || DEFAULT_TYPE, c.office, c.applyDate)
        : "missing";
      sourceEl.textContent = sourceText(status);

      const actions = el.querySelector(".item__actions");
      actions.appendChild(
        c.status === "done"
          ? mkBtn("未完了に戻す", "mini mini--undo", () => toggleDone(c.id, false))
          : mkBtn("完了にする", "mini mini--done", () => toggleDone(c.id, true))
      );
      actions.appendChild(mkBtn("削除", "mini mini--del", () => removeCase(c.id)));
      list.appendChild(el);
    }
  }
  function mkBtn(text, cls, fn) {
    const button = document.createElement("button");
    button.type = "button"; button.className = cls; button.textContent = text;
    button.addEventListener("click", fn);
    return button;
  }

  // ---- actions ----
  function addCase() {
    const jurisdiction = selectedJurisdiction();
    const registrationType = selectedType();
    const office = $("f-office").value;
    const applyDate = $("f-apply").value;
    if (!office || !applyDate) return;
    cases.push({
      id: uid(),
      label: $("f-label").value.trim(),
      jurisdiction,
      registrationType,
      office,
      applyDate,
      dueDate: lookupDue(jurisdiction, registrationType, office, applyDate),
      status: "active",
      createdAt: new Date().toISOString(),
    });
    save(cases);
    $("f-label").value = "";
    flashSaved();
    render();
  }
  function flashSaved() {
    const button = $("f-add");
    const text = button.textContent;
    button.textContent = "保存しました ✓";
    setTimeout(() => (button.textContent = text), 1200);
  }
  function toggleDone(id, done) {
    const c = cases.find((x) => x.id === id);
    if (!c) return;
    c.status = done ? "done" : "active";
    save(cases); render();
  }
  function removeCase(id) {
    if (!confirm("この案件を削除しますか？")) return;
    cases = cases.filter((x) => x.id !== id);
    save(cases); render();
  }

  function populateJurisdictions(selected = "") {
    const select = $("f-jurisdiction");
    const jurisdictions = JURISDICTIONS.length ? JURISDICTIONS : FALLBACK_JURISDICTIONS;
    select.innerHTML = "";
    for (const jurisdiction of jurisdictions) {
      const option = document.createElement("option");
      option.value = jurisdiction.id;
      option.textContent = jurisdiction.label;
      select.appendChild(option);
    }
    const ids = jurisdictions.map((j) => j.id);
    select.value = ids.includes(selected)
      ? selected
      : ids.includes(DEFAULT_JURISDICTION)
        ? DEFAULT_JURISDICTION
        : ids[0] || "";
  }

  function populateOffices(selected = "") {
    const jurisdictionId = selectedJurisdiction();
    const typeId = selectedType();
    const offices = officesFor(jurisdictionId, typeId);
    const select = $("f-office");
    select.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = offices.length ? "選択してください" : "掲載データなし";
    select.appendChild(def);
    for (const office of offices) {
      const option = document.createElement("option");
      option.value = office; option.textContent = office;
      select.appendChild(option);
    }
    if (offices.includes(selected)) select.value = selected;
  }

  function updateControls() {
    const previousOffice = $("f-office").value;
    populateOffices(previousOffice);
    $("f-label").placeholder = selectedType() === "commercial"
      ? "メモ（任意）例：○○株式会社・役員変更"
      : "メモ（任意）例：渋谷・所有権移転";
    updateResult();
  }

  function updateDataMeta() {
    if (META.generatedAt) {
      const d = new Date(META.generatedAt);
      const count = (JURISDICTIONS.length || FALLBACK_JURISDICTIONS.length);
      const history = META.history?.enabled ? " / 履歴蓄積：有効" : "";
      $("data-meta").textContent =
        `データ取得：${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} 時点 / 対象：${count}法務局${history}`;
    } else {
      $("data-meta").textContent = "";
    }
  }

  // ---- init ----
  async function init() {
    populateJurisdictions();
    updateControls();
    updateDataMeta();

    $("f-jurisdiction").addEventListener("change", updateControls);
    document.querySelectorAll('input[name="registration-type"]').forEach((input) =>
      input.addEventListener("change", updateControls)
    );
    $("f-office").addEventListener("change", updateResult);
    $("f-apply").addEventListener("change", updateResult);
    $("f-add").addEventListener("click", addCase);
    $("show-done").addEventListener("change", render);
    $("alert-banner").addEventListener("click", () => {
      const head = document.querySelector(".list-head");
      if (head) head.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    render();

    const latest = await fetchLatestData();
    if (latest && useData(latest)) {
      const selectedJ = selectedJurisdiction();
      const selectedOffice = $("f-office").value;
      populateJurisdictions(selectedJ);
      populateOffices(selectedOffice);
      updateControls();
      updateDataMeta();
      refreshSavedDueDates();
      render();
    }
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js?v=20260624-national1", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
