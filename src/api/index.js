import { ensureArray, normalizeRepoPath } from "../utils/index.js";

const DATA_PATHS = {
  appState: ["/api/app-state", "mock-app-state.json"],
  summary: ["mock-aggregate-summary.json"],
  interactions: ["mock-interaction-index.json"],
  report: ["mock-sales-report.md"],
  usageSummary: ["mock-usage-summary.json"],
  usageEvents: ["mock-usage-events.json"],
};

const LIVE_BASE_URL = String(import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/+$/, "");
const LIVE_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000);
const LIVE_WEBHOOK_URL = String(import.meta.env.VITE_WEBHOOK_URL || "").trim();
const LIVE_WHATSAPP_WEBHOOK_URL = String(import.meta.env.VITE_WHATSAPP_WEBHOOK_URL || LIVE_WEBHOOK_URL).trim();
const LIVE_OPENAI_API_KEY = String(import.meta.env.VITE_OPENAI_API_KEY || "").trim();

function isLiveConfigured() {
  return Boolean(LIVE_BASE_URL);
}

function asIsoDate(value) {
  const v = String(value || "").trim();
  return v || null;
}

function daysBetween(from, to) {
  const f = Date.parse(String(from || ""));
  const t = Date.parse(String(to || ""));
  if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) return 0;
  return Math.floor((t - f) / 86400000) + 1;
}

function buildUrl(path, query) {
  const base = LIVE_BASE_URL;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== null && item !== undefined && item !== "") params.append(key, String(item));
      });
      return;
    }
    params.append(key, String(value));
  });
  const qs = params.toString();
  if (qs) url.search = qs;
  return url.toString();
}

function makeHttpError(status, bodyText, url) {
  const text = String(bodyText || "").trim();
  const message = text || `HTTP ${status}`;
  const err = new Error(`Request failed: ${url} (${status}) ${message}`);
  err.status = status;
  err.bodyText = text;
  return err;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = LIVE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveJson(path, { method = "GET", headers = {}, query, body } = {}) {
  if (!isLiveConfigured()) {
    throw new Error("Live backend is not configured");
  }
  const url = buildUrl(path, query);
  const res = await fetchWithTimeout(url, { method, headers, body });
  if (!res.ok) {
    throw makeHttpError(res.status, await res.text(), url);
  }
  return res.json();
}

function shouldFallback(err) {
  if (err?.name === "AbortError") return true;
  const status = Number(err?.status || 0);
  if (!status) return true;
  if (status >= 500) return true;
  return false;
}

function requireValue(value, name) {
  if (!value) {
    const err = new Error(`${name} is not configured`);
    err.status = 0;
    throw err;
  }
  return value;
}

function normalizeLauncherManagers(rows) {
  return ensureArray(rows).map((row) => ({
    id: String(row?.id || row?.ID || "").trim(),
    label: String(row?.name || row?.NAME || "Менеджер").trim(),
    interaction_count: 0,
    active: row?.active !== false,
    email: row?.email || row?.EMAIL || "",
  })).filter((row) => row.id);
}

function normalizeLauncherCategories(rows) {
  return ensureArray(rows).map((row) => ({
    id: String(row?.id || row?.ID || "").trim(),
    label: String(row?.name || row?.NAME || "Воронка").trim(),
    interaction_count: 0,
    deal_count: 0,
    sort: Number(row?.sort || row?.SORT || 0),
  })).filter((row) => row.id).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "ru"));
}

async function fetchLiveAppState() {
  const webhookUrl = requireValue(LIVE_WEBHOOK_URL, "VITE_WEBHOOK_URL");
  const [baseAppState, funnelsPayload, managersPayload] = await Promise.all([
    fetchJson("mock-app-state.json"),
    fetchLiveJson("/catalog/funnels", {
      headers: { "X-Webhook-Url": webhookUrl },
    }),
    fetchLiveJson("/catalog/managers", {
      headers: { "X-Webhook-Url": webhookUrl },
    }),
  ]);

  const availableCategories = normalizeLauncherCategories(funnelsPayload?.funnels);
  const availableManagers = normalizeLauncherManagers(managersPayload?.managers);
  const defaultCategoryId = availableCategories[0]?.id || "";

  return {
    ...baseAppState,
    setup: {
      ...(baseAppState?.setup || {}),
      analysis_launcher: {
        ...(baseAppState?.setup?.analysis_launcher || {}),
        available_categories: availableCategories,
        available_managers: availableManagers,
        default_filters: {
          ...((baseAppState?.setup?.analysis_launcher || {}).default_filters || {}),
          category_ids: defaultCategoryId ? [defaultCategoryId] : [],
        },
      },
    },
    runtime: {
      source: "live",
      backend_url: LIVE_BASE_URL,
      refreshed_at: new Date().toISOString(),
    },
  };
}

