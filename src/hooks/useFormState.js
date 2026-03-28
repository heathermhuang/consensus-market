import { useEffect, useState } from "react";
import marketSeeds from "../../data/markets.json";
import demoLiveAddresses from "../../demo-live-addresses.json";
import {
  accountStorageKey,
  adminStorageKey,
  buildCreateMarketForm,
  fallbackNow,
  normalizeAddress,
  readStoredAccountProfile,
  readStoredAdminPolicy,
  readStoredPreferences,
  requireAddress,
  uiStorageKey,
} from "../lib/market-utils";

export default function useFormState({ setBanner }) {
  const storedPreferences = readStoredPreferences();

  // ── Board filters ──
  const [query, setQuery] = useState(() => storedPreferences.query || "");
  const [statusFilter, setStatusFilter] = useState(() => storedPreferences.statusFilter || "all");
  const [sortMode, setSortMode] = useState(() => storedPreferences.sortMode || "liquidity");
  const [autoRefresh, setAutoRefresh] = useState(() => storedPreferences.autoRefresh ?? true);

  // ── Account / admin ──
  const [stakeAmount, setStakeAmount] = useState(() => readStoredAccountProfile().defaultStake || "100");
  const [accountProfile, setAccountProfile] = useState(readStoredAccountProfile);
  const [adminPolicy, setAdminPolicy] = useState(readStoredAdminPolicy);
  const [blacklistDraft, setBlacklistDraft] = useState("");

  // ── Oracle / admin forms ──
  const [operatorForm, setOperatorForm] = useState({
    eligibilityAddress: "",
    creditAddress: "",
    creditAmount: "1000",
    reporterAddress: "",
    signerAddress: "",
  });
  const [createMarketForm, setCreateMarketForm] = useState(() => buildCreateMarketForm(marketSeeds[0]));
  const [attestationForm, setAttestationForm] = useState({
    actualValue: "425000",
    sourceLabel: "tesla-q2-2026-release",
    sourceUri: "https://ir.tesla.com",
    observedAt: String(fallbackNow),
    validAfter: "0",
    validBefore: String(fallbackNow + 86400),
    nonce: "1",
  });

  // ── localStorage persistence ──

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      uiStorageKey,
      JSON.stringify({ query, statusFilter, sortMode, autoRefresh })
    );
  }, [autoRefresh, query, sortMode, statusFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(accountStorageKey, JSON.stringify(accountProfile));
    }
  }, [accountProfile]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(adminStorageKey, JSON.stringify(adminPolicy));
    }
  }, [adminPolicy]);

  // ── Form update handlers ──

  function updateAttestation(field, value) {
    setAttestationForm((current) => ({ ...current, [field]: value }));
  }

  function updateOperatorForm(field, value) {
    setOperatorForm((current) => ({ ...current, [field]: value }));
  }

  function updateCreateMarketForm(field, value) {
    setCreateMarketForm((current) => ({ ...current, [field]: value }));
  }

  function updateAccountProfile(field, value) {
    setAccountProfile((current) => ({ ...current, [field]: value }));
  }

  function saveAccountProfile() {
    setStakeAmount(accountProfile.defaultStake || "100");
    setBanner("Saved account preferences for this browser.");
  }

  function applyDemoPreset(type) {
    if (type === "owner") {
      setOperatorForm((current) => ({
        ...current,
        eligibilityAddress: demoLiveAddresses.trader,
        creditAddress: demoLiveAddresses.trader2,
        reporterAddress: demoLiveAddresses.trader,
        signerAddress: demoLiveAddresses.trader2,
      }));
      setBanner("Loaded demo account presets into the operator console.");
      return;
    }
    if (type === "traderA") {
      setOperatorForm((current) => ({
        ...current,
        eligibilityAddress: demoLiveAddresses.trader,
        creditAddress: demoLiveAddresses.trader,
      }));
      setBanner("Loaded Trader A into the operator console.");
      return;
    }
    setOperatorForm((current) => ({
      ...current,
      eligibilityAddress: demoLiveAddresses.trader2,
      creditAddress: demoLiveAddresses.trader2,
    }));
    setBanner("Loaded Trader B into the operator console.");
  }

  function addBlacklistedAddress() {
    let nextAddress = "";
    try {
      nextAddress = normalizeAddress(requireAddress(blacklistDraft, "restricted wallet"));
    } catch (error) {
      setBanner(error.message || "Enter a valid wallet address.");
      return;
    }
    setAdminPolicy((current) => ({
      ...current,
      blacklist: [...new Set([...(current.blacklist || []), nextAddress])],
    }));
    setBlacklistDraft("");
    setBanner(`Added ${nextAddress} to this browser's local restricted list.`);
  }

  function removeBlacklistedAddress(address) {
    setAdminPolicy((current) => ({
      ...current,
      blacklist: (current.blacklist || []).filter((entry) => entry !== normalizeAddress(address)),
    }));
    setBanner(`Removed ${address} from this browser's local restricted list.`);
  }

  function prefillCreateMarketForm(targetMarket) {
    if (!targetMarket) return;
    setCreateMarketForm(buildCreateMarketForm(targetMarket));
    setBanner(`Prefilled the operator market form from ${targetMarket.ticker}.`);
  }

  return {
    // Board filters
    query, setQuery,
    statusFilter, setStatusFilter,
    sortMode, setSortMode,
    autoRefresh, setAutoRefresh,

    // Account / admin
    stakeAmount, setStakeAmount,
    accountProfile, setAccountProfile,
    adminPolicy,
    blacklistDraft, setBlacklistDraft,

    // Forms
    operatorForm,
    createMarketForm,
    attestationForm, setAttestationForm,

    // Update handlers
    updateAttestation,
    updateOperatorForm,
    updateCreateMarketForm,
    updateAccountProfile,
    saveAccountProfile,
    applyDemoPreset,
    addBlacklistedAddress,
    removeBlacklistedAddress,
    prefillCreateMarketForm,
  };
}
