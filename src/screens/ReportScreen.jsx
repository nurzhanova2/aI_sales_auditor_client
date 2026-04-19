import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/index.js";
import {
  ensureArray,
  isTrueLike,
  clampRate,
  normalizeRepoPath,
} from "../utils/index.js";
import {
  formatNumber,
  formatPercent,
  formatMoney,
  formatMinutes,
  formatScore,
} from "../utils/format.js";
import MiniCard from "../components/shared/MiniCard.jsx";

function getManagerName(id) {
  const s = String(id || "").trim();
  if (!s) return "Менеджер не указан";
  return `Менеджер #${s}`;
}

function getWeakestStageLabel(stageMetrics) {
  const stages = ensureArray(stageMetrics?.stages).filter(Boolean);
  if (!stages.length) return "Нет данных";
  const weakest =
    [...stages].sort(
      (a, b) => Number(a?.yes_rate || 0) - Number(b?.yes_rate || 0)
    )[0] || {};
  return `${weakest.label || "Нет данных"} (${formatPercent(weakest.yes_rate || 0)})`;
}

function inlineMarkdown(v) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /`(.+?)`/g,
      '<code class="px-1.5 py-0.5 rounded bg-foreground/10 text-primary">$1</code>'
    );
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "")
    .replace(/\r/g, "")
    .split("\n");
  const html = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }
    if (/^###\s+/.test(trimmed)) {
      closeList();
      html.push(
        `<h3 class="text-lg font-headline font-bold text-foreground mt-6 mb-3">${inlineMarkdown(trimmed.replace(/^###\s+/, ""))}</h3>`
      );
      return;
    }
    if (/^##\s+/.test(trimmed)) {
      closeList();
      html.push(
        `<h2 class="text-2xl font-headline font-bold text-foreground mt-8 mb-4">${inlineMarkdown(trimmed.replace(/^##\s+/, ""))}</h2>`
      );
      return;
    }
    if (/^#\s+/.test(trimmed)) {
      closeList();
      html.push(
        `<h1 class="text-3xl font-headline font-bold text-foreground mt-8 mb-4">${inlineMarkdown(trimmed.replace(/^#\s+/, ""))}</h1>`
      );
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        html.push(
          '<ul class="space-y-2 ml-5 list-disc text-sm text-foreground">'
        );
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      return;
    }
    closeList();
    html.push(
      `<p class="text-sm text-foreground leading-7">${inlineMarkdown(trimmed)}</p>`
    );
  });
  closeList();
  return html.join("");
}

