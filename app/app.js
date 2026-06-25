"use strict";
(function () {
  const STORE_KEY = "touki_cases_v1";
  const STORAGE_MODE_KEY = "touki_storage_mode_v1";
  const SHARED_OFFICE_KEY = "touki_shared_office_v1";
  const TEAM_MODE_KEY = "touki_team_mode_v1";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
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
      updatedAt: typeof item.updatedAt === "string" && item.updatedAt ? item.updatedAt : null,
    };
  }

  const loadLocal = () => {
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
  const saveLocal = (list) => localStorage.setItem(STORE_KEY, JSON.stringify(list));

  let storageMode = localStorage.getItem(STORAGE_MODE_KEY) === "shared" ? "shared" : "local";
  let cases = loadLocal();
  const shared = {
    client: null,
    scriptPromise: null,
    session: null,
    user: null,
    memberships: [],
    officeId: localStorage.getItem(SHARED_OFFICE_KEY) || "",
    loading: false,
    error: "",
    configured: false,
  };

  function getSharedConfig() {
    const cfg = window.TOUKI_SHARED_CONFIG && typeof window.TOUKI_SHARED_CONFIG === "object"
      ? window.TOUKI_SHARED_CONFIG
      : {};
    return {
      enabled: cfg.enabled !== false,
      supabaseUrl: typeof cfg.supabaseUrl === "string" ? cfg.supabaseUrl.trim() : "",
      supabaseAnonKey: typeof cfg.supabaseAnonKey === "string" ? cfg.supabaseAnonKey.trim() : "",
      activationParam: typeof cfg.activationParam === "string" && cfg.activationParam ? cfg.activationParam : "team",
      activationValue: typeof cfg.activationValue === "string" && cfg.activationValue ? cfg.activationValue : "office",
      alwaysShow: cfg.alwaysShow === true,
    };
  }

  function activateSharedFeatureFromUrl() {
    const cfg = getSharedConfig();
    if (!cfg.enabled) return;
    const params = new URLSearchParams(location.search || "");
    if (params.get(cfg.activationParam) === cfg.activationValue) {
      localStorage.setItem(TEAM_MODE_KEY, "1");
    }
  }

  function isSharedFeatureVisible() {
    const cfg = getSharedConfig();
    if (!cfg.enabled) return false;
    return cfg.alwaysShow || localStorage.getItem(TEAM_MODE_KEY) === "1" || storageMode === "shared";
  }

  function isSharedConfigured() {
    const cfg = getSharedConfig();
    return Boolean(cfg.enabled && /^https:\/\//.test(cfg.supabaseUrl) && cfg.supabaseAnonKey.length > 20);
  }
  const isSharedReady = () => storageMode === "shared" && !!(shared.client && shared.session && shared.officeId);
  const canSaveToCurrentMode = () => storageMode !== "shared" || isSharedReady();
  function currentOfficeName() {
    const m = shared.memberships.find((item) => item.officeId === shared.officeId);
    return m?.officeName || "事務所";
  }

  function roleLabel(role) {
    if (role === "owner" || role === "admin") return "管理者";
    if (role === "member") return "メンバー";
    return role || "";
  }

  function loadSupabaseScript() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (shared.scriptPromise) return shared.scriptPromise;
    shared.scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SUPABASE_CDN;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("共有機能の読込に失敗しました。ネットワークを確認してください。"));
      document.head.appendChild(script);
    });
    return shared.scriptPromise;
  }

  async function ensureSharedClient() {
    if (shared.client) return shared.client;
    if (!isSharedConfigured()) {
      throw new Error("共有モードの設定が未完了です。shared-config.js にSupabaseのURLとanon keyを設定してください。");
    }
    await loadSupabaseScript();
    const cfg = getSharedConfig();
    shared.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    shared.client.auth.onAuthStateChange((_event, session) => {
      shared.session = session;
      shared.user = session?.user || null;
      if (storageMode === "shared") {
        loadSharedAfterAuth().catch(handleSharedError);
      }
    });
    return shared.client;
  }

  function membershipFromRow(row) {
    const office = Array.isArray(row.office) ? row.office[0] : row.office;
    return {
      officeId: row.office_id,
      role: row.role || "member",
      displayName: row.display_name || "",
      officeName: office?.name || "事務所",
    };
  }

  async function loadSharedMemberships() {
    const client = await ensureSharedClient();
    if (!shared.user) return [];
    const { data, error } = await client
      .from("office_members")
      .select("office_id, role, display_name, office:offices(name)")
      .eq("user_id", shared.user.id);
    if (error) throw error;
    shared.memberships = (data || []).map(membershipFromRow).filter((m) => m.officeId);
    const ids = shared.memberships.map((m) => m.officeId);
    if (!ids.includes(shared.officeId)) {
      shared.officeId = ids[0] || "";
      if (shared.officeId) localStorage.setItem(SHARED_OFFICE_KEY, shared.officeId);
      else localStorage.removeItem(SHARED_OFFICE_KEY);
    }
    return shared.memberships;
  }

  function rowToCase(row) {
    return normalizeCase({
      id: row.id,
      label: row.label || "",
      jurisdiction: row.jurisdiction_id || DEFAULT_JURISDICTION,
      registrationType: row.registration_type || DEFAULT_TYPE,
      office: row.registry_office || "",
      applyDate: row.apply_date || "",
      dueDate: row.due_date || null,
      status: row.status || "active",
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || null,
    });
  }

  function caseToRow(c) {
    const now = new Date().toISOString();
    return {
      office_id: shared.officeId,
      label: c.label || "",
      jurisdiction_id: c.jurisdiction || DEFAULT_JURISDICTION,
      registration_type: c.registrationType || DEFAULT_TYPE,
      registry_office: c.office,
      apply_date: c.applyDate,
      due_date: c.dueDate,
      status: c.status === "done" ? "done" : "active",
      created_by: shared.user?.id,
      updated_by: shared.user?.id,
      updated_at: now,
    };
  }

  async function loadSharedCases() {
    const client = await ensureSharedClient();
    if (!shared.session || !shared.officeId) {
      cases = [];
      return;
    }
    const { data, error } = await client
      .from("office_cases")
      .select("*")
      .eq("office_id", shared.officeId)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    cases = (data || []).map(rowToCase).filter(Boolean);
  }

  async function loadSharedAfterAuth() {
    if (storageMode !== "shared") return;
    if (!shared.session) {
      cases = [];
      shared.memberships = [];
      renderStoragePanel();
      render();
      updateResult();
      return;
    }
    shared.loading = true;
    shared.error = "";
    renderStoragePanel();
    try {
      await loadSharedMemberships();
      if (!shared.officeId) {
        cases = [];
        shared.error = "このログインユーザーは、まだ事務所に紐づいていません。管理者が office_members に追加してください。";
      } else {
        await loadSharedCases();
        await refreshSavedDueDates();
      }
    } finally {
      shared.loading = false;
      renderStoragePanel();
      render();
      updateResult();
    }
  }

  async function startSharedMode() {
    shared.configured = isSharedConfigured();
    if (!shared.configured) {
      shared.error = "共有モードはまだ未設定です。Supabaseの設定後に使えます。今はこの端末に保存します。";
      storageMode = "local";
      localStorage.setItem(STORAGE_MODE_KEY, storageMode);
      cases = loadLocal();
      renderStoragePanel();
      render();
      updateResult();
      return;
    }
    storageMode = "shared";
    localStorage.setItem(STORAGE_MODE_KEY, storageMode);
    cases = [];
    shared.loading = true;
    shared.error = "";
    renderStoragePanel();
    render();
    updateResult();
    try {
      const client = await ensureSharedClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      shared.session = data.session;
      shared.user = data.session?.user || null;
      await loadSharedAfterAuth();
    } catch (e) {
      shared.loading = false;
      handleSharedError(e);
    }
  }

  function switchToLocalMode() {
    storageMode = "local";
    localStorage.setItem(STORAGE_MODE_KEY, storageMode);
    shared.error = "";
    cases = loadLocal();
    renderStoragePanel();
    render();
    updateResult();
  }

  function handleSharedError(e) {
    console.warn("共有モードでエラーが発生しました。", e);
    shared.loading = false;
    shared.error = e?.message || "共有モードで処理できませんでした。";
    renderStoragePanel();
    render();
    updateResult();
  }

  async function signInShared(event) {
    event.preventDefault();
    const email = $("shared-email")?.value.trim();
    const password = $("shared-password")?.value;
    if (!email || !password) return;
    try {
      shared.loading = true;
      shared.error = "";
      renderStoragePanel();
      const client = await ensureSharedClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      shared.session = data.session;
      shared.user = data.user;
      if ($("shared-password")) $("shared-password").value = "";
      await loadSharedAfterAuth();
    } catch (e) {
      handleSharedError(e);
    }
  }

  async function signOutShared() {
    try {
      const client = await ensureSharedClient();
      await client.auth.signOut();
      shared.session = null;
      shared.user = null;
      shared.memberships = [];
      cases = [];
      renderStoragePanel();
      render();
      updateResult();
    } catch (e) {
      handleSharedError(e);
    }
  }

  async function refreshSharedFromButton() {
    try {
      if (!isSharedReady()) return;
      shared.loading = true;
      shared.error = "";
      renderStoragePanel();
      await loadSharedCases();
      await refreshSavedDueDates();
      shared.loading = false;
      renderStoragePanel();
      render();
      updateResult();
    } catch (e) {
      handleSharedError(e);
    }
  }

  async function changeSharedOffice() {
    const value = $("shared-office")?.value || "";
    if (!value || value === shared.officeId) return;
    shared.officeId = value;
    localStorage.setItem(SHARED_OFFICE_KEY, value);
    await refreshSharedFromButton();
  }

  async function createSharedCase(c) {
    const client = await ensureSharedClient();
    const { data, error } = await client
      .from("office_cases")
      .insert(caseToRow(c))
      .select("*")
      .single();
    if (error) throw error;
    const saved = rowToCase(data);
    if (saved) cases.push(saved);
  }

  async function updateSharedCase(id, patch) {
    const client = await ensureSharedClient();
    const payload = { ...patch, updated_by: shared.user?.id, updated_at: new Date().toISOString() };
    const { error } = await client.from("office_cases").update(payload).eq("id", id).eq("office_id", shared.officeId);
    if (error) throw error;
  }

  async function deleteSharedCase(id) {
    const client = await ensureSharedClient();
    const { error } = await client.from("office_cases").delete().eq("id", id).eq("office_id", shared.officeId);
    if (error) throw error;
  }

  async function refreshSavedDueDates() {
    let changed = false;
    const sharedUpdates = [];
    for (const c of cases) {
      const latest = lookupDue(c.jurisdiction || DEFAULT_JURISDICTION, c.registrationType || DEFAULT_TYPE, c.office, c.applyDate);
      if (latest && latest !== c.dueDate) {
        c.dueDate = latest;
        c.updatedAt = new Date().toISOString();
        changed = true;
        if (isSharedReady()) sharedUpdates.push({ id: c.id, due_date: latest });
      }
    }
    if (!changed) return;
    if (isSharedReady()) {
      await Promise.all(sharedUpdates.map((item) => updateSharedCase(item.id, { due_date: item.due_date })));
    } else if (storageMode === "local") {
      saveLocal(cases);
    }
  }

  function renderStoragePanel() {
    const panel = $("storage-panel");
    const localBtn = $("mode-local");
    if (!localBtn) return;
    const cfg = getSharedConfig();
    const shouldShowPanel = isSharedFeatureVisible();
    if (panel) panel.hidden = !shouldShowPanel;
    if (!shouldShowPanel) return;
    shared.configured = isSharedConfigured();
    const sharedBtn = $("mode-shared");
    const status = $("sync-status");
    const login = $("shared-login");
    const session = $("shared-session");
    const message = $("shared-message");
    const officeSelect = $("shared-office");
    const refreshBtn = $("shared-refresh");
    const logoutBtn = $("shared-logout");
    const listTitle = $("list-title");

    localBtn.classList.toggle("is-active", storageMode === "local");
    sharedBtn?.classList.toggle("is-active", storageMode === "shared");
    sharedBtn?.setAttribute("aria-pressed", storageMode === "shared" ? "true" : "false");
    localBtn.setAttribute("aria-pressed", storageMode === "local" ? "true" : "false");
    if (listTitle) listTitle.textContent = storageMode === "shared" ? "事務所共有案件" : "保存した案件";

    if (status) {
      if (storageMode === "local") status.textContent = "この端末だけに保存中。共有DBには送信されません。";
      else if (shared.loading) status.textContent = "事務所共有データを確認中…";
      else if (!shared.configured) status.textContent = "共有モードは未設定です。";
      else if (!shared.session) status.textContent = "事務所共有にログインしてください。";
      else if (!shared.officeId) status.textContent = "ログイン済み。事務所の紐づけ待ちです。";
      else status.textContent = `${currentOfficeName()} の共有案件を表示中。`;
    }

    if (login) login.hidden = !(storageMode === "shared" && shared.configured && !shared.session);
    if (session) session.hidden = !(storageMode === "shared" && shared.configured && !!shared.session);

    if (officeSelect) {
      officeSelect.innerHTML = "";
      for (const m of shared.memberships) {
        const option = document.createElement("option");
        option.value = m.officeId;
        option.textContent = `${m.officeName}${m.role ? `（${roleLabel(m.role)}）` : ""}`;
        officeSelect.appendChild(option);
      }
      if (shared.officeId) officeSelect.value = shared.officeId;
      officeSelect.disabled = shared.memberships.length <= 1 || shared.loading;
    }
    if (refreshBtn) refreshBtn.disabled = shared.loading || !isSharedReady();
    if (logoutBtn) logoutBtn.disabled = shared.loading;

    const messages = [];
    if (storageMode === "shared" && !shared.configured) messages.push("共有モードを使うには、Supabaseプロジェクト作成後に app/shared-config.js を設定してください。");
    if (storageMode === "shared" && shared.configured && !shared.session) messages.push("案件名も共有されるため、友人事務所のメンバーだけにログインを配布してください。");
    if (shared.error) messages.push(shared.error);
    if (message) {
      message.hidden = messages.length === 0;
      message.textContent = messages.join(" ");
    }
  }  function updateResult() {
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
    const canSave = canSaveToCurrentMode();
    addBtn.disabled = !canSave;
    const saveSuffix = canSave ? "" : " ／ 共有保存にはログインと事務所設定が必要です";

    if (!due) {
      box.className = "result result--warn";
      dateEl.textContent = "未掲載";
      hintEl.textContent = `この申請日は現在の掲載表・過去取得済みデータのどちらにもありません（休日・対象期間外など）。保存すると後日データ更新で再判定できます。${saveSuffix}`;
      return;
    }

    const n = diffDays(todayISO(), due);
    const context = `${jurisdictionLabel(jurisdictionId)}・${typeLabel(typeId)}・${office}`;
    const sourceNote = sourceText(lookupSourceStatus(jurisdictionId, typeId, office, apply));
    const sourceSuffix = sourceNote ? ` ／ ${sourceNote}` : "";
    if (n > 0) {
      box.className = "result result--ok";
      hintEl.textContent = `あと ${n} 日（${context}）${sourceSuffix}${saveSuffix}`;
    } else if (n === 0) {
      box.className = "result result--due";
      hintEl.textContent = `本日が予定日です（${context}）${sourceSuffix}${saveSuffix}`;
    } else {
      box.className = "result result--over";
      hintEl.textContent = `予定日を ${-n} 日過ぎています（${context}）${sourceSuffix}${saveSuffix}`;
    }
    dateEl.textContent = fmtJP(due);
  }

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
    const names = hit.map((c) => (c.label && c.label.trim() ? c.label : "（メモなし）")).join("、");
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
    const empty = $("empty");
    empty.hidden = visible.length > 0;
    empty.textContent = storageMode === "shared"
      ? "この事務所の共有案件はここに並びます。予定日を過ぎた案件だけ、静かにお知らせします。"
      : "保存した案件はここに並びます。予定日を過ぎた案件だけ、静かにお知らせします。";
    updateBanner();
    renderStoragePanel();

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
      el.querySelector(".item__label").textContent = c.label && c.label.trim() ? c.label : "（メモなし）";
      el.querySelector(".item__office").textContent = `${jurisdictionLabel(c.jurisdiction || DEFAULT_JURISDICTION)} ｜ ${typeLabel(c.registrationType || DEFAULT_TYPE)} ｜ ${c.office}`;
      el.querySelector(".apply").textContent = fmtJP(c.applyDate);
      el.querySelector(".due").textContent = c.dueDate ? fmtJP(c.dueDate) : "未掲載";
      const sourceEl = el.querySelector(".item__source");
      const status = c.dueDate
        ? lookupSourceStatus(c.jurisdiction || DEFAULT_JURISDICTION, c.registrationType || DEFAULT_TYPE, c.office, c.applyDate)
        : "missing";
      sourceEl.textContent = sourceText(status);
      const actions = el.querySelector(".item__actions");
      actions.appendChild(c.status === "done"
        ? mkBtn("未完了に戻す", "mini mini--undo", () => toggleDone(c.id, false))
        : mkBtn("完了にする", "mini mini--done", () => toggleDone(c.id, true)));
      actions.appendChild(mkBtn("削除", "mini mini--del", () => removeCase(c.id)));
      list.appendChild(el);
    }
  }
  function mkBtn(text, cls, fn) {
    const button = document.createElement("button");
    button.type = "button"; button.className = cls; button.textContent = text;
    button.addEventListener("click", () => Promise.resolve(fn()).catch(handleSharedError));
    return button;
  }  async function addCase() {
    const jurisdiction = selectedJurisdiction();
    const registrationType = selectedType();
    const office = $("f-office").value;
    const applyDate = $("f-apply").value;
    if (!office || !applyDate) return;
    if (storageMode === "shared" && !isSharedReady()) {
      shared.error = "事務所共有に保存するには、ログインと事務所の紐づけが必要です。";
      renderStoragePanel();
      updateResult();
      return;
    }
    const newCase = {
      id: uid(),
      label: $("f-label").value.trim(),
      jurisdiction,
      registrationType,
      office,
      applyDate,
      dueDate: lookupDue(jurisdiction, registrationType, office, applyDate),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    try {
      if (isSharedReady()) await createSharedCase(newCase);
      else { cases.push(newCase); saveLocal(cases); }
      $("f-label").value = "";
      flashSaved();
      render();
    } catch (e) {
      handleSharedError(e);
    }
  }
  function flashSaved() {
    const button = $("f-add");
    const text = button.textContent;
    button.textContent = storageMode === "shared" ? "共有に保存しました ✓" : "保存しました ✓";
    setTimeout(() => (button.textContent = text), 1200);
  }
  async function toggleDone(id, done) {
    const c = cases.find((x) => x.id === id);
    if (!c) return;
    const nextStatus = done ? "done" : "active";
    if (isSharedReady()) await updateSharedCase(id, { status: nextStatus });
    c.status = nextStatus;
    c.updatedAt = new Date().toISOString();
    if (!isSharedReady()) saveLocal(cases);
    render();
  }
  async function removeCase(id) {
    if (!confirm("この案件を削除しますか？")) return;
    if (isSharedReady()) await deleteSharedCase(id);
    cases = cases.filter((x) => x.id !== id);
    if (!isSharedReady()) saveLocal(cases);
    render();
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
      $("data-meta").textContent = `データ取得：${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} 時点 / 対象：${count}法務局${history}`;
    } else {
      $("data-meta").textContent = "";
    }
  }

  async function init() {
    populateJurisdictions();
    updateControls();
    updateDataMeta();
    renderStoragePanel();

    $("f-jurisdiction").addEventListener("change", updateControls);
    document.querySelectorAll('input[name="registration-type"]').forEach((input) => input.addEventListener("change", updateControls));
    $("f-office").addEventListener("change", updateResult);
    $("f-apply").addEventListener("change", updateResult);
    $("f-add").addEventListener("click", addCase);
    $("show-done").addEventListener("change", render);
    $("alert-banner").addEventListener("click", () => {
      const head = document.querySelector(".list-head");
      if (head) head.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("mode-local")?.addEventListener("click", switchToLocalMode);
    $("mode-shared")?.addEventListener("click", () => startSharedMode());
    $("shared-login")?.addEventListener("submit", signInShared);
    $("shared-logout")?.addEventListener("click", signOutShared);
    $("shared-refresh")?.addEventListener("click", refreshSharedFromButton);
    $("shared-office")?.addEventListener("change", () => changeSharedOffice().catch(handleSharedError));

    render();
    if (storageMode === "shared") await startSharedMode();

    const latest = await fetchLatestData();
    if (latest && useData(latest)) {
      const selectedJ = selectedJurisdiction();
      const selectedOffice = $("f-office").value;
      populateJurisdictions(selectedJ);
      populateOffices(selectedOffice);
      updateControls();
      updateDataMeta();
      await refreshSavedDueDates();
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
        .register("./sw.js?v=20260625-office1", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();