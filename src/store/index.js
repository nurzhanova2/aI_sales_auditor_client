import { create } from "zustand";
import { fetchJsonAny, fetchTextAny, fetchJson, postJson, DATA_PATHS } from "../api/index.js";
import { ensureArray, normalizeRepoPath } from "../utils/index.js";

const useStore = create((set, get) => ({
  appState: null,
  baseSummary: null,
  baseInteractions: [],
  summary: null,
  interactions: [],
  reportMarkdown: "",
  usageSummary: null,
  usageEvents: [],
  activeRunId: null,
  selectedId: null,
  analysisQuote: null,
  analysisQuoteRequestKey: "",
  filters: {
    search: "",
    channel: "all",
    relevance: "all",
    outcome: "all",
    manager: "all",
  },
  featureCache: new Map(),
  sourceCache: new Map(),
  isLoading: false,
  error: null,

  setFilters: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),

  setSelectedId: (id) => set({ selectedId: id }),

  setAnalysisQuote: (quote, key) =>
    set({ analysisQuote: quote, analysisQuoteRequestKey: key }),

  clearAnalysisQuote: () =>
    set({ analysisQuote: null, analysisQuoteRequestKey: "" }),

  getActiveRun: () => {
    const { appState, activeRunId } = get();
    const runs = ensureArray(appState?.history?.runs);
    return (
      runs.find((r) => r.id === activeRunId) ||
      appState?.latest_run ||
      null
    );
  },

  activateRunData: async (runId) => {
    const { appState, baseSummary, baseInteractions } = get();
    if (runId) set({ activeRunId: runId });

    const getActiveRun = () => {
      const id = runId || get().activeRunId;
      const runs = ensureArray(appState?.history?.runs);
      return runs.find((r) => r.id === id) || appState?.latest_run || null;
    };

    const run = getActiveRun();

    const loadSummary = async () => {
      const p = run?.summary_path || appState?.current_assets?.summary_path;
      const url = normalizeRepoPath(p);
      if (!url) return baseSummary;
      try { return await fetchJson(url); } catch { return baseSummary; }
    };

    const loadInteractions = async () => {
      if (run && !run.interaction_path) return fallbackRunInteractions(run, baseInteractions);
      const p = run?.interaction_path || appState?.current_assets?.interaction_path;
      const url = normalizeRepoPath(p);
      if (!url) return fallbackRunInteractions(run, baseInteractions);
      try { return ensureArray(await fetchJson(url)); }
      catch { return fallbackRunInteractions(run, baseInteractions); }
    };

    const loadReport = async () => {
      const p = run?.report_path || appState?.current_assets?.report_path;
      const url = normalizeRepoPath(p);
      if (!url) return "";
      try {
        const res = await fetch(url, { cache: "no-store" });
        return res.ok ? res.text() : "";
      } catch { return ""; }
    };

    const [summary, interactions, markdown] = await Promise.all([
      loadSummary(),
      loadInteractions(),
      loadReport(),
    ]);

    set((s) => ({
      summary: summary || s.baseSummary,
      interactions: ensureArray(interactions),
      reportMarkdown: markdown || s.reportMarkdown,
      selectedId: ensureArray(interactions)[0]?.interaction_id || null,
      filters: {
        search: "",
        channel: "all",
        relevance: "all",
        outcome: "all",
        manager: "all",
      },
    }));
  },

  refreshAppState: async () => {
    const { activeRunId, activateRunData } = get();
    const appState = await fetchJsonAny(DATA_PATHS.appState).catch(
      () => get().appState
    );
    const newRunId =
      activeRunId ||
      appState?.history?.latest_run_id ||
      appState?.latest_run?.id ||
      null;
    set({ appState, activeRunId: newRunId });
    await activateRunData(newRunId);
  },

  init: async () => {
    set({ isLoading: true, error: null });
    try {
      const [appState, summary, interactions, reportMarkdown, usageSummary, usageEvents] =
        await Promise.all([
          fetchJsonAny(DATA_PATHS.appState).catch(() => null),
          fetchJsonAny(DATA_PATHS.summary).catch(() => null),
          fetchJsonAny(DATA_PATHS.interactions).catch(() => []),
          fetchTextAny(DATA_PATHS.report).catch(() => ""),
          fetchJsonAny(DATA_PATHS.usageSummary).catch(() => null),
          fetchJsonAny(DATA_PATHS.usageEvents).catch(() => []),
        ]);

      const interactionArr = ensureArray(interactions);
      const runId =
        appState?.history?.latest_run_id || appState?.latest_run?.id || null;

      set({
        appState,
        baseSummary: summary,
        baseInteractions: interactionArr,
        summary,
        interactions: interactionArr,
        reportMarkdown,
        usageSummary,
        usageEvents: ensureArray(usageEvents),
        activeRunId: runId,
        selectedId: interactionArr[0]?.interaction_id || null,
        isLoading: false,
      });

      if (runId) await get().activateRunData(runId);
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  saveBusinessProfile: async (payload) => {
    const { appState } = get();
    const res = await postJson("/api/setup-profile", payload, appState);
    set({ appState: res.app_state || appState });
    return res;
  },

  estimateAnalysis: async (request) => {
    const { appState } = get();
    const res = await postJson("/api/analysis/estimate", request, appState);
    return res.estimate || null;
  },

  createAnalysisRun: async (request) => {
    const { appState, activateRunData } = get();
    const res = await postJson("/api/analysis/runs", request, appState);
    set({
      analysisQuote: res.run?.quote || get().analysisQuote,
      appState: res.app_state || appState,
    });
    await activateRunData(res.run?.id || get().activeRunId);
    return res.run;
  },
}));

function fallbackRunInteractions(run, baseInteractions) {
  const rows = ensureArray(baseInteractions);
  if (!run?.filters) return rows;
  return rows.filter((row) => {
    const f = run.filters || {};
    const mids = ensureArray(f.manager_ids).map(String);
    const cids = ensureArray(f.category_ids).map(String);
    const createdAt = row.created_at ? String(row.created_at).slice(0, 10) : "";
    if (mids.length && !mids.includes(String(row.manager_id || ""))) return false;
    if (cids.length && !cids.includes(String(row.deal_category_id || ""))) return false;
    if (f.period_from && createdAt && createdAt < f.period_from) return false;
    if (f.period_to && createdAt && createdAt > f.period_to) return false;
    return true;
  });
}

export default useStore;
