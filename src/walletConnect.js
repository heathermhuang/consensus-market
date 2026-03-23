const OPTIONAL_CHAINS = [1];

let walletConnectProviderInstance = null;
let walletConnectProviderPromise = null;
let activeInjectedProvider = null;
let activeCallbacks = {
  onDisplayUri: null,
};

function normalizeChainId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    if (value.startsWith("0x")) {
      const parsedHex = Number.parseInt(value, 16);
      return Number.isFinite(parsedHex) ? parsedHex : null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resetProviderState() {
  walletConnectProviderInstance = null;
  walletConnectProviderPromise = null;
  activeInjectedProvider = null;
  if (activeCallbacks.onDisplayUri) {
    activeCallbacks.onDisplayUri("");
  }
}

async function hardResetProvider() {
  if (walletConnectProviderInstance?.session) {
    try {
      await walletConnectProviderInstance.disconnect();
    } catch {
      // Ignore disconnect errors from stale sessions.
    }
  }
  resetProviderState();
}

function buildMetadata(metadata) {
  const safeMetadata = metadata || {};
  const origin = safeMetadata.url || window.location.origin;
  return {
    name: safeMetadata.name || "Consensus Market",
    description: safeMetadata.description || "Prediction Market that bests Street Consensus",
    url: origin,
    icons: safeMetadata.icons || [`${origin}/company-logos/coinbase.svg`],
  };
}

function getInjectedProviders() {
  if (typeof window === "undefined") return [];

  const ethereum = window.ethereum;
  if (!ethereum) return [];

  if (Array.isArray(ethereum.providers) && ethereum.providers.length) {
    return ethereum.providers.filter((provider) => provider && typeof provider.request === "function");
  }

  if (typeof ethereum.request === "function") {
    return [ethereum];
  }

  return [];
}

function matchesPreferredWallet(provider, preferredWallet) {
  if (!provider || !preferredWallet) return false;
  const key = String(preferredWallet).toLowerCase();

  if (key === "metamask") {
    return Boolean(provider.isMetaMask && !provider.isRabby && !provider.isCoinbaseWallet);
  }
  if (key === "rabby") {
    return Boolean(provider.isRabby);
  }
  if (key === "coinbase") {
    return Boolean(provider.isCoinbaseWallet);
  }
  if (key === "browser") {
    return true;
  }

  return false;
}

export function getInjectedProvider(preferredWallet) {
  const providers = getInjectedProviders();
  if (!providers.length) return null;

  if (preferredWallet) {
    const matched = providers.find((provider) => matchesPreferredWallet(provider, preferredWallet));
    return matched || null;
  }

  const preferredOrder = ["metamask", "rabby", "coinbase"];
  for (const key of preferredOrder) {
    const matched = providers.find((provider) => matchesPreferredWallet(provider, key));
    if (matched) return matched;
  }

  return providers[0] || null;
}

export function getAvailableInjectedWallets() {
  const providers = getInjectedProviders();
  const labels = [];

  providers.forEach((provider) => {
    if (matchesPreferredWallet(provider, "metamask")) labels.push("MetaMask");
    else if (matchesPreferredWallet(provider, "rabby")) labels.push("Rabby");
    else if (matchesPreferredWallet(provider, "coinbase")) labels.push("Coinbase Wallet");
    else labels.push("Browser wallet");
  });

  return Array.from(new Set(labels));
}

export async function getWalletConnectProvider({ projectId, chainId, rpcUrls = [], metadata, onDisplayUri, forceNew = false }) {
  if (typeof window === "undefined") {
    throw new Error("WalletConnect is only available in the browser.");
  }

  if (!projectId) {
    throw new Error("Missing WalletConnect project ID.");
  }

  if (typeof onDisplayUri === "function") {
    activeCallbacks.onDisplayUri = onDisplayUri;
  }

  if (forceNew) {
    await hardResetProvider();
  }

  if (walletConnectProviderInstance) {
    return walletConnectProviderInstance;
  }

  if (!walletConnectProviderPromise) {
    walletConnectProviderPromise = import("@walletconnect/ethereum-provider")
      .then(async ({ EthereumProvider }) =>
        EthereumProvider.init({
          projectId,
          optionalChains: OPTIONAL_CHAINS.includes(Number(chainId) || 1)
            ? OPTIONAL_CHAINS
            : [...OPTIONAL_CHAINS, Number(chainId) || 1],
          showQrModal: false,
          rpcMap: rpcUrls[0] ? { [Number(chainId) || 1]: rpcUrls[0] } : undefined,
          methods: [
            "eth_accounts",
            "eth_requestAccounts",
            "eth_sendTransaction",
            "eth_signTypedData_v4",
            "personal_sign",
            "wallet_switchEthereumChain",
          ],
          events: ["accountsChanged", "chainChanged", "disconnect", "connect"],
          metadata: buildMetadata(metadata),
        })
      )
      .then((provider) => {
        provider.on("display_uri", (uri) => {
          if (activeCallbacks.onDisplayUri) {
            activeCallbacks.onDisplayUri(uri || "");
          }
        });
        provider.on("connect", () => {
          if (activeCallbacks.onDisplayUri) {
            activeCallbacks.onDisplayUri("");
          }
        });
        provider.on("disconnect", resetProviderState);
        provider.on("session_delete", resetProviderState);
        walletConnectProviderInstance = provider;
        return provider;
      })
      .catch((error) => {
        resetProviderState();
        throw error;
      });
  }

  return walletConnectProviderPromise;
}

export async function connectWalletConnect(options) {
  const provider = await getWalletConnectProvider({ ...(options || {}), forceNew: true });
  if (!provider.session) {
    await provider.connect();
  }
  return provider;
}

export async function connectInjectedWallet({ preferredWallet } = {}) {
  const provider = getInjectedProvider(preferredWallet);
  if (!provider) {
    if (preferredWallet && preferredWallet !== "browser") {
      throw new Error("That browser wallet was not detected. Install it or use another wallet option.");
    }
    throw new Error("No browser wallet was detected. Install MetaMask, Rabby, or Coinbase Wallet, or use Mobile Wallet / QR.");
  }

  activeInjectedProvider = provider;
  return provider;
}

export async function disconnectWalletConnectProvider() {
  if (!walletConnectProviderPromise && !walletConnectProviderInstance) return;

  try {
    const provider = walletConnectProviderInstance || (await walletConnectProviderPromise);
    if (provider?.disconnect) {
      await provider.disconnect();
    }
  } finally {
    resetProviderState();
  }
}

export async function resetWalletSession() {
  await hardResetProvider();
}
