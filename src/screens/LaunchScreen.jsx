import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import { ensureArray } from "../utils/index.js";
import { formatNumber, formatPercent } from "../utils/format.js";
import MiniCard from "../components/shared/MiniCard.jsx";

function buildRequestKey({ employeeScope, periodFrom, periodTo, managerIds, categoryIds }) {
  const mids = [...managerIds].map(String).sort();
  const cids = [...categoryIds].map(String).sort();
  return JSON.stringify({ employee_scope: employeeScope, period_from: periodFrom, period_to: periodTo, manager_ids: mids, category_ids: cids });
}

function LatestRunPanel({ latestRun, historySummary, openRunReport }) {
  const navigate = useNavigate();

  if (!latestRun?.id) {
    return (
      <article className="bg-card border border-border rounded-xl p-5 text-xs text-muted-foreground leading-6">
        История запусков пока пустая. После первого AI аудита здесь появится быстрый вход в последний отчет.
      </article>
    );
  }

  return (
    <article className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Последний отчет</div>
        <h3 className="text-lg font-headline font-bold text-foreground">{latestRun.title || latestRun.scope_label || latestRun.id}</h3>
        <p className="text-xs text-muted-foreground mt-2">{latestRun.scope_label || ""}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MiniCard label="Доля целевых" value={formatPercent(historySummary.latest_target_rate)} note="По последнему запуску" tone="green" />
        <MiniCard label="Выявление потребности" value={formatPercent(historySummary.latest_need_identified_rate)} note="По последнему запуску" tone="cyan" />
      </div>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="px-4 py-2 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest"
          onClick={() => openRunReport(latestRun.id)}
        >
          Открыть отчет
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded bg-foreground/5 border border-border text-foreground text-xs font-bold uppercase tracking-widest"
          onClick={() => navigate("/history")}
        >
          Открыть историю
        </button>
      </div>
    </article>
  );
}

