import { useEffect, useState } from "react";

export default function useDataFetchers({ selectedMarketSlug }) {
  const [activityFeed, setActivityFeed] = useState([]);
  const [companyNews, setCompanyNews] = useState({
    loading: false,
    articles: [],
    updatedAt: "",
    query: "",
    error: "",
  });

  // ── Activity feed fetch ──
  useEffect(() => {
    let cancelled = false;
    async function loadActivity() {
      try {
        const response = await fetch("/activity.json", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setActivityFeed(Array.isArray(data.events) ? data.events.slice(0, 8) : []);
      } catch {
        if (!cancelled) setActivityFeed([]);
      }
    }
    void loadActivity();
    return () => { cancelled = true; };
  }, []);

  // ── Company news fetch ──
  useEffect(() => {
    let cancelled = false;
    if (!selectedMarketSlug) {
      setCompanyNews({ loading: false, articles: [], updatedAt: "", query: "", error: "" });
      return () => { cancelled = true; };
    }
    async function loadCompanyNews() {
      setCompanyNews({ loading: true, articles: [], updatedAt: "", query: "", error: "" });
      try {
        const response = await fetch(`/news.json?market=${selectedMarketSlug}`, { cache: "no-store" });
        if (!response.ok) throw new Error("News feed unavailable");
        const data = await response.json();
        if (cancelled) return;
        setCompanyNews({
          loading: false,
          articles: Array.isArray(data.articles) ? data.articles.slice(0, 4) : [],
          updatedAt: data.updatedAt || "",
          query: data.query || "",
          error: "",
        });
      } catch {
        if (cancelled) return;
        setCompanyNews({
          loading: false,
          articles: [],
          updatedAt: "",
          query: "",
          error: "Live company news is unavailable right now.",
        });
      }
    }
    void loadCompanyNews();
    return () => { cancelled = true; };
  }, [selectedMarketSlug]);

  return { activityFeed, companyNews };
}