async function fetchJson(path) {
  if (path === "/api/app-state" && isLiveConfigured()) {
    return fetchLiveAppState();
  }
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load JSON: ${path} (${res.status})`);
  return res.json();
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load text: ${path} (${res.status})`);
  return res.text();
}

export async function fetchTextSafe(path) {
  try {
    return await fetchText(path);
  } catch {
    return "";
  }
}

async function fetchJsonAny(paths) {
  let lastError = null;
  for (const path of ensureArray(paths)) {
    try {
      return await fetchJson(path);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No JSON paths available");
}

async function fetchTextAny(paths) {
  let lastError = null;
  for (const path of ensureArray(paths)) {
    try {
      return await fetchText(path);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No text paths available");
}

function buildEstimateFromPreview(preview, payload) {
  const matched = Number(preview?.deal_count || 0);
  const managerCount = Number(preview?.manager_count || 0) || ensureArray(payload?.manager_ids).length || 0;
  const periodDays = daysBetween(payload?.period_from, payload?.period_to) || 30;
  const estimatedTokens = Math.max(0, matched * 1200);
  const estimatedCost = Math.max(0, Math.round(matched * 120));
  return {
    estimate: {
      estimated_cost_kzt: estimatedCost,
      estimated_tokens: estimatedTokens,
      interaction_count: matched,
      manager_count: managerCount,
      matched_deal_count: matched,
      period_days: periodDays,
      breakdown: [{ label: "Анализ (live)", value: estimatedCost, unit: "KZT" }],
      source: "live",
    },
  };
}

function getScopeLabel(payload, appState) {
  const launcher = appState?.setup?.analysis_launcher || {};
  const categories = ensureArray(launcher?.available_categories);
  const managers = ensureArray(launcher?.available_managers);

  const categoryIds = ensureArray(payload?.category_ids).map(String);
  const managerIds = ensureArray(payload?.manager_ids).map(String);

  const categoryMap = new Map(categories.map((row) => [String(row?.id), row?.label || `Воронка #${row?.id}`]));
  const managerMap = new Map(managers.map((row) => [String(row?.id), row?.label || `Менеджер #${row?.id}`]));

  const categoryLabel = categoryIds.length
    ? categoryIds.map((id) => categoryMap.get(id) || `Воронка #${id}`).join(", ")
    : "Все воронки";

  const managerLabel = payload?.employee_scope === "selected" && managerIds.length
    ? managerIds.map((id) => managerMap.get(id) || `Менеджер #${id}`).join(", ")
    : "Все сотрудники";

  return `${managerLabel} / ${categoryLabel}`;
}

function upsertRunToAppState(appState, run) {
  const state = appState || {};
  const history = state.history || {};
  const existingRuns = ensureArray(history.runs);
  const runs = [run, ...existingRuns.filter((row) => row?.id !== run.id)];
  return {
    ...state,
    history: {
      ...history,
      latest_run_id: run.id,
      runs,
      summary: {
        ...(history.summary || {}),
        total_runs: runs.length,
        latest_cost_kzt: Number(run?.quote?.estimated_cost_kzt || history?.summary?.latest_cost_kzt || 0),
      },
    },
    latest_run: {
      id: run.id,
      title: run.title,
      scope_label: run.scope_label,
    },
    current_assets: {
      ...(state.current_assets || {}),
      summary_path: run.summary_path,
      interaction_path: run.interaction_path,
      report_path: run.report_path,
    },
    runtime: {
      ...(state.runtime || {}),
      source: "live",
      backend_url: LIVE_BASE_URL,
      refreshed_at: new Date().toISOString(),
    },
  };
}

function buildLiveRun(payload, appState, estimate) {
  const now = new Date();
  const id = `run-live-${now.getTime()}`;
  const scopeLabel = getScopeLabel(payload, appState);
  const activeRun = appState?.latest_run || {};
  const currentAssets = appState?.current_assets || {};
  const summaryPath = activeRun?.summary_path || currentAssets?.summary_path || "./mock-aggregate-summary.json";
  const interactionPath = activeRun?.interaction_path || currentAssets?.interaction_path || "./mock-interaction-index.json";
  const reportPath = activeRun?.report_path || currentAssets?.report_path || "./mock-sales-report.md";

  return {
    id,
    title: `AI аудит: ${scopeLabel}`,
    created_at: now.toISOString(),
    scope_label: scopeLabel,
    filters: {
      period_from: asIsoDate(payload?.period_from),
      period_to: asIsoDate(payload?.period_to),
      manager_ids: ensureArray(payload?.manager_ids).map(String),
      category_ids: ensureArray(payload?.category_ids).map(String),
      channels: ["call", "whatsapp"],
    },
    quote: {
      estimated_cost_kzt: Number(estimate?.estimated_cost_kzt || 0),
      estimated_tokens: Number(estimate?.estimated_tokens || 0),
    },
    summary_path: summaryPath,
    interaction_path: interactionPath,
    report_path: reportPath,
  };
}

async function postLiveEstimate(payload) {
  const whatsappWebhookUrl = requireValue(LIVE_WHATSAPP_WEBHOOK_URL, "VITE_WHATSAPP_WEBHOOK_URL");
  const managerIds = ensureArray(payload?.manager_ids).map(String).filter(Boolean);
  const categoryIds = ensureArray(payload?.category_ids).map(String).filter(Boolean);
  const responsibleId = payload?.employee_scope === "selected" ? managerIds[0] || null : null;

  const preview = await fetchLiveJson("/audit/preview", {
    headers: { "X-Whatsapp-Webhook-Url": whatsappWebhookUrl },
    query: {
      funnel_id: categoryIds,
      date_from: asIsoDate(payload?.period_from),
      date_to: asIsoDate(payload?.period_to),
      responsible_id: responsibleId,
    },
  });

  return buildEstimateFromPreview(preview, payload);
}

async function postLiveRun(payload, appState) {
  const whatsappWebhookUrl = requireValue(LIVE_WHATSAPP_WEBHOOK_URL, "VITE_WHATSAPP_WEBHOOK_URL");
  const openAiKey = requireValue(LIVE_OPENAI_API_KEY, "VITE_OPENAI_API_KEY");
  const managerIds = ensureArray(payload?.manager_ids).map(String).filter(Boolean);
  const categoryIds = ensureArray(payload?.category_ids).map(String).filter(Boolean);
  const responsibleId = payload?.employee_scope === "selected" ? managerIds[0] || null : null;

  const form = new URLSearchParams();
  categoryIds.forEach((id) => form.append("funnel_id", id));
  if (payload?.period_from) form.set("date_from", payload.period_from);
  if (payload?.period_to) form.set("date_to", payload.period_to);
  if (responsibleId) form.set("responsible_id", responsibleId);
  form.set("limit", "0");

  const response = await fetchLiveJson("/audit/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Whatsapp-Webhook-Url": whatsappWebhookUrl,
      "X-OpenAI-Api-Key": openAiKey,
    },
    body: form.toString(),
  });

  const latestEstimate = appState?.analysisQuote || null;
  const estimate = latestEstimate || {
    estimated_cost_kzt: 0,
    estimated_tokens: 0,
  };

  const run = buildLiveRun(payload, appState, estimate);
  const nextAppState = upsertRunToAppState(appState, run);

  return {
    run,
    app_state: nextAppState,
    backend: {
      status: response?.status || "ok",
      source: "live",
    },
  };
}

const MOCK_FALLBACKS = {
  "/api/setup-profile": (payload, appState) => ({
    app_state: {
      ...appState,
      setup: { ...(appState?.setup || {}), business_profile: payload },
    },
  }),
  "/api/analysis/estimate": (payload) => ({
    estimate: {
      estimated_cost_kzt: 4500,
      estimated_tokens: 120000,
      interaction_count: 84,
      manager_count: ensureArray(payload?.manager_ids).length || 3,
      matched_deal_count: 36,
      period_days: 31,
      breakdown: [{ label: "Анализ (мок)", value: 4500, unit: "KZT" }],
      source: "mock",
    },
  }),
  "/api/analysis/runs": (payload, appState) => {
    const run = buildLiveRun(payload, appState, {
      estimated_cost_kzt: 4500,
      estimated_tokens: 120000,
    });
    return {
      run,
      app_state: upsertRunToAppState(appState, run),
      backend: { status: "fallback", source: "mock" },
    };
  },
};

export async function postJson(url, payload, appState) {
  const liveHandlers = {
    "/api/analysis/estimate": () => postLiveEstimate(payload),
    "/api/analysis/runs": () => postLiveRun(payload, appState),
  };

  const liveHandler = liveHandlers[url];
  if (liveHandler && isLiveConfigured()) {
    try {
      return await liveHandler();
    } catch (err) {
      if (!shouldFallback(err)) throw err;
      const mock = MOCK_FALLBACKS[url];
      if (mock) return mock(payload, appState);
      throw err;
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`);
    return res.json();
  } catch (err) {
    const mock = MOCK_FALLBACKS[url];
    if (mock) return mock(payload, appState);
    throw err;
  }
}

export async function loadJsonFromPath(path, cache) {
  const url = normalizeRepoPath(path);
  if (!url) throw new Error("Path is not available");
  if (cache?.has(url)) return cache.get(url);
  const data = await fetchJson(url);
  cache?.set(url, data);
  return data;
}

export { DATA_PATHS, fetchJsonAny, fetchTextAny, fetchJson };
