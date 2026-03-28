import { createContext, useContext } from "react";

const WalletContext = createContext(null);

export function WalletProvider({ children, value }) {
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletContext() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletContext must be used within WalletProvider");
  return ctx;
}