function InlineTable({ columns, rows, emptyText = "Нет данных для отображения." }) {
  const items = ensureArray(rows);
  if (!items.length) {
    return <div className="text-xs text-muted-foreground">{emptyText}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.label}
                className={`px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border ${col.align === "right" ? "text-right" : ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-b-0">
              {columns.map((col) => (
                <td
                  key={col.label}
                  className={`px-3 py-2 align-top ${col.align === "right" ? "text-right" : ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriorityCards({ items, emptyText, tone = "red" }) {
  const rows = ensureArray(items).filter(Boolean);
  if (!rows.length) {
    return <div className="text-xs text-muted-foreground">{emptyText}</div>;
  }
  const accent = {
    red: "border-destructive/30 bg-destructive/5",
    green: "border-primary/30 bg-primary/5",
    yellow: "border-chart-4/30 bg-chart-4/5",
  };
  return (
    <div className="grid grid-cols-1 gap-3">
      {rows.map((item, index) => (
        <article
          key={index}
          className={`rounded border ${accent[tone] || accent.red} p-4`}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <strong className="text-sm text-foreground">
              {item.title || `Пункт ${index + 1}`}
            </strong>
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
              Топ {index + 1}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-6">
            {item.detail || "Нет описания"}
          </p>
        </article>
      ))}
    </div>
  );
}

function StageComplianceBars({ stages }) {
  const rows = ensureArray(stages).filter(Boolean);
  if (!rows.length) {
    return (
      <div className="text-xs text-muted-foreground">
        Нет данных по этапам.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-border bg-muted/20">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Этап
            </th>
            <th className="px-2 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Да
            </th>
            <th className="px-2 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Нет
            </th>
            <th className="px-2 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              ?
            </th>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Прогресс
            </th>
            <th className="px-2 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((stage, i) => {
            const r = clampRate(stage?.yes_rate || 0);
            const colorClass =
              r >= 80
                ? "bg-primary"
                : r >= 60
                ? "bg-chart-4"
                : r > 0
                ? "bg-destructive"
                : "bg-foreground/20";
            return (
              <tr key={i} className="border-b border-border/60 last:border-b-0">
                <td className="px-3 py-2 whitespace-nowrap text-foreground font-medium">
                  {stage.label || "Этап"}
                </td>
                <td className="px-2 py-2 text-right text-foreground">
                  {formatNumber(stage.yes_count || 0)}
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">
                  {formatNumber(stage.no_count || 0)}
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">
                  {formatNumber(stage.unknown_count || 0)}
                </td>
                <td className="px-3 py-2">
                  <div className="w-48 h-2 rounded-full bg-foreground/10 overflow-hidden">
                    <div className={`h-full ${colorClass}`} style={{ width: `${r}%` }} />
                  </div>
                </td>
                <td className="px-2 py-2 text-right text-foreground font-semibold">
                  {Number(r || 0).toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionGuide({ items }) {
  const rows = ensureArray(items).filter(Boolean);
  if (!rows.length) {
    return (
      <div className="text-xs text-muted-foreground">Нет рекомендаций.</div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {rows.map((item, index) => (
        <article
          key={index}
          className="rounded border border-border bg-muted/30 p-3"
        >
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
            Шаг {index + 1}
          </div>
          <p className="text-xs text-foreground leading-6">{item}</p>
        </article>
      ))}
    </div>
  );
}

function resolveDealUrl(item) {
  const direct =
    item?.deal_url ||
    item?.bitrix_url ||
    item?.deal_link ||
    item?.crm_url ||
    item?.url ||
    "";
  if (String(direct || "").trim()) return String(direct).trim();
  const dealId = String(item?.deal_id || "").trim();
  const portal =
    String(item?.bitrix_portal || item?.portal_domain || "").trim() || "";
  if (!dealId || !portal) return "";
  const host = portal.startsWith("http") ? portal : `https://${portal}`;
  return `${host.replace(/\/+$/, "")}/crm/deal/details/${dealId}/`;
}

function getDealLinkLabel(item) {
  if (String(item?.deal_title || "").trim()) return String(item.deal_title).trim();
  if (item?.deal_id) return `Сделка #${item.deal_id}`;
  return "Открыть сделку";
}

function collectStageColumns(departmentStageMetrics, managerRows) {
  const fromDepartment = ensureArray(departmentStageMetrics?.stages)
    .filter(Boolean)
    .map((stage) => ({
      key: String(stage?.code || stage?.label || "").trim(),
      label: stage?.label || "Этап",
    }))
    .filter((stage) => stage.key);
  if (fromDepartment.length) return fromDepartment;

  const seen = new Set();
  const fromManagers = [];
  ensureArray(managerRows).forEach((row) => {
    ensureArray(row?.stages).forEach((stage) => {
      const key = String(stage?.code || stage?.label || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      fromManagers.push({ key, label: stage?.label || "Этап" });
    });
  });
  return fromManagers;
}

function StageComplianceManagerTable({ rows, stageColumns }) {
  const managers = ensureArray(rows).filter(Boolean);
  const columns = ensureArray(stageColumns).filter(Boolean);

  if (!managers.length || !columns.length) {
    return (
      <div className="text-xs text-muted-foreground">
        Нет данных по этапам менеджеров.
      </div>
    );
  }

  const pickStage = (managerRow, key) =>
    ensureArray(managerRow?.stages).find(
      (stage) => String(stage?.code || stage?.label || "").trim() === key
    );

  const getRateTone = (rate) => {
    if (rate >= 70) return "text-primary";
    if (rate >= 45) return "text-chart-4";
    return "text-destructive";
  };

  return (
    <div className="overflow-x-auto rounded border border-border bg-muted/20">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Менеджер
            </th>
            <th className="px-3 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap">
              Среднее
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-3 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border whitespace-nowrap"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {managers.map((row, index) => (
            <tr key={String(row.manager_id || row.manager_label || index)} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2 align-top">
                <ManagerCellButton row={row} />
              </td>
              <td className="px-3 py-2 text-right align-top">
                <span className={`font-semibold ${getRateTone(Number(row.average_rate || 0))}`}>
                  {formatPercent(row.average_rate || 0)}
                </span>
              </td>
              {columns.map((column) => {
                const stage = pickStage(row, column.key);
                const rate = Number(stage?.yes_rate || 0);
                return (
                  <td key={`${String(row.manager_id || row.manager_label)}-${column.key}`} className="px-3 py-2 text-right align-top">
                    <span className={`font-semibold ${getRateTone(rate)}`}>
                      {stage ? formatPercent(rate) : "—"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecoveryCandidates({ items }) {
  const navigate = useNavigate();
  const { setSelectedId } = useStore();
  const rows = ensureArray(items).filter(Boolean);
  if (!rows.length) {
    return (
      <div className="text-xs text-muted-foreground">
        Кандидаты на дожим не найдены.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
              Ссылка на сделку
            </th>
            <th className="px-3 py-2 text-left uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
              Комментарий
            </th>
            <th className="px-3 py-2 text-right uppercase tracking-widest text-[9px] text-muted-foreground border-b border-border">
              Действие
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => {
            const dealUrl = resolveDealUrl(item);
            return (
              <tr key={i} className="border-b border-border/60 last:border-b-0">
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col gap-1">
                    {dealUrl ? (
                      <a
                        href={dealUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-primary hover:text-primary/80 underline decoration-primary/50"
                      >
                        {getDealLinkLabel(item)}
                      </a>
                    ) : (
                      <span className="font-bold text-foreground">
                        {getDealLinkLabel(item)}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {item.manager_label || getManagerName(item.manager_id)} |{" "}
                      {item.reason || "Причина не указана"}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-muted-foreground leading-6">
                  {item.comment || item.summary || "Нет комментария"}
                </td>
                <td className="px-3 py-3 align-top text-right">
                  {item.interaction_id ? (
                    <button
                      className="px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded hover:bg-primary/80 transition-colors"
                      type="button"
                      onClick={() => {
                        setSelectedId(item.interaction_id);
                        navigate("/explorer");
                      }}
                    >
                      Диалог
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ManagerCellButton({ row }) {
  const { setFilters } = useStore();
  const navigate = useNavigate();
  if (!row.manager_id) {
    return (
      <span className="font-bold text-foreground">
        {row.manager_label || "Менеджер"}
      </span>
    );
  }
  return (
    <button
      className="font-bold text-foreground hover:text-primary transition-colors text-left"
      type="button"
      onClick={() => {
        setFilters({ manager: String(row.manager_id) });
        navigate("/explorer");
      }}
    >
      {row.manager_label || getManagerName(row.manager_id)}
    </button>
  );
}

function ReportContent({ summary, markdown }) {
  const snapshot = summary?.report_snapshot || {};
  const [isActionGuideOpen, setIsActionGuideOpen] = useState(false);

  if (!Object.keys(snapshot).length) {
    return (
      <div
        className="prose max-w-none"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown || "") }}
      />
    );
  }

  const rating = snapshot.department_rating || {};
  const dashboard = snapshot.dashboard || {};
  const department = dashboard.department || {};
  const managerRows = ensureArray(dashboard.by_manager);
  const responseSpeed = snapshot.response_speed || {};
  const taskDiscipline = snapshot.task_discipline || {};
  const stageCompliance = snapshot.sales_stage_compliance || {};
  const lossReasons = snapshot.loss_reasons || {};
  const failedDealAnalysis = snapshot.failed_deal_analysis || {};
  const missedRevenue = snapshot.missed_revenue || {};
  const dataQualityNotes = ensureArray(summary.data_quality_notes);
  const markdownBlock = String(markdown || "").trim();
  const showTechnicalBlocks = false;

  const ratingComponents = ensureArray(rating.components);
  const managerStageRows = ensureArray(stageCompliance.by_manager);
  const stageColumns = collectStageColumns(stageCompliance.department, managerStageRows);

  return (
    <div className="flex flex-col gap-5 max-w-[1380px] w-full mx-auto">
      <section className="bg-card border border-border rounded p-4">
        <div className="rounded border border-border bg-muted/15 px-4 py-4">
          <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4 xl:gap-0">
            <div className="pr-0 xl:pr-6 xl:border-r xl:border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Общий рейтинг отдела
              </div>
              <h2 className="font-headline text-5xl font-bold text-foreground leading-none mb-3">
                {formatScore(rating)}
              </h2>
              <p className="text-sm text-muted-foreground leading-7">
                Собран из 4 компонентов: CRM, этапы, реакция, дисциплина.
              </p>
            </div>

            {ratingComponents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 xl:gap-0 xl:pl-4">
                {ratingComponents.map((item, i) => (
                  <div
                    key={i}
                    className="xl:px-4 xl:border-l xl:border-border first:xl:border-l-0"
                  >
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                      {item.label || "Компонент"}
                    </div>
                    <div className="text-4xl font-semibold text-foreground mb-1">
                      {`${formatNumber(item.score_100 || 0)} / 100`}
                    </div>
                    <div className="text-sm text-destructive">
                      {`Вес ${formatNumber(Number(item.weight || 0) * 100)}%`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground xl:pl-4">
                Компоненты рейтинга недоступны.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Дашборд
            </div>
            <h3 className="text-xl font-headline font-bold text-foreground">
              Сделки по отделу и менеджерам
            </h3>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
          {[
            {
              label: "Сделок в работе",
              value: formatNumber(department.in_work_deals || 0),
              note: `из ${formatNumber(department.total_deals || 0)} всех сделок`,
              noteClass: "text-chart-3",
            },
            {
              label: "Успешно",
              value: formatNumber(department.won_deals || 0),
              note: "Закрыто в плюс",
              noteClass: "text-primary",
            },
            {
              label: "Сумма побед",
              value: formatMoney(department.won_amount_kzt || 0),
              note: "Общая сумма выигранных сделок",
              noteClass: "text-chart-4",
            },
            {
              label: "Провалено",
              value: formatNumber(department.lost_deals || 0),
              note: "Закрыто в проигрыш",
              noteClass: "text-destructive",
            },
            {
              label: "Win rate",
              value: formatPercent(department.closed_win_rate || 0),
              note: `${formatNumber(department.closed_deals || 0)} закрытых сделок`,
              noteClass: "text-primary",
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="rounded border border-border bg-muted/20 px-4 py-3"
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                {metric.label}
              </div>
              <div className="text-4xl leading-none font-light text-foreground mb-2">
                {metric.value}
              </div>
              <div className={`text-xs ${metric.noteClass}`}>{metric.note}</div>
            </article>
          ))}
        </div>
        <InlineTable
          columns={[
            { label: "Менеджер", render: (row) => <ManagerCellButton row={row} /> },
            {
              label: "В работе",
              align: "right",
              render: (row) => (
                <span className="text-foreground">{formatNumber(row.in_work_deals || 0)}</span>
              ),
            },
            {
              label: "Успешно",
              align: "right",
              render: (row) => (
                <span className="text-foreground">{formatNumber(row.won_deals || 0)}</span>
              ),
            },
            {
              label: "Сумма",
              align: "right",
              render: (row) => (
                <span className="text-foreground">{formatMoney(row.won_amount_kzt || 0)}</span>
              ),
            },
            {
              label: "Провалено",
              align: "right",
              render: (row) => (
                <span className="text-foreground">{formatNumber(row.lost_deals || 0)}</span>
              ),
            },
            {
              label: "Рейтинг",
              align: "right",
              render: (row) => (
                <span
                  className={`font-bold ${
                    Number(row.rating?.value || 0) >= 7
                      ? "text-primary"
                      : Number(row.rating?.value || 0) >= 5
                      ? "text-chart-4"
                      : "text-destructive"
                  }`}
                >
                  {formatScore(row.rating || {})}
                </span>
              ),
            },
          ]}
          rows={managerRows}
          emptyText="Менеджеры не найдены в текущем срезе."
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Топ-3 проблемы отдела продаж
          </div>
          <PriorityCards
            items={snapshot.top_department_problems}
            emptyText="Проблемы пока не выделены."
            tone="red"
          />
        </article>
        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Топ-3 точки роста отдела продаж
          </div>
          <PriorityCards
            items={snapshot.top_department_growth_points}
            emptyText="Точки роста пока не выделены."
            tone="green"
          />
        </article>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Скорость ответа новым лидам
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            Среднее по отделу:{" "}
            <strong className="text-foreground">
              {formatMinutes(responseSpeed.department?.average_minutes || 0)}
            </strong>
            . Измерено по{" "}
            {formatNumber(responseSpeed.department?.measured_deals || 0)} из{" "}
            {formatNumber(responseSpeed.department?.deal_count || 0)} сделок.
          </p>
          <InlineTable
            columns={[
              { label: "Менеджер", render: (row) => <ManagerCellButton row={row} /> },
              {
                label: "Среднее",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">
                    {formatMinutes(row.average_minutes || 0)}
                  </span>
                ),
              },
            ]}
            rows={responseSpeed.by_manager}
            emptyText="Нет данных по скорости ответа."
          />
        </article>

        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Работа с задачами
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            В работе {formatNumber(taskDiscipline.department?.in_work_deals || 0)}{" "}
            сделок. Активных задач{" "}
            {formatNumber(taskDiscipline.department?.active_task_count || 0)}. Без
            задач{" "}
            {formatNumber(taskDiscipline.department?.deals_without_tasks || 0)}, с
            просрочкой{" "}
            {formatNumber(
              taskDiscipline.department?.deals_with_overdue_tasks || 0
            )}
            .
          </p>
          <InlineTable
            columns={[
              { label: "Менеджер", render: (row) => <ManagerCellButton row={row} /> },
              {
                label: "В работе",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">
                    {formatNumber(row.in_work_deals || 0)}
                  </span>
                ),
              },
              {
                label: "Активных задач",
                align: "right",
                render: (row) => (
                  <span className="text-primary">
                    {formatNumber(row.active_task_count || 0)}
                  </span>
                ),
              },
              {
                label: "Без задач",
                align: "right",
                render: (row) => (
                  <span className="text-destructive">
                    {formatNumber(row.deals_without_tasks || 0)}
                  </span>
                ),
              },
              {
                label: "Просрочено",
                align: "right",
                render: (row) => (
                  <span className="text-chart-4">
                    {formatNumber(row.deals_with_overdue_tasks || 0)}
                  </span>
                ),
              },
            ]}
            rows={taskDiscipline.by_manager}
            emptyText="Нет данных по задачам."
          />
        </article>
      </section>

      <section className="bg-card border border-border rounded p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Соблюдение этапов продаж
        </div>
        <p className="text-sm text-muted-foreground leading-7 mb-4">
          Среднее соблюдение по отделу:{" "}
          <strong className="text-foreground">
            {formatPercent(stageCompliance.department?.average_rate || 0)}
          </strong>
          . Слабое место:{" "}
          <strong className="text-foreground">
            {getWeakestStageLabel(stageCompliance.department || {})}
          </strong>
          .
        </p>
        <div className="grid grid-cols-1 gap-5">
          <StageComplianceBars stages={stageCompliance.department?.stages} />
          <div className="rounded border border-border bg-muted/20 p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
              По менеджерам
            </div>
            <StageComplianceManagerTable
              rows={managerStageRows}
              stageColumns={stageColumns}
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Самые частые причины слива лидов
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            По отделу в проигрыш ушло{" "}
            <strong className="text-foreground">
              {formatNumber(lossReasons.department?.lost_deals || 0)}
            </strong>{" "}
            сделок.
          </p>
          <InlineTable
            columns={[
              {
                label: "Причина",
                render: (row) => (
                  <span className="text-foreground">{row.name || "Не указано"}</span>
                ),
              },
              {
                label: "Кол-во",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">{formatNumber(row.count || 0)}</span>
                ),
              },
              {
                label: "Доля",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">{formatPercent(row.rate || 0)}</span>
                ),
              },
            ]}
            rows={lossReasons.department?.reasons_top}
            emptyText="Причины слива пока не определены."
          />
          <div className="mt-5 text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            По менеджерам
          </div>
          <InlineTable
            columns={[
              { label: "Менеджер", render: (row) => <ManagerCellButton row={row} /> },
              {
                label: "Провалено",
                align: "right",
                render: (row) => (
                  <span className="text-foreground">{formatNumber(row.lost_deals || 0)}</span>
                ),
              },
              {
                label: "Главная причина",
                render: (row) => (
                  <span className="text-muted-foreground">
                    {(ensureArray(row.reasons_top)[0] || {}).name || "Нет данных"}
                  </span>
                ),
              },
            ]}
            rows={lossReasons.by_manager}
            emptyText="Нет данных по менеджерам."
          />
        </article>

        <article className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Анализ проваленных сделок
          </div>
          <p className="text-sm text-muted-foreground leading-7 mb-4">
            Ниже сделки, которые можно вернуть в работу точечным follow-up. Ссылка
            ведет в карточку сделки Bitrix24, рядом комментарий — почему ее стоит
            вернуть в работу.
          </p>
          <RecoveryCandidates items={failedDealAnalysis.recovery_candidates} />
        </article>
      </section>

      <section className="bg-card border border-border rounded p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          Упущенная выгода
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <MiniCard
            label="Проваленных сделок"
            value={formatNumber(missedRevenue.lost_deals || 0)}
            note="База расчета"
            tone="red"
          />
          <MiniCard
            label="Средняя конверсия"
            value={formatPercent(missedRevenue.average_conversion_rate || 0)}
            note="По закрытым сделкам"
            tone="green"
          />
          <MiniCard
            label="Средний чек"
            value={formatMoney(missedRevenue.average_ticket_kzt || 0)}
            note="Используется в формуле"
            tone="yellow"
          />
          <MiniCard
            label="Не заработано"
            value={formatMoney(
              missedRevenue.estimated_missed_revenue_kzt || 0
            )}
            note={
              missedRevenue.formula ||
              "Проигранные сделки × средняя конверсия × средний чек"
            }
            tone="violet"
          />
        </div>
        <p className="text-xs text-muted-foreground leading-6">
          {missedRevenue.formula ||
            "Проигранные сделки × средняя конверсия × средний чек"}
          .
        </p>
      </section>

      <section className="bg-card border border-border rounded p-4">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-3 text-left"
          onClick={() => setIsActionGuideOpen((prev) => !prev)}
        >
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Руководство к действию
          </div>
          <span className="text-[10px] uppercase tracking-widest text-primary font-bold">
            {isActionGuideOpen ? "Свернуть −" : "Развернуть +"}
          </span>
        </button>
        {isActionGuideOpen && (
          <div className="mt-3">
            <ActionGuide items={snapshot.action_guide} />
          </div>
        )}
      </section>

      {showTechnicalBlocks && dataQualityNotes.length > 0 && (
        <section className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Примечания к данным
          </div>
          <div className="grid grid-cols-1 gap-3">
            {dataQualityNotes.map((item, i) => (
              <article
                key={i}
                className="rounded border border-border bg-muted/30 p-4"
              >
                <p className="text-xs text-muted-foreground leading-6">{item}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {showTechnicalBlocks && markdownBlock && (
        <section className="bg-card border border-border rounded p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Текстовая версия отчета
          </div>
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(markdownBlock) }}
          />
        </section>
      )}
    </div>
  );
}

function EvidenceCard({ title, rows, tone }) {
  const navigate = useNavigate();
  const { setSelectedId } = useStore();
  const TONES = {
    ok: "bg-primary/20 text-primary",
    neutral: "bg-chart-3/20 text-chart-3",
    warning: "bg-chart-4/20 text-chart-4",
    danger: "bg-destructive/20 text-destructive",
  };
  return (
    <article className="bg-card border border-border rounded p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-border">
        <strong className="text-[10px] font-bold uppercase tracking-widest text-foreground">
          {title}
        </strong>
        <span
          className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${TONES[tone]}`}
        >
          {formatNumber(rows.length)} примеров
        </span>
      </div>
      <div className="flex flex-col gap-4 flex-1">
        {rows.map((item) => (
          <div key={item.interaction_id} className="bg-muted/30 p-3 rounded">
            <div className="flex justify-between items-start gap-2 mb-2">
              <button
                className="text-xs font-bold text-foreground hover:text-primary text-left transition-colors truncate block flex-1"
                type="button"
                onClick={() => {
                  setSelectedId(item.interaction_id);
                  navigate("/explorer");
                }}
              >
                {item.primary_topic || "Без темы"}
              </button>
              <span className="px-1.5 py-0.5 text-[8px] bg-foreground/5 border border-border rounded uppercase font-bold text-muted-foreground">
                {item.channel}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 mb-2">
              {item.summary || "Нет summary"}
            </p>
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider truncate">
              {getManagerName(item.manager_id)} | {item.outcome_status || "не указано"}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function ReportScreen() {
  const { summary, reportMarkdown, getActiveRun } = useStore();

  const s = summary || {};
  const activeRun = getActiveRun();
  const reportSnapshot = s.report_snapshot || {};
  const departmentDashboard = reportSnapshot.dashboard?.department || {};
  const departmentRating = reportSnapshot.department_rating || {};
  const taskDiscipline = reportSnapshot.task_discipline || {};

  const filters = activeRun?.filters || activeRun?.quote?.filters || {};
  const periodFrom = String(filters.period_from || "").trim();
  const periodTo = String(filters.period_to || "").trim();
  const periodLabel =
    periodFrom || periodTo
      ? `${periodFrom || "…"} - ${periodTo || "…"}`
      : "Текущий период";
  const ratingValue = Number(departmentRating?.value || 0);
  const ratingTrend = ratingValue >= 5 ? "↑" : "↓";

  const headerParams = [
    { label: "Период", value: periodLabel, tone: "text-chart-3" },
    { label: "Оценка", value: `${formatScore(departmentRating)} ${ratingTrend}`, tone: ratingValue >= 5 ? "text-primary" : "text-destructive" },
    {
      label: "Сделки",
      value: formatNumber(
        departmentDashboard.in_work_deals || s?.crm_context?.open_deals || 0
      ),
      tone: "text-foreground",
    },
    {
      label: "Задачи",
      value: formatNumber(taskDiscipline.department?.active_task_count || 0),
      tone: "text-chart-4",
    },
    {
      label: "Ошибки",
      value: formatNumber(
        departmentDashboard.lost_deals || s?.crm_context?.lost_deals || 0
      ),
      tone: "text-destructive",
    },
  ];

  const targetExamples = ensureArray(s.examples?.target_examples).slice(0, 3);
  const actionableExamples = ensureArray(s.examples?.actionable_examples).slice(0, 3);
  const awaitingExamples = ensureArray(s.examples?.awaiting_response_examples).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[1380px] w-full mx-auto">
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          Параметры отчета
        </h2>
        <div className="rounded border border-border bg-card/70 px-3 py-2.5">
          <div className="flex flex-wrap items-stretch gap-2">
            {headerParams.map((item) => (
              <div
                key={item.label}
                className="min-w-[170px] flex-1 rounded border border-border bg-muted/20 px-3 py-2"
              >
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                  {item.label}
                </div>
                <div className={`text-sm font-semibold ${item.tone}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1380px] w-full mx-auto">
        <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
          Содержание отчета
        </h2>
        <ReportContent summary={s} markdown={reportMarkdown || ""} />
      </section>

      {(targetExamples.length > 0 ||
        actionableExamples.length > 0 ||
        awaitingExamples.length > 0) && (
        <section className="max-w-[1380px] w-full mx-auto">
          <h2 className="text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground mb-4">
            Примеры из данных
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EvidenceCard
              title="Целевые примеры"
              rows={targetExamples}
              tone="ok"
            />
            <EvidenceCard
              title="Примеры с движением"
              rows={actionableExamples}
              tone="neutral"
            />
            <EvidenceCard
              title="Клиент ждет ответа"
              rows={awaitingExamples}
              tone="danger"
            />
          </div>
        </section>
      )}
    </div>
  );
}
