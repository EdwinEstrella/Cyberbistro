import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type VentaCartSearchValue = {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
};

const VentaCartSearchContext = createContext<VentaCartSearchValue | null>(null);

export function VentaCartSearchProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: VentaCartSearchValue;
}) {
  return (
    <VentaCartSearchContext.Provider value={value}>
      {children}
    </VentaCartSearchContext.Provider>
  );
}

export function useVentaCartSearch(): VentaCartSearchValue {
  const ctx = useContext(VentaCartSearchContext);
  if (!ctx) {
    throw new Error("useVentaCartSearch debe usarse dentro de VentaCartSearchProvider");
  }
  return ctx;
}
