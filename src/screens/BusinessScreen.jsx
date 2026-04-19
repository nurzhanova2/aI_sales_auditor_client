import React, { useState, useEffect, useRef } from "react";
import useStore from "../store/index.js";
import { ensureArray } from "../utils/index.js";

export default function BusinessScreen() {
  const appState = useStore((s) => s.appState);
  const saveBusinessProfile = useStore((s) => s.saveBusinessProfile);

  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [priceList, setPriceList] = useState("");
  const [averageTicket, setAverageTicket] = useState("");
  const [advantages, setAdvantages] = useState("");
  const [promotions, setPromotions] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  const initialized = useRef(false);

  useEffect(() => {
    const profile = appState?.setup?.business_profile;
    if (!profile) return;
    if (initialized.current) return;
    initialized.current = true;
    setCompanyName(profile.company_name || "");
    setWebsiteUrl(profile.website_url || "");
    setInstagramUrl(profile.instagram_url || "");
    setPriceList(profile.price_list || "");
    setAverageTicket(profile.average_ticket_kzt ? String(profile.average_ticket_kzt) : "");
    setAdvantages(profile.advantages || "");
    setPromotions(profile.promotions || "");
  }, [appState]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveStatus("Сохраняю анкету бизнеса...");
    try {
      await saveBusinessProfile({
        company_name: companyName,
        website_url: websiteUrl,
        instagram_url: instagramUrl,
        price_list: priceList,
        average_ticket_kzt: averageTicket ? Number(averageTicket) : null,
        advantages,
        promotions,
      });
      setSaveStatus("Анкета бизнеса сохранена.");
    } catch (err) {
      setSaveStatus(`Ошибка сохранения: ${err.message}`);
    }
  };

  const integrations = ensureArray(appState?.setup?.integrations);

  return (
    <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-6">
      <div className="flex flex-col gap-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Интеграции</div>
        {integrations.map((item, i) => {
          const isConnected = item.status === "connected";
          const isPlanned = item.status === "planned";
          const tone = isConnected
            ? "border-primary/30 text-primary"
            : isPlanned
            ? "border-chart-4/30 text-chart-4"
            : "border-destructive/30 text-destructive";
          const label = isConnected ? "Подключено" : isPlanned ? "Скоро" : "Не подключено";
          return (
            <article key={i} className="bg-card border border-border rounded p-4">
              <div className="flex justify-between items-start gap-3 mb-3">
                <strong className="text-foreground text-sm">{item.label}</strong>
                <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-widest ${tone}`}>{label}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-6">{item.description || ""}</p>
            </article>
          );
        })}
      </div>

      <div className="@3xl:col-span-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Анкета бизнеса</div>
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded p-6 space-y-5">
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Название вашей компании
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Сайт
              <input
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Instagram
              <input
                type="text"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground">
              Средний чек (тенге)
              <input
                type="text"
                value={averageTicket}
                onChange={(e) => setAverageTicket(e.target.value)}
                className="bg-input border border-border rounded px-3 py-2 text-foreground"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground @3xl:col-span-2">
              Прайс-лист / описание услуг
              <textarea
                value={priceList}
                onChange={(e) => setPriceList(e.target.value)}
                rows={4}
                className="bg-input border border-border rounded px-3 py-2 text-foreground resize-y"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground @3xl:col-span-2">
              Преимущества компании
              <textarea
                value={advantages}
                onChange={(e) => setAdvantages(e.target.value)}
                rows={3}
                className="bg-input border border-border rounded px-3 py-2 text-foreground resize-y"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-muted-foreground @3xl:col-span-2">
              Акции и специальные предложения
              <textarea
                value={promotions}
                onChange={(e) => setPromotions(e.target.value)}
                rows={3}
                className="bg-input border border-border rounded px-3 py-2 text-foreground resize-y"
              />
            </label>
          </div>
          <div className="flex flex-col @3xl:flex-row @3xl:items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest"
            >
              Сохранить анкету бизнеса
            </button>
            <div className="text-xs text-muted-foreground">{saveStatus}</div>
          </div>
        </form>
      </div>
    </div>
  );
}
