export const fallbackConfig = {
  chainId: Number(import.meta.env.VITE_CHAIN_ID || 1),
  marketAddress: import.meta.env.VITE_MARKET_ADDRESS || "",
  oracleAddress: import.meta.env.VITE_ORACLE_ADDRESS || "",
  registryAddress: import.meta.env.VITE_REGISTRY_ADDRESS || "",
  operatorAddress: import.meta.env.VITE_OPERATOR_ADDRESS || "",
  rpcConfigured: Boolean(import.meta.env.VITE_RPC_URL || import.meta.env.VITE_RPC_URLS),
  rpcAvailable: Boolean(import.meta.env.VITE_RPC_URL || import.meta.env.VITE_RPC_URLS),
  rpcUrl: import.meta.env.VITE_RPC_URL || "",
  rpcUrls: (import.meta.env.VITE_RPC_URLS || import.meta.env.VITE_RPC_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};

export async function loadRuntimeConfig() {
  try {
    const response = await fetch("/runtime-config.json", { cache: "no-store" });
    if (!response.ok) {
      return fallbackConfig;
    }

    const data = await response.json();
    const rpcUrls = Array.isArray(data.rpcUrls)
      ? data.rpcUrls.filter(Boolean)
      : (data.rpcUrl || fallbackConfig.rpcUrl || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

    return {
      chainId: Number(data.chainId || fallbackConfig.chainId),
      marketAddress: data.marketAddress || "",
      oracleAddress: data.oracleAddress || "",
      registryAddress: data.registryAddress || "",
      operatorAddress: data.operatorAddress || "",
      rpcConfigured: Boolean(data.rpcConfigured ?? (rpcUrls.length > 0 || fallbackConfig.rpcConfigured)),
      rpcAvailable: Boolean(data.rpcAvailable ?? (rpcUrls.length > 0 || fallbackConfig.rpcAvailable)),
      rpcUrl: data.rpcUrl || rpcUrls[0] || fallbackConfig.rpcUrl,
      rpcUrls: rpcUrls.length > 0 ? rpcUrls : fallbackConfig.rpcUrls,
    };
  } catch {
    return fallbackConfig;
  }
}
