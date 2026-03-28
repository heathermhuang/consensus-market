import { useEffect, useState } from "react";
import { ethers } from "ethers";
import marketSeeds from "../../data/markets.json";
import { buildMarketId, marketAbi, oracleAbi, registryAbi } from "../contracts";
import { deriveWindow } from "../lib/market-utils";

export default function useOnChainSync({ wallet, runtimeConfig, autoRefresh, hasLiveContracts, configuredRpcUrls, hasConfiguredRpc, hasRuntimeRpc, setBanner }) {
  const [marketState, setMarketState] = useState({});
  const [credits, setCredits] = useState(null);
  const [systemStatus, setSystemStatus] = useState({
    rpcHealthy: false,
    marketOwner: "",
    oracleOwner: "",
    registryOwner: "",
    walletEligible: false,
    walletReporter: false,
    walletSigner: false,
    statusCheckedAt: null,
  });
  const [activeRpcUrl, setActiveRpcUrl] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const walletOnExpectedChain = wallet.chainId === runtimeConfig.chainId;

  async function refreshOnChain() {
    const readProviders = [];
    if (hasRuntimeRpc) {
      for (const rpcUrl of configuredRpcUrls) {
        readProviders.push({ provider: new ethers.JsonRpcProvider(rpcUrl), rpcUrl });
      }
    }
    if (wallet.provider && (walletOnExpectedChain || !hasRuntimeRpc)) {
      readProviders.push({ provider: wallet.provider, rpcUrl: "wallet" });
    }

    for (const candidate of readProviders) {
      try {
        const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, candidate.provider);
        const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, candidate.provider);
        const registryContract = new ethers.Contract(runtimeConfig.registryAddress, registryAbi, candidate.provider);
        const traderAccount = wallet.account || ethers.ZeroAddress;
        const nextState = {};

        for (const seed of marketSeeds) {
          const marketId = buildMarketId(seed.idSeed);
          const [marketData, resolution, myPosition, myStake] = await Promise.all([
            marketContract.getMarket(marketId),
            oracleContract.getResolution(marketId),
            marketContract.positions(marketId, traderAccount),
            marketContract.stakes(marketId, traderAccount),
          ]);
          nextState[seed.slug] = {
            exists: marketData.exists,
            cancelled: marketData.cancelled,
            settled: marketData.settled,
            outcomeHit: marketData.outcomeHit,
            consensusValue: Number(marketData.consensusValue),
            consensusSource: marketData.consensusSource,
            opensAt: Number(marketData.opensAt),
            locksAt: Number(marketData.locksAt),
            expectedAnnouncementAt: Number(marketData.expectedAnnouncementAt),
            hitPool: marketData.hitPool,
            missPool: marketData.missPool,
            actualValue: resolution.actualValue,
            sourceUri: resolution.sourceUri,
            attestationDigest: resolution.attestationDigest,
            signer: resolution.signer,
            myPosition: Number(myPosition),
            myStake,
          };
        }

        const [
          marketOwner, oracleOwner, registryOwner,
          walletEligible, walletReporter, walletSigner, nextCredits,
        ] = await Promise.all([
          marketContract.owner(),
          oracleContract.owner(),
          registryContract.owner(),
          wallet.account ? registryContract.isEligible(traderAccount) : false,
          wallet.account ? oracleContract.authorizedReporters(traderAccount) : false,
          wallet.account ? oracleContract.authorizedSigners(traderAccount) : false,
          wallet.account ? marketContract.demoCredits(traderAccount) : null,
        ]);

        setMarketState(nextState);
        setSystemStatus({
          rpcHealthy: true, marketOwner, oracleOwner, registryOwner,
          walletEligible, walletReporter, walletSigner, statusCheckedAt: Date.now(),
        });
        setActiveRpcUrl(candidate.rpcUrl);
        setCredits(nextCredits);
        setLastSyncAt(Date.now());
        return;
      } catch { continue; }
    }

    // All candidates failed — fall back to scenario mode
    const nextState = {};
    for (const seed of marketSeeds) {
      nextState[seed.slug] = { ...deriveWindow(seed), hitPool: 0n, missPool: 0n, myPosition: 0, myStake: 0n };
    }
    setMarketState(nextState);
    setSystemStatus({
      rpcHealthy: false, marketOwner: "", oracleOwner: "", registryOwner: "",
      walletEligible: false, walletReporter: false, walletSigner: false, statusCheckedAt: Date.now(),
    });
    setActiveRpcUrl("");
    setCredits(null);
    setLastSyncAt(null);
  }

  // ── Periodic refresh ──
  useEffect(() => {
    if (!hasLiveContracts) return undefined;
    void refreshOnChain();
    if (!autoRefresh) return undefined;
    const intervalId = window.setInterval(() => void refreshOnChain(), 15000);
    return () => window.clearInterval(intervalId);
  }, [
    wallet.account,
    wallet.chainId,
    runtimeConfig.chainId,
    runtimeConfig.marketAddress,
    runtimeConfig.oracleAddress,
    runtimeConfig.registryAddress,
    runtimeConfig.rpcUrl,
    autoRefresh,
  ]);

  // ── Banner status ──
  useEffect(() => {
    if (hasLiveContracts && systemStatus.rpcHealthy) {
      setBanner(
        `Live market contracts are online on Ethereum chain ${runtimeConfig.chainId}. Connect a wallet to trade, review positions, or use the admin portal.`
      );
      return;
    }
    if (hasLiveContracts && hasConfiguredRpc) {
      setBanner(
        "Contracts are configured, but the live RPC is currently unavailable. The board is running in scenario mode until sync returns."
      );
      return;
    }
    if (runtimeConfig.marketAddress && runtimeConfig.oracleAddress) {
      setBanner(
        "Market and oracle contracts are configured. Add the registry address and a healthy RPC URL to unlock the full operator workflow."
      );
      return;
    }
    setBanner(
      "Frontend is live in scenario mode. Wallet connection is available, and live actions will switch on once contract addresses and RPC are healthy."
    );
  }, [
    hasLiveContracts,
    hasConfiguredRpc,
    hasRuntimeRpc,
    runtimeConfig.chainId,
    runtimeConfig.marketAddress,
    runtimeConfig.oracleAddress,
    systemStatus.rpcHealthy,
  ]);

  return {
    marketState,
    credits,
    systemStatus,
    activeRpcUrl,
    lastSyncAt,
    refreshOnChain,
  };
}
