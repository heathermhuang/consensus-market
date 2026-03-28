import { startTransition, useEffect, useState } from "react";
import { jumpToTop, parseRouteFromHash } from "../lib/market-utils";

export default function useRouting({ canAccessAccount, canAccessAdmin, wallet, setBanner, setConnectModalOpen, allMarkets, setAttestationForm }) {
  const initialRoute = parseRouteFromHash();

  const [appView, setAppView] = useState(initialRoute.view);
  const [selectedSlug, setSelectedSlug] = useState(initialRoute.slug);
  const [marketSurface, setMarketSurface] = useState("overview");
  const [pendingSectionId, setPendingSectionId] = useState("");
  const [activeMarketSection, setActiveMarketSection] = useState("market-overview");

  // ── Slug validation ──
  useEffect(() => {
    if (selectedSlug && !allMarkets.some((market) => market.slug === selectedSlug)) {
      setSelectedSlug(null);
    }
  }, [allMarkets, selectedSlug]);

  // ── Fallback to board when no slug in market view ──
  useEffect(() => {
    if (appView === "market" && !selectedSlug) setAppView("board");
  }, [appView, selectedSlug]);

  // ── Access gating ──
  useEffect(() => {
    if (appView === "account" && !canAccessAccount) {
      setAppView(selectedSlug ? "market" : "board");
      setConnectModalOpen(true);
      setBanner("Connect a wallet to access the account page.");
      return;
    }
    if (appView === "admin" && !canAccessAdmin) {
      setAppView(selectedSlug ? "market" : "board");
      setBanner(
        wallet.account
          ? "This wallet is not authorized for the admin portal."
          : "Connect an authorized admin wallet to access the admin portal."
      );
    }
  }, [appView, canAccessAccount, canAccessAdmin, selectedSlug, wallet.account]);

  // ── Surface access gating ──
  useEffect(() => {
    if (marketSurface === "admin" && !canAccessAdmin) {
      setMarketSurface("overview");
      setPendingSectionId("");
    }
  }, [canAccessAdmin, marketSurface]);

  // ── Hashchange listener ──
  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = parseRouteFromHash();
      setAppView(nextRoute.view);
      setSelectedSlug(nextRoute.slug);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // ── Hash sync ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (appView === "board" && !selectedSlug) {
      if (window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      return;
    }
    let nextHash = "";
    if (appView === "market" && selectedSlug) nextHash = `#market=${selectedSlug}`;
    else if (appView === "account") nextHash = "#page=account";
    else if (appView === "admin")
      nextHash = selectedSlug ? `#page=admin&market=${selectedSlug}` : "#page=admin";
    else if (appView === "terms") nextHash = "#page=terms";
    else if (appView === "privacy") nextHash = "#page=privacy";
    if (!nextHash) return;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${nextHash}`
      );
    }
  }, [appView, selectedSlug]);

  // ── Jump-to-top ──
  useEffect(() => {
    if (typeof window !== "undefined") jumpToTop();
  }, [appView, selectedSlug]);

  // ── Surface reset on slug change ──
  useEffect(() => {
    setMarketSurface("overview");
  }, [selectedSlug]);

  // ── Scroll-to-section ──
  useEffect(() => {
    if (!selectedSlug) return;
    if (!pendingSectionId) { jumpToTop(); return; }
    const timerId = window.setTimeout(() => {
      const section = document.getElementById(pendingSectionId);
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      else jumpToTop();
      setPendingSectionId("");
    }, 40);
    return () => window.clearTimeout(timerId);
  }, [marketSurface, pendingSectionId, selectedSlug]);

  // ── Navigation handlers ──

  function handleSelectMarket(market) {
    if (!market) return;
    jumpToTop();
    startTransition(() => {
      setAppView("market");
      setSelectedSlug(market.slug);
      setAttestationForm((current) => ({ ...current, sourceUri: market.sourceUrl }));
    });
  }

  function clearSelectedMarket() {
    jumpToTop();
    startTransition(() => { setAppView("board"); setSelectedSlug(null); });
  }

  function openBoardView() {
    setPendingSectionId("");
    clearSelectedMarket();
  }

  function openAccountView() {
    if (!canAccessAccount) {
      setBanner("Connect a wallet to access the account page.");
      setConnectModalOpen(true);
      return;
    }
    jumpToTop();
    setConnectModalOpen(false);
    startTransition(() => setAppView("account"));
  }

  function openAdminPortal() {
    if (!wallet.account) {
      setBanner("Connect an authorized admin wallet to access the admin portal.");
      setConnectModalOpen(true);
      return;
    }
    if (!canAccessAdmin) {
      setBanner("This wallet is not authorized for the admin portal.");
      return;
    }
    jumpToTop();
    setConnectModalOpen(false);
    startTransition(() => {
      setAppView("admin");
      if (!selectedSlug && allMarkets[0]) setSelectedSlug(allMarkets[0].slug);
    });
  }

  function openMarketSurface(surface, sectionId = "") {
    if (surface === "admin" && !canAccessAdmin) {
      setBanner(
        wallet.account
          ? "This wallet is not authorized for admin controls."
          : "Connect an authorized admin wallet to open admin controls."
      );
      if (!wallet.account) setConnectModalOpen(true);
      return;
    }
    if (surface !== marketSurface) startTransition(() => setMarketSurface(surface));
    if (sectionId) setActiveMarketSection(sectionId);
    setPendingSectionId(sectionId);
    if (surface === marketSurface && sectionId) {
      const section = document.getElementById(sectionId);
      if (section) { section.scrollIntoView({ behavior: "smooth", block: "start" }); setPendingSectionId(""); }
    }
  }

  return {
    appView,
    selectedSlug, setSelectedSlug,
    marketSurface,
    activeMarketSection,
    handleSelectMarket,
    clearSelectedMarket,
    openBoardView,
    openAccountView,
    openAdminPortal,
    openMarketSurface,
  };
}
