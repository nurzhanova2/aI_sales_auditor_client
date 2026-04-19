import { ensureArray, normalizeRepoPath } from "../utils/index.js";

const DATA_PATHS = {
  appState: ["/api/app-state", "mock-app-state.json"],
  summary: ["mock-aggregate-summary.json"],
  interactions: ["mock-interaction-index.json"],
  report: ["mock-sales-report.md"],
  usageSummary: ["mock-usage-summary.json"],
  usageEvents: ["mock-usage-events.json"],
};

async function fetchJson(path) {
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
    },
  }),
  "/api/analysis/runs": (payload, appState) => ({
    run: {
      id: "run-fallback",
      quote: { estimated_cost_kzt: 4500, estimated_tokens: 120000 },
    },
    app_state: appState,
  }),
};

export async function postJson(url, payload, appState) {
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