export default function LaunchScreen() {
  const navigate = useNavigate();
  const appState = useStore((s) => s.appState);
  const estimateAnalysis = useStore((s) => s.estimateAnalysis);
  const createAnalysisRun = useStore((s) => s.createAnalysisRun);
  const activateRunData = useStore((s) => s.activateRunData);

  const launcher = appState?.setup?.analysis_launcher || {};
  const defaultFilters = launcher.default_filters || {};
  const availableManagers = ensureArray(launcher.available_managers);
  const availableCategories = ensureArray(launcher.available_categories);
  const defaultCategoryId = ensureArray(defaultFilters.category_ids)[0] || availableCategories[0]?.id || "";

  const [categoryId, setCategoryId] = useState("");
  const [employeeScope, setEmployeeScope] = useState("all");
  const [selectedManagerIds, setSelectedManagerIds] = useState(new Set());
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteKey, setQuoteKey] = useState("");
  const [quoteStatus, setQuoteStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!launcher || Object.keys(launcher).length === 0) return;
    const allowed = new Set(availableCategories.map((c) => String(c.id)));
    const resolvedCategory = allowed.has(String(defaultCategoryId)) ? String(defaultCategoryId) : "";
    setCategoryId((prev) => prev || resolvedCategory);
    setPeriodFrom((prev) => prev || defaultFilters.period_from || launcher.date_range?.from || "");
    setPeriodTo((prev) => prev || defaultFilters.period_to || launcher.date_range?.to || "");
    const defaultScope = availableManagers.length ? (defaultFilters.employee_scope || "all") : "all";
    setEmployeeScope((prev) => prev || defaultScope);
    const defaultMids = ensureArray(defaultFilters.manager_ids).map(String);
    setSelectedManagerIds((prev) => prev.size ? prev : new Set(defaultMids));
  }, [launcher]);

  const clearQuote = () => {
    setQuote(null);
    setQuoteKey("");
    setQuoteStatus("idle");
  };

  const handleCategoryChange = (val) => {
    setCategoryId(val);
    clearQuote();
  };

  const handleScopeChange = (val) => {
    setEmployeeScope(val);
    clearQuote();
  };

  const handleManagerToggle = (id) => {
    setSelectedManagerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    clearQuote();
  };

  const handlePeriodFromChange = (val) => {
    setPeriodFrom(val);
    clearQuote();
  };

  const handlePeriodToChange = (val) => {
    setPeriodTo(val);
    clearQuote();
  };

  const collectRequest = () => {
    const managerIds = employeeScope === "selected" ? [...selectedManagerIds].map(String) : [];
    return {
      employee_scope: employeeScope,
      period_from: periodFrom,
      period_to: periodTo,
      manager_ids: managerIds,
      category_ids: categoryId ? [categoryId] : [],
    };
  };

  const currentKey = () => {
    const managerIds = employeeScope === "selected" ? selectedManagerIds : new Set();
    const categoryIds = categoryId ? new Set([categoryId]) : new Set();
    return buildRequestKey({ employeeScope, periodFrom, periodTo, managerIds, categoryIds });
  };

  const isQuoteFresh = quote !== null && quoteKey === currentKey();

  const validateForm = () => {
    if (!categoryId) return "Выберите воронку для анализа.";
    if (employeeScope === "selected" && selectedManagerIds.size === 0) return "Выберите хотя бы одного сотрудника.";
    if (periodFrom && periodTo && periodFrom > periodTo) return "Дата начала не может быть позже даты окончания.";
    return null;
  };

  const handleEstimate = async () => {
    const validationError = validateForm();
    if (validationError) {
      setStatusMessage(validationError);
      return;
    }
    setQuoteStatus("loading");
    setStatusMessage("Считаю объем данных и стоимость запуска...");
    try {
      const request = collectRequest();
      const result = await estimateAnalysis(request);
      const key = buildRequestKey({
        employeeScope,
        periodFrom,
        periodTo,
        managerIds: employeeScope === "selected" ? selectedManagerIds : new Set(),
        categoryIds: categoryId ? new Set([categoryId]) : new Set(),
      });
      setQuote(result);
      setQuoteKey(key);
      setQuoteStatus("ready");
      setStatusMessage("");
    } catch (err) {
      setQuoteStatus("error");
      setStatusMessage(`Ошибка расчета: ${err.message}`);
    }
  };

  const handleRun = async () => {
    if (!isQuoteFresh) {
      await handleEstimate();
      return;
    }
    const validationError = validateForm();
    if (validationError) {
      setStatusMessage(validationError);
      return;
    }
    setStatusMessage("Запускаю AI аудит и собираю новый отчет...");
    try {
      const request = collectRequest();
      const run = await createAnalysisRun(request);
      navigate("/report");
    } catch (err) {
      setStatusMessage(`Ошибка запуска: ${err.message}`);
    }
  };

  const openRunReport = async (runId) => {
    await activateRunData(runId);
    navigate("/report");
  };

  const latestRun = appState?.latest_run || {};
  const historySummary = appState?.history?.summary || {};

  return (
    <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-6">
      <div className="@3xl:col-span-2 space-y-5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Запуск AI аудита</div>
        <div className="bg-card border border-border rounded p-6 space-y-5">
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Воронка продаж
              <select
                value={categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              >
                {availableCategories.length ? (
                  availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label} ({formatNumber(cat.interaction_count || cat.deal_count || 0)})
                    </option>
                  ))
                ) : (
                  <option value="">Нет доступных воронок</option>
                )}
              </select>
            </label>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              Период анализа
              <div className="flex gap-2">
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => handlePeriodFromChange(e.target.value)}
                  className="bg-input border border-border rounded px-3 py-2 text-foreground flex-1 min-w-0"
                />
                <input
                  type="date"
                  value={periodTo}
                  onChange={(e) => handlePeriodToChange(e.target.value)}
                  className="bg-input border border-border rounded px-3 py-2 text-foreground flex-1 min-w-0"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            Сотрудники
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="employeeScope"
                  value="all"
                  checked={employeeScope === "all"}
                  onChange={() => handleScopeChange("all")}
                  className="accent-primary"
                />
                <span className="text-foreground">Все сотрудники</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="employeeScope"
                  value="selected"
                  checked={employeeScope === "selected"}
                  onChange={() => handleScopeChange("selected")}
                  className="accent-primary"
                />
                <span className="text-foreground">Выборочно</span>
              </label>
            </div>
          </div>

          <div className={`${employeeScope !== "selected" ? "hidden" : ""} bg-muted/30 border border-border rounded-xl p-4 space-y-3`}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Выборочные сотрудники</div>
            {availableManagers.length ? (
              <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-3">
                {availableManagers.map((m) => (
                  <label key={m.id} className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3 text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedManagerIds.has(String(m.id))}
                      onChange={() => handleManagerToggle(String(m.id))}
                      className="mt-1 accent-primary"
                    />
                    <span className="flex flex-col gap-1">
                      <span className="font-bold text-sm">{m.label}</span>
                      <span className="text-[11px] text-muted-foreground">{formatNumber(m.interaction_count)} обращений в выборке</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Сотрудники для выбора пока не найдены в текущих данных.</div>
            )}
          </div>

          <div className="flex flex-col @3xl:flex-row @3xl:items-center gap-3">
            <button
              type="button"
              onClick={handleEstimate}
              disabled={quoteStatus === "loading"}
              className="px-4 py-2 rounded bg-foreground/5 border border-border text-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-50"
            >
              Оценить объем
            </button>
            {isQuoteFresh && (
              <button
                type="button"
                onClick={handleRun}
                className="px-4 py-2 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest"
              >
                Запустить AI аудит
              </button>
            )}
            {!isQuoteFresh && quote !== null && (
              <button
                type="button"
                onClick={handleRun}
                className="px-4 py-2 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest"
              >
                Запустить AI аудит
              </button>
            )}
            {statusMessage && (
              <div className="text-xs text-muted-foreground">{statusMessage}</div>
            )}
          </div>
        </div>

        {quote ? (
          <article className="bg-muted/30 border border-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap gap-6 items-start">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Стоимость анализа</div>
                <div className="text-3xl font-headline font-bold text-foreground">{formatNumber(quote.estimated_cost_kzt)} ₸</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Токены</div>
                <div className="text-3xl font-headline font-bold text-primary">{formatNumber(quote.estimated_tokens)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
              <MiniCard label="Обращения" value={formatNumber(quote.interaction_count || 0)} note="Войдут в расчет" tone="cyan" />
              <MiniCard label="Сотрудники" value={formatNumber(quote.manager_count || 0)} note="Попадут в аудит" tone="green" />
              <MiniCard label="Сделки" value={formatNumber(quote.matched_deal_count || 0)} note="Связаны с выборкой" tone="yellow" />
              <MiniCard label="Период" value={`${formatNumber(quote.period_days || 0)} дн.`} note="По полю «Дата создания»" tone="violet" />
            </div>
            {ensureArray(quote.breakdown).length > 0 && (
              <div className="grid grid-cols-2 @3xl:grid-cols-3 gap-3">
                {ensureArray(quote.breakdown).map((item, i) => (
                  <MiniCard
                    key={i}
                    label={item.label}
                    value={`${formatNumber(item.value)} ${item.unit === "KZT" ? "₸" : item.unit}`}
                    note="Компонент цены"
                    tone="yellow"
                  />
                ))}
              </div>
            )}
            {(quote.charge_policy_note || launcher.charge_policy_note) && (
              <p className="text-xs text-muted-foreground leading-6">{quote.charge_policy_note || launcher.charge_policy_note}</p>
            )}
            {isQuoteFresh ? (
              <p className="text-xs text-primary leading-6">Оценка рассчитана. Кнопка запуска AI аудита отдела продаж теперь активна.</p>
            ) : (
              <p className="text-xs text-chart-4 leading-6">Параметры были изменены после расчета. Пересчитайте стоимость заново.</p>
            )}
            {quote.warning && (
              <p className="text-xs text-destructive leading-6">{quote.warning}</p>
            )}
          </article>
        ) : (
          <article className="bg-muted/30 border border-border rounded-xl p-5 text-xs text-muted-foreground leading-6">
            Сначала нажмите «Оценить объем данных для оценки». После расчета дашборд покажет сумму в тенге, токены и отдельно откроет кнопку запуска AI аудита.
          </article>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Последний запуск</div>
        <LatestRunPanel latestRun={latestRun} historySummary={historySummary} openRunReport={openRunReport} />
      </div>
    </div>
  );
}
