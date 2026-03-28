import { createContext, useContext } from "react";

const RuntimeContext = createContext(null);

export function RuntimeProvider({ children, value }) {
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntimeContext() {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error("useRuntimeContext must be used within RuntimeProvider");
  return ctx;
}
