import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  connectInjectedWallet as connectInjectedProvider,
  connectWalletConnect as connectWalletConnectSession,
  disconnectWalletConnectProvider,
  getWalletConnectProvider,
  resetWalletSession,
} from "../walletConnect";
import { buildEmptyWallet, toHexChainId } from "../lib/market-utils";

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";
const walletChoiceLabels = {
  browser: "Browser wallet",
  metamask: "MetaMask",
  rabby: "Rabby",
  coinbase: "Coinbase Wallet",
  mobile: "Mobile Wallet / QR",
};

export default function useWallet({ runtimeConfig, configuredRpcUrls, setBanner }) {
  const [wallet, setWallet] = useState(buildEmptyWallet);
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const configuredRpcKey = configuredRpcUrls.join(",");

  // ── Wallet restore ──
  useEffect(() => {
    let cancelled = false;
    async function restoreWalletSession() {
      if (typeof window === "undefined") return;
      try {
        if (window.ethereum) {
          const restored = await refreshWalletFromConnector(window.ethereum, "injected");
          if (restored || cancelled) return;
        }
      } catch { /* continue to WalletConnect restore */ }
      try {
        const walletConnectProvider = await getWalletConnectProvider({
          projectId: walletConnectProjectId,
          chainId: runtimeConfig.chainId || 1,
          rpcUrls: configuredRpcUrls,
        });
        if (cancelled) return;
        if (walletConnectProvider?.session && walletConnectProvider.accounts?.length) {
          await refreshWalletFromConnector(walletConnectProvider, "walletconnect");
        }
      } catch { /* optional */ }
    }
    void restoreWalletSession();
    return () => { cancelled = true; };
  }, [configuredRpcKey, runtimeConfig.chainId]);

  // ── Provider event listeners ──
  useEffect(() => {
    const rawProvider = wallet.rawProvider;
    if (!rawProvider?.on) return undefined;
    const onAccountsChanged = () => void refreshWalletFromConnector(rawProvider, wallet.connector || "injected");
    const onChainChanged = () => void refreshWalletFromConnector(rawProvider, wallet.connector || "injected");
    const onDisconnect = () => {
      setWallet(buildEmptyWallet());
      setConnectModalOpen(false);
      setBanner("Wallet disconnected.");
    };
    rawProvider.on("accountsChanged", onAccountsChanged);
    rawProvider.on("chainChanged", onChainChanged);
    rawProvider.on?.("disconnect", onDisconnect);
    return () => {
      rawProvider.removeListener?.("accountsChanged", onAccountsChanged);
      rawProvider.removeListener?.("chainChanged", onChainChanged);
      rawProvider.removeListener?.("disconnect", onDisconnect);
    };
  }, [wallet.connector, wallet.rawProvider]);

  // ── Wallet helpers ──

  async function refreshWalletFromConnector(rawProvider, connector, requestAccounts = false) {
    if (!rawProvider) { setWallet(buildEmptyWallet()); return false; }
    const provider = new ethers.BrowserProvider(rawProvider);
    if (requestAccounts) {
      if (connector === "walletconnect" && typeof rawProvider.enable === "function") {
        await rawProvider.enable();
      } else {
        await provider.send("eth_requestAccounts", []);
      }
    }
    const accounts = await provider.listAccounts();
    const network = await provider.getNetwork();
    if (accounts.length === 0) {
      setWallet({ provider, rawProvider, signer: null, account: "", chainId: Number(network.chainId), connector });
      return false;
    }
    const signer = await provider.getSigner();
    setWallet({ provider, rawProvider, signer, account: accounts[0].address, chainId: Number(network.chainId), connector });
    return true;
  }

  async function ensureRuntimeChain(rawProvider = wallet.rawProvider) {
    if (!rawProvider) return;
    const chainIdHex = toHexChainId(runtimeConfig.chainId || 1);
    try {
      await rawProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
      return;
    } catch (error) {
      if (error?.code !== 4902 || !configuredRpcUrls.length) throw error;
    }
    await rawProvider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainIdHex,
        chainName: "Ethereum Mainnet",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: configuredRpcUrls,
      }],
    });
  }

  async function connectInjectedWallet(preferredWallet = "browser") {
    try {
      await resetWalletSession();
      const injectedProvider = await connectInjectedProvider({ preferredWallet });
      await refreshWalletFromConnector(injectedProvider, "injected", true);
      await ensureRuntimeChain(injectedProvider);
      await refreshWalletFromConnector(injectedProvider, "injected");
      setConnectModalOpen(false);
      const connectedLabel =
        preferredWallet === "metamask" ? "MetaMask"
        : preferredWallet === "rabby" ? "Rabby"
        : preferredWallet === "coinbase" ? "Coinbase Wallet"
        : "Browser wallet";
      setBanner(`${connectedLabel} connected on Ethereum. Account, market, and admin surfaces are now available.`);
      return true;
    } catch (error) {
      setBanner(error.message || "Wallet connection failed.");
      throw error;
    }
  }

  async function connectWalletConnect({ selectedWallet = "mobile", onDisplayUri } = {}) {
    try {
      await resetWalletSession();
      const walletConnectProvider = await connectWalletConnectSession({
        projectId: walletConnectProjectId,
        chainId: runtimeConfig.chainId || 1,
        rpcUrls: configuredRpcUrls,
        onDisplayUri,
        metadata: {
          name: "Consensus Market",
          description: "Prediction Market that bests Street Consensus",
          url: typeof window !== "undefined" ? window.location.origin : "https://consensusmarket.com",
          icons: [`${typeof window !== "undefined" ? window.location.origin : "https://consensusmarket.com"}/company-logos/coinbase.svg`],
        },
      });
      await refreshWalletFromConnector(walletConnectProvider, "walletconnect", true);
      await ensureRuntimeChain(walletConnectProvider);
      await refreshWalletFromConnector(walletConnectProvider, "walletconnect");
      setConnectModalOpen(false);
      setBanner(`${walletChoiceLabels[selectedWallet] || "WalletConnect"} session established on Ethereum. You can now review positions or trade where live actions are available.`);
      return true;
    } catch (error) {
      setBanner(error.message || "Wallet connection failed.");
      throw error;
    }
  }

  async function disconnectWallet() {
    try {
      if (wallet.connector === "walletconnect") await disconnectWalletConnectProvider();
      await resetWalletSession();
      setWallet(buildEmptyWallet());
      setConnectModalOpen(false);
      setBanner("Wallet disconnected.");
    } catch (error) {
      setBanner(error.message || "Could not disconnect the wallet cleanly.");
    }
  }

  async function connectDemoChain() {
    if (!wallet.rawProvider) { setBanner("Connect a wallet first."); return; }
    try {
      await ensureRuntimeChain(wallet.rawProvider);
      await refreshWalletFromConnector(wallet.rawProvider, wallet.connector || "injected");
      setBanner("Wallet switched to Ethereum.");
    } catch (error) {
      setBanner(error.message || "Network switch failed.");
    }
  }

  return {
    wallet,
    connectModalOpen, setConnectModalOpen,
    connectInjectedWallet,
    connectWalletConnect,
    disconnectWallet,
    connectDemoChain,
  };
}
