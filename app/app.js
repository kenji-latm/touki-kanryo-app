"use strict";
(function () {
  const STORE_KEY = "touki_cases_v1";
  let META = window.KANRYO_DATA || {};
  let DB = META.data || {};
  let OFFICES = META.offices || [];

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
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

  // 申請日(YYYY-MM-DD) -> 完了予定日 or null
  const lookupDue = (office, applyISO) => (DB[office] && DB[office][applyISO]) || null;

  function useData(meta) {
    if (!meta || !Array.isArray(meta.offices) || !meta.data) return false;
    META = meta;
    DB = meta.data;
    OFFICES = meta.offices;
    window.KANRYO_DATA = meta;
    return true;
  }

  async function fetchLatestData() {
    if (!location.protocol.startsWith("http")) return null;
    try {
      const url = new URL("data/kanryo.json", location.href);
      url.searchParams.set("v", Date.now());
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = await res.json();
      return meta && Array.isArray(meta.offices) && meta.data ? meta : null;
    } catch (e) {
      console.warn("最新データを取得できないため、端末内データを使います。", e);
      return null;
    }
  }

  // ---- storage ----
  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  };
  const save = (l) => localStorage.setItem(STORE_KEY, JSON.stringify(l));
  let cases = load();

  function refreshSavedDueDates() {
    let changed = false;
    for (const c of cases) {
      const latest = lookupDue(c.office, c.applyDate);
      // 法務局の掲載期間外になった既存案件は、以前取得した予定日を保持する。
      if (latest && latest !== c.dueDate) {
        c.dueDate = latest;
        changed = true;
      }
    }
    if (changed) save(cases);
  }

  // ---- result panel (主役) ----
  function updateResult() {
    const office = $("f-office").value;
    const apply = $("f-apply").value;
    const box = $("result");
    const dateEl = $("result-date");
    const hintEl = $("result-hint");
    const addBtn = $("f-add");

    if (!office || !apply) {
      box.className = "result result--empty";
      dateEl.textContent = "— — —";
      hintEl.textContent = "↑ 管轄と申請日を選ぶと、ここに自動表示されます";
      addBtn.disabled = true;
      return;
    }

    const due = lookupDue(office, apply);
    addBtn.disabled = false;

    if (!due) {
      box.className = "result result--warn";
      dateEl.textContent = "未掲載";
      hintEl.textContent = "この申請日は最新の掲載表にありません（休日・対象期間外など）。保存すると後日データ更新で再判定できます。";
      return;
    }

    const n = diffDays(todayISO(), due);
    if (n > 0) {
      box.className = "result result--ok";
      hintEl.textContent = `あと ${n} 日（${office}）`;
    } else {
      box.className = "result result--due";
      hintEl.textContent = n === 0 ? `本日が予定日です（${office}）` : `予定日を ${-n} 日経過（${office}）`;
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

  // 予定日に到達/超過した保存案件の警告バナー（端末内・Phase1の通知代わり）
  function updateBanner() {
    const t = todayISO();
    const hit = cases.filter((c) => c.status === "active" && c.dueDate && t >= c.dueDate);
    const banner = $("alert-banner");
    if (hit.length === 0) { banner.hidden = true; banner.textContent = ""; return; }
    const names = hit
      .map((c) => (c.label && c.label.trim() ? c.label : "（メモなし）"))
      .join("、");
    banner.hidden = false;
    banner.textContent = "";
    const main = document.createElement("span");
    main.textContent = `⚠ 完了予定日に到達・超過した案件が ${hit.length} 件あります`;
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
        <div class="item__due">完了予定日 <b class="due"></b></div>
        <div class="item__actions"></div>`;
      el.querySelector(".item__label").textContent =
        c.label && c.label.trim() ? c.label : "（メモなし）";
      el.querySelector(".item__office").textContent = c.office;
      el.querySelector(".apply").textContent = fmtJP(c.applyDate);
      el.querySelector(".due").textContent = c.dueDate ? fmtJP(c.dueDate) : "未掲載";

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
    const b = document.createElement("button");
    b.type = "button"; b.className = cls; b.textContent = text;
    b.addEventListener("click", fn);
    return b;
  }

  // ---- actions ----
  function addCase() {
    const office = $("f-office").value;
    const applyDate = $("f-apply").value;
    if (!office || !applyDate) return;
    cases.push({
      id: uid(),
      label: $("f-label").value.trim(),
      office,
      applyDate,
      dueDate: lookupDue(office, applyDate),
      status: "active",
      createdAt: new Date().toISOString(),
    });
    save(cases);
    $("f-label").value = "";
    flashSaved();
    render();
  }
  function flashSaved() {
    const btn = $("f-add");
    const t = btn.textContent;
    btn.textContent = "保存しました ✓";
    setTimeout(() => (btn.textContent = t), 1200);
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

  function populateOffices(selected = "") {
    const sel = $("f-office");
    sel.innerHTML = "";
    const def = document.createElement("option");
    def.value = ""; def.textContent = "選択してください";
    sel.appendChild(def);
    for (const o of OFFICES) {
      const opt = document.createElement("option");
      opt.value = o; opt.textContent = o;
      sel.appendChild(opt);
    }
    if (OFFICES.includes(selected)) sel.value = selected;
  }

  function updateDataMeta() {
    if (META.generatedAt) {
      const d = new Date(META.generatedAt);
      $("data-meta").textContent =
        `データ取得：${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} 時点`;
    } else {
      $("data-meta").textContent = "";
    }
  }

  // ---- init ----
  async function init() {
    populateOffices();
    updateDataMeta();
    if (OFFICES.length === 0) {
      $("result").className = "result result--warn";
      $("result-date").textContent = "データ未読込";
      $("result-hint").textContent = "data/kanryo.js を読み込めませんでした。";
    }

    $("f-office").addEventListener("change", updateResult);
    $("f-apply").addEventListener("change", updateResult);
    $("f-add").addEventListener("click", addCase);
    $("show-done").addEventListener("change", render);
    $("alert-banner").addEventListener("click", () => {
      const head = document.querySelector(".list-head");
      if (head) head.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    updateResult();
    render();

    const latest = await fetchLatestData();
    if (latest && useData(latest)) {
      const selected = $("f-office").value;
      populateOffices(selected);
      updateDataMeta();
      refreshSavedDueDates();
      updateResult();
      render();
    }
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
  document.addEventListener("DOMContentLoaded", init);
})();
