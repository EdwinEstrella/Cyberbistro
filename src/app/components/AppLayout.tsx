import { useState, useEffect, useMemo } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";

import { VentaCartSearchProvider } from "../context/VentaCartSearchContext";
import { useSucursal } from "../context/SucursalContext";
import svgPaths from "../../imports/svg-qgatbhef3k";
import { TitleBar } from "../../features/window";
import { insforgeClient } from "../../shared/lib/insforge";
import { useAuth } from "../../shared/hooks/useAuth";
import {
  canAccessCocinaRoute,
  normalizeTenantRol,
  showAjustesInSidebar,
  showSoporteInSidebar,
} from "../../shared/lib/roleNav";
import { RoleGuard } from "./RoleGuard";
import { useAppUpdate } from "../../features/updates/AppUpdateContext";
import { LocalFirstStatusBadge } from "../../shared/components/LocalFirstStatusBadge";
import { useLocalFirstBootstrap } from "../../shared/hooks/useLocalFirstBootstrap";

const mainNavItems = [
  { label: "Venta", customIcon: "venta", path: "/dashboard" },
  { label: "Camarera", customIcon: "camarera", path: "/camarera" },
  { label: "Mesas", customIcon: "mesas", path: "/tables" },
  { label: "Cocina", customIcon: "cocina", path: "/cocina" },
  { label: "Entregas", customIcon: "entregas", path: "/entregas" },
  { label: "Analíticas", icon: svgPaths.p30837e80, viewBox: "0 0 18 18", path: "/billing" },
  { label: "Gastos", customIcon: "gastos", path: "/gastos" },
  { label: "Cierre", customIcon: "cierre", path: "/cierre" },
  { label: "Inventario", customIcon: "inventario", path: "/inventario" },
] as const;

const soporteNavItem = {
  label: "Soporte",
  icon: svgPaths.p18c14180,
  viewBox: "0 0 20 16",
  path: "/soporte",
} as const;

const routePrefetchers: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => import("../../features/dashboard"),
  "/tables": () => import("../../features/tables"),
  "/billing": () => import("../../features/billing"),
  "/gastos": () => import("../../features/gastos"),
  "/cierre": () => import("../../features/cierre"),
  "/cocina": () => import("../../features/cocina"),
  "/entregas": () => import("../../features/entregas"),
  "/camarera": () => import("../../features/camarera"),
  "/soporte": () => import("../../features/soporte"),
  "/ajustes": () => import("../../features/ajustes"),
};

function prefetchRoute(path: string) {
  void routePrefetchers[path]?.();
}

function filterMainNavForRol(rol: string | null, _plan: string | null) {
  const normalized = normalizeTenantRol(rol);
  let items = [...mainNavItems];

  if (normalized === "admin") return items;
  if (normalized === "cocina") return items.filter((i) => i.path === "/cocina");
  if (normalized === "cajera") {
    const allow = ["/dashboard", "/tables", "/gastos", "/cierre"] as const;
    return items.filter((i) => allow.includes(i.path as (typeof allow)[number]));
  }
  if (normalized === "mesero") {
    const allow = ["/camarera", "/entregas"] as const;
    return items.filter((i) => allow.includes(i.path as (typeof allow)[number]));
  }
  return items.filter((i) => i.path === "/dashboard");
}

function SidebarCustomIcon({ name }: { name: "gastos" | "cocina" | "entregas" | "mesas" | "cierre" | "venta" | "camarera" | "inventario" }) {
  if (name === "inventario") {
    return (
      <svg className="shrink-0 size-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    );
  }

  if (name === "camarera") {
    return (
      <svg className="shrink-0 size-[20px]" fill="none" viewBox="0 0 48 48" aria-hidden>
        <rect width="48" height="48" fill="white" fillOpacity="0.01" />
        <path d="M33.0499 7H38C39.1046 7 40 7.89543 40 9V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42L8 9C8 7.89543 8.89543 7 10 7H16H17V10H31V7H33.0499Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <rect x="17" y="4" width="14" height="6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M26.9996 19L19 27.0012H29.004L21.0003 35.0018" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "venta") {
    return (
      <svg className="shrink-0 size-[20px]" fill="none" viewBox="0 0 24 24" aria-hidden>
        <path d="M3.92969 15.8792L15.8797 3.9292" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.1013 18.2791L12.3013 17.0791" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.793 15.5887L16.183 13.1987" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.60127 10.239L10.2413 3.599C12.3613 1.479 13.4213 1.469 15.5213 3.569L20.4313 8.479C22.5313 10.579 22.5213 11.639 20.4013 13.759L13.7613 20.399C11.6413 22.519 10.5813 22.529 8.48127 20.429L3.57127 15.519C1.47127 13.419 1.47127 12.369 3.60127 10.239Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 21.9985H22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "cierre") {
    return (
      <svg className="shrink-0 size-[20px]" fill="none" viewBox="0 0 24 24" aria-hidden>
        <path d="M14 7h-2.5A1.5 1.5 0 0 0 10 8.5A1.5 1.5 0 0 0 11.5 10h1A1.5 1.5 0 0 1 14 11.5A1.5 1.5 0 0 1 12.5 13H10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 6v1m0 6v1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <line x1="6" y1="21" x2="18" y2="21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <rect x="3" y="3" width="18" height="14" rx="1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "mesas") {
    return (
      <svg className="shrink-0 size-[20px]" fill="currentColor" viewBox="0 0 50 50" aria-hidden>
        <path d="M10.585938 11L0.38085938 21.205078A1.0001 1.0001 0 0 0 .18945312 21.396484L0 21.585938V21.832031A1.0001 1.0001 0 0 0 0 22.158203V28H3V50H9V28H11V43H17V28H33V43H39V28H41V50H47V28H50V22.167969A1.0001 1.0001 0 0 0 50 21.841797V21.585938L49.806641 21.392578A1.0001 1.0001 0 0 0 49.623047 21.207031A1.0001 1.0001 0 0 0 49.617188 21.203125L39.414062 11H39H10.585938zM11.414062 13H38.585938L46.585938 21H3.4140625L11.414062 13zM2 23H48V26H46.167969A1.0001 1.0001 0 0 0 45.841797 26H42.154297A1.0001 1.0001 0 0 0 41.984375 25.986328A1.0001 1.0001 0 0 0 41.839844 26H38.167969A1.0001 1.0001 0 0 0 37.841797 26H34.154297A1.0001 1.0001 0 0 0 33.984375 25.986328A1.0001 1.0001 0 0 0 33.839844 26H16.167969A1.0001 1.0001 0 0 0 15.841797 26H12.154297A1.0001 1.0001 0 0 0 11.984375 25.986328A1.0001 1.0001 0 0 0 11.839844 26H8.1679688A1.0001 1.0001 0 0 0 7.8417969 26H4.1542969A1.0001 1.0001 0 0 0 3.984375 25.986328A1.0001 1.0001 0 0 0 3.8398438 26H2V23zM5 28H7V48H5V28zM13 28H15V41H13V28zM35 28H37V41H35V28zM43 28H45V48H43V28z" />
      </svg>
    );
  }

  if (name === "gastos") {
    return (
      <svg className="shrink-0 size-[19px]" fill="none" viewBox="0 0 24 24" aria-hidden>
        <path d="M17.21 9 19 6.44 14.09 3 9.88 9ZM9.09 4 5.58 9h4.3L12 6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <rect x="3" y="9" width="18" height="12" rx="1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M16 13h5v4h-5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "entregas") {
    return (
      <svg className="shrink-0 size-[20px]" fill="currentColor" viewBox="0 -1.73 51.467 51.467" aria-hidden>
        <g transform="translate(-289.267 -251.5)">
          <path d="M311.593,254.752a30.771,30.771,0,0,1,5.363-.091,1.778,1.778,0,0,0,.109-1.579,3.029,3.029,0,0,0-2.331-1.549,3.417,3.417,0,0,0-3.547,1.507,1.913,1.913,0,0,0,.173,1.742C311.446,254.812,311.515,254.83,311.593,254.752Z" />
          <path d="M336.39,265.913c-5.174-7.442-13.544-10.629-22.336-10.494a26.3,26.3,0,0,0-17.418,6.884,17.894,17.894,0,0,0-5.886,13.572h48.541A17.056,17.056,0,0,0,336.39,265.913Z" />
          <path d="M340.722,277.678a1.51,1.51,0,0,0-.982-1.009H290.609c-.28.088-.551,0-.812.169-.83.488-.448,1.666-.4,2.441a1.371,1.371,0,0,0,1.116.857h48.8a1.5,1.5,0,0,0,1-.249c.1-.1.221-.3.28-.3A5.56,5.56,0,0,0,340.722,277.678Z" />
          <path d="M300.158,282.365a.7.7,0,0,0-.132.63c.469.86,1.446.643,2.327.706a.671.671,0,0,0,.071.533c.409.743,1.261.6,2,.65a.556.556,0,0,0-.036.416,1.276,1.276,0,0,0,.951.6h11.251l.022-3.932H301.23A1.561,1.561,0,0,0,300.158,282.365Z" />
          <path d="M332.139,281.963h-6.623V297.59h6.614Z" />
          <path d="M317.421,289.628H322.5v-7.665h-5.078Zm1-1.747a.761.761,0,0,1,1.094-.025.812.812,0,0,1,.167.7.844.844,0,0,1-.414.467.785.785,0,0,1-.677-.046.893.893,0,0,1-.332-.531A.76.76,0,0,1,318.425,287.881Z" />
          <path d="M332.972,298.488H329.44V299.5h9.573V281.963h-6.042Z" />
        </g>
      </svg>
    );
  }

  return (
    <svg className="shrink-0 size-[20px]" fill="currentColor" viewBox="0 0 375.897 375.897" aria-hidden>
      <path d="M116.903,212.085c-16.425,0-29.788,13.363-29.788,29.789c0,16.423,13.363,29.783,29.788,29.783 c16.423,0,29.784-13.36,29.784-29.783C146.687,225.449,133.326,212.085,116.903,212.085z M116.903,257.658 c-8.706,0-15.788-7.08-15.788-15.783c0-8.706,7.082-15.789,15.788-15.789c8.703,0,15.784,7.083,15.784,15.789 C132.687,250.578,125.606,257.658,116.903,257.658z" />
      <path d="M68.1,63.43c-2.124-3.229-6.463-4.126-9.695-2.002L3.154,97.766c-3.23,2.125-4.126,6.465-2.002,9.695 c1.345,2.045,3.578,3.154,5.856,3.154c1.319,0,2.654-0.373,3.84-1.152l55.251-36.338C69.328,71.001,70.224,66.661,68.1,63.43z" />
      <path d="M79.963,76.476c3.866,0,7-3.134,7-7v-9.211c0-3.866-3.134-7-7-7s-7,3.134-7,7v9.211 C72.963,73.342,76.096,76.476,79.963,76.476z" />
      <path d="M303.343,209.411c-3.863,0.129-6.892,3.365-6.763,7.229c1.091,32.729-9.76,60.173-32.248,81.572 c-17.032,16.206-34.739,22.75-34.916,22.814c-3.631,1.31-5.518,5.313-4.214,8.947c1.024,2.858,3.717,4.639,6.589,4.639 c0.784,0,1.582-0.133,2.362-0.412c0.818-0.294,20.245-7.389,39.387-25.428c17.744-16.722,38.573-46.361,37.032-92.599 C310.444,212.31,307.212,209.298,303.343,209.411z" />
      <path d="M375.583,135.812c0,0-31.645-101.88-31.634-102.286l9.195-12.787c2.225-3.161,1.466-7.528-1.695-9.753 c-3.162-2.225-7.528-1.467-9.753,1.694l-9.853,13.998l-109.074,9.694c-2.208,0.196-4.192,1.427-5.35,3.316 c-1.157,1.891-1.352,4.218-0.522,6.274l17.472,43.326c.025.062.058.119.085.181c.043.1.09.198.138.296 c.073.148.151.291.233.433c.055.093.108.186.168.276c.093.144.193.281.297.417c.06.08.116.16.18.237 c.136.164.28.318.43.469c.041.041.077.086.12.127c.194.187.401.36.617.524c.013.01.023.021.036.03l32.115,23.979 l-43.116,61.254h-84.166L105.053,65.118c-1.192-3.678-5.14-5.692-8.817-4.499c-3.678,1.192-5.692,5.141-4.499,8.818 l35.051,108.077H51.857c-3.226,0-6.034,2.204-6.8,5.338c-2.823,11.554-4.255,23.413-4.255,35.249 c0,81.654,66.431,148.086,148.086,148.086c81.652,0,148.082-66.432,148.082-148.086c0-11.836-1.432-23.695-4.255-35.249 c-.766-3.134-3.574-5.338-6.8-5.338h-83.125l37.218-52.875l31.98,23.878c.013.009.026.015.038.023 c.269.197.551.371.842.527c.067.036.135.069.203.104c.28.139.566.263.863.363c.021.008.043.018.065.025 c.311.102.632.175.956.232c.078.014.154.025.233.036c.326.047.654.079.987.079h.002c.217,0,.433-.011.649-.031 c.005,0,.009,0,.014,0l52.721-5.021c2.098-.199,3.994-1.334,5.162-3.088C375.891,140.012,376.208,137.825,375.583,135.812z M320.306,191.514c1.77,8.765,2.664,17.684,2.664,26.587c0,73.935-60.149,134.086-134.082,134.086 c-73.936,0-134.086-60.151-134.086-134.086c0-8.903.895-17.822,2.664-26.587H320.306z M233.411,49.482l69.334-6.161 l-58.391,33.3L233.411,49.482z M311.459,130.649l-57.821-43.173l74.781-42.275L311.459,130.649z M324.923,135.043 l14.037-68.93l.133-.65l.568,1.83l1.218,3.927l1.313,4.229l17.468,56.286L324.923,135.043z" />
    </svg>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { rol, signOut, tenantId, plan, loading } = useAuth();
  const { hasUpdateBellAlert, showUpdateBellToast } = useAppUpdate();
  const localFirst = useLocalFirstBootstrap(tenantId);
  const [cocinaActiva, setCocinaActiva] = useState(true);
  const [ventaCartSearch, setVentaCartSearch] = useState("");
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [upsellType, setUpsellType] = useState<"inventario" | "sucursales" | null>(null);

  const { addSucursal, sucursales } = useSucursal();
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchPhone, setNewBranchPhone] = useState("");
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchError, setBranchError] = useState("");

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!newBranchName.trim()) {
      setBranchError("El nombre de la sucursal es obligatorio.");
      return;
    }
    setIsCreatingBranch(true);
    setBranchError("");
    try {
      await addSucursal(newBranchName, newBranchAddress, newBranchPhone);
      setShowAddBranchModal(false);
    } catch (err) {
      console.error(err);
      setBranchError(err instanceof Error ? err.message : "Error al crear la sucursal.");
    } finally {
      setIsCreatingBranch(false);
    }
  }

  const isVentaRoute = routerLocation.pathname === "/dashboard";

  useEffect(() => {
    if (!isVentaRoute) setVentaCartSearch("");
  }, [isVentaRoute]);

  useEffect(() => {
    if (!["/dashboard", "/billing", "/camarera", "/tables"].includes(routerLocation.pathname)) return;
    const mobileQuery = window.matchMedia("(max-width: 1024px)");
    const syncMobileSidebar = () => {
      if (mobileQuery.matches) setSidebarHidden(true);
    };
    syncMobileSidebar();
    mobileQuery.addEventListener("change", syncMobileSidebar);
    return () => mobileQuery.removeEventListener("change", syncMobileSidebar);
  }, [routerLocation.pathname]);

  const sideNavItems = useMemo(() => {
    const main = filterMainNavForRol(rol, plan);
    if (showSoporteInSidebar(rol)) {
      return [...main, soporteNavItem];
    }
    return main;
  }, [rol, plan]);

  useEffect(() => {
    const allowedPaths = new Set<string>(sideNavItems.map((item) => item.path));
    if (showAjustesInSidebar(rol)) allowedPaths.add("/ajustes");

    let cancelled = false;
    const warmRoutes = () => {
      if (cancelled) return;
      for (const path of allowedPaths) {
        prefetchRoute(path);
      }
    };

    const scheduler = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const idleId = scheduler.requestIdleCallback
      ? scheduler.requestIdleCallback(warmRoutes, { timeout: 1800 })
      : window.setTimeout(warmRoutes, 600);

    return () => {
      cancelled = true;
      if (scheduler.cancelIdleCallback) {
        scheduler.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [rol, sideNavItems]);

  // Re-fetch kitchen status per tenant on route change (never mix tenants in SaaS)
  useEffect(() => {
    if (!tenantId) {
      setCocinaActiva(true);
      return;
    }
    let cancelled = false;
    insforgeClient.database
      .from("cocina_estado")
      .select("activa")
      .eq("tenant_id", tenantId)
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data?.[0]) {
          setCocinaActiva(data[0].activa);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [routerLocation.pathname, tenantId]);

  const isAjustesActive = location.pathname === "/ajustes";

  return (
    <div className="bg-background text-foreground flex flex-col h-full min-h-0 w-full overflow-hidden transition-colors duration-300">
      {/* TitleBar */}
      <TitleBar
        showSidebarToggle
        sidebarHidden={sidebarHidden}
        onToggleSidebar={() => setSidebarHidden((prev) => !prev)}
        onShowBranchUpsell={() => setUpsellType("sucursales")}
        onAddBranch={() => {
          setBranchError("");
          setNewBranchName("");
          setNewBranchAddress("");
          setNewBranchPhone("");
          setShowAddBranchModal(true);
        }}
      />

      <RoleGuard>
      <VentaCartSearchProvider value={{ query: ventaCartSearch, setQuery: setVentaCartSearch }}>
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside
          className={`bg-sidebar text-sidebar-foreground flex flex-col shrink-0 min-h-0 self-stretch z-20 overflow-hidden transition-[width,opacity,transform,border-color] duration-300 ease-out ${
            sidebarHidden
              ? "w-0 opacity-0 -translate-x-3 border-r border-transparent"
              : "w-[256px] opacity-100 translate-x-0 border-r border-sidebar-border"
          }`}
          aria-label="Navegación principal"
          aria-hidden={sidebarHidden}
        >
          <nav className="flex-1 flex flex-col gap-[8px] px-[16px] pt-[16px]">
            {sideNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.label}
                  type="button"
                  onMouseEnter={() => prefetchRoute(item.path)}
                  onFocus={() => prefetchRoute(item.path)}
                  onClick={() => {
                    if (item.path === "/inventario" && !loading && (!plan || plan === "basico")) {
                      setUpsellType("inventario");
                      return;
                    }
                    navigate(item.path);
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex gap-[16px] items-center px-[16px] py-[12px] rounded-[8px] cursor-pointer relative border-none text-left w-full transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary dark:bg-[#262626] dark:text-[#ff906d]"
                      : "bg-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-[8px] bottom-[8px] w-[4px] bg-primary dark:bg-[#ff906d]" aria-hidden />
                  )}
                  {"customIcon" in item ? (
                    <SidebarCustomIcon name={item.customIcon} />
                  ) : (
                    <svg className="shrink-0 size-[18px]" fill="none" viewBox={item.viewBox} aria-hidden>
                      <path
                        d={item.icon}
                        fill="currentColor"
                      />
                    </svg>
                  )}
                  <span
                    className={`font-['Space_Grotesk',sans-serif] text-[16px] tracking-[-0.4px] ${
                      isActive ? "font-bold" : ""
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.path === "/inventario" && !loading && (!plan || plan === "basico") && (
                    <span className="ml-auto flex items-center gap-1.5 text-[9px] text-[#ff906d] bg-[rgba(255,144,109,0.12)] border border-[rgba(255,144,109,0.3)] px-2 py-0.5 rounded font-['Space_Grotesk',sans-serif] font-bold uppercase tracking-[0.5px]">
                      <svg className="size-[10px] text-[#ff906d] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                      Subir Plan
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border px-[16px] py-[16px] flex flex-col gap-[8px]">
            <LocalFirstStatusBadge
              status={localFirst.status}
              message={localFirst.message}
              completedHistoryTables={localFirst.completedHistoryTables}
              totalHistoryTables={localFirst.totalHistoryTables}
            />

            {/* Ajustes — solo administrador del negocio */}
            {showAjustesInSidebar(rol) && (
              <button
                type="button"
                onMouseEnter={() => prefetchRoute("/ajustes")}
                onFocus={() => prefetchRoute("/ajustes")}
                onClick={() => navigate("/ajustes")}
                aria-current={isAjustesActive ? "page" : undefined}
                className={`flex gap-[16px] items-center px-[16px] py-[12px] cursor-pointer relative border-none text-left w-full rounded-[8px] transition-colors ${
                  isAjustesActive
                    ? "bg-primary/10 text-primary dark:bg-[#262626] dark:text-[#ff906d]"
                    : "bg-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                {isAjustesActive && (
                  <div className="absolute left-0 top-[8px] bottom-[8px] w-[4px] bg-primary dark:bg-[#ff906d]" aria-hidden />
                )}
                <svg className="shrink-0 w-[20px] h-[20px]" fill="none" viewBox="0 0 20.1 20" aria-hidden>
                  <path d={svgPaths.p3cdadd00} fill="currentColor" />
                </svg>
                <span
                  className={`font-['Space_Grotesk',sans-serif] text-[16px] tracking-[-0.4px] ${
                    isAjustesActive ? "font-bold" : ""
                  }`}
                >
                  Ajustes
                </span>
              </button>
            )}

            <button
              type="button"
              className="flex gap-[16px] items-center px-[16px] py-[12px] cursor-pointer border-none bg-transparent text-left w-full rounded-[8px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={async () => {
                if (window.confirm("¿Seguro que querés cerrar sesión completamente y borrar la memoria de este dispositivo?")) {
                  try {
                    await signOut();
                  } catch {
                    /* sesión ya inválida */
                  }
                  navigate("/");
                }
              }}
            >
              <svg className="shrink-0 size-[18px]" fill="none" viewBox="0 0 18 18" aria-hidden>
                <path d={svgPaths.p3e9df400} fill="currentColor" />
              </svg>
              <span className="font-['Space_Grotesk',sans-serif] text-[16px] tracking-[-0.4px]">
                Cerrar Sesión
              </span>
            </button>
          </div>
        </aside>

        {/* Main area — min-h-0 + scroll en <main> para que el contenido no quede cortado (Electron) */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Shared Header */}
          <header className="backdrop-blur-[6px] bg-background/80 dark:bg-[rgba(14,14,14,0.6)] flex items-center justify-between h-[64px] px-4 sm:px-6 lg:px-[32px] border-b border-black/10 dark:border-[rgba(72,72,71,0.2)] sticky top-0 z-10 shadow-[0px_4px_24px_0px_rgba(255,144,109,0.08)]">
            <div className="flex gap-[8px] sm:gap-[24px] items-center min-w-0">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px] sm:text-[18px] uppercase">
                Cloudix OS
              </span>
              <div className="hidden sm:block bg-black/10 dark:bg-[rgba(72,72,71,0.3)] h-[16px] w-px" />
              {/* Cocina en Vivo badge — reactive to DB */}
              {canAccessCocinaRoute(rol) ? (
                <button
                  type="button"
                  className="bg-card flex gap-[8px] items-center px-[13px] py-[5px] rounded-full border border-black/10 dark:border-[rgba(72,72,71,0.2)] transition-all cursor-pointer"
                  onClick={() => navigate("/cocina")}
                  title={cocinaActiva ? "Cocina abierta" : "Cocina cerrada"}
                  aria-label={
                    cocinaActiva
                      ? "Cocina abierta. Ir a vista cocina."
                      : "Cocina cerrada. Ir a vista cocina."
                  }
                >
                  <span
                    className="rounded-full size-[8px] transition-colors"
                    style={{ backgroundColor: cocinaActiva ? "#59ee50" : "#ff716c" }}
                    aria-hidden
                  />
                  <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[10px] tracking-[0.5px] uppercase">
                    {cocinaActiva ? "Cocina en Vivo" : "Cocina Cerrada"}
                  </span>
                </button>
              ) : (
                <div
                  className="bg-card flex gap-[8px] items-center px-[13px] py-[5px] rounded-full border border-black/10 dark:border-[rgba(72,72,71,0.2)] transition-all cursor-default opacity-90"
                  title="Estado de cocina (solo personal de cocina o administrador abre la vista)"
                  role="status"
                  aria-label={
                    cocinaActiva
                      ? "Estado: cocina abierta (solo lectura)"
                      : "Estado: cocina cerrada (solo lectura)"
                  }
                >
                  <span
                    className="rounded-full size-[8px] transition-colors"
                    style={{ backgroundColor: cocinaActiva ? "#59ee50" : "#ff716c" }}
                    aria-hidden
                  />
                  <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[10px] tracking-[0.5px] uppercase">
                    {cocinaActiva ? "Cocina en Vivo" : "Cocina Cerrada"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-[12px] sm:gap-[24px] items-center shrink-0">
              {isVentaRoute ? (
                <div className="hidden md:relative md:block">
                  <label htmlFor="venta-cart-search" className="sr-only">
                    Buscar en la carta y en el pedido actual
                  </label>
                  <input
                    id="venta-cart-search"
                    type="search"
                    value={ventaCartSearch}
                    onChange={(e) => setVentaCartSearch(e.target.value)}
                    placeholder="BUSCAR CARTA O PEDIDO..."
                    autoComplete="off"
                    className="bg-card rounded-[2px] w-[min(256px,28vw)] min-w-[160px] pl-[40px] pr-[16px] py-[6px] font-['Space_Grotesk',sans-serif] text-foreground text-[12px] tracking-[-0.6px] uppercase border border-black/10 dark:border-[rgba(72,72,71,0.35)] outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                  />
                  <svg
                    className="absolute left-[14px] top-1/2 -translate-y-1/2 w-[10.5px] h-[10.5px] pointer-events-none"
                    fill="none"
                    viewBox="0 0 10.5 10.5"
                    aria-hidden
                  >
                    <path d={svgPaths.p210dd580} fill="currentColor" />
                  </svg>
                </div>
              ) : null}
              <div className="flex gap-[16px] items-center">
                <svg className="w-[18px] h-[21px] text-muted-foreground" fill="none" viewBox="0 0 18 21">
                  <path d={svgPaths.pe40b59c} fill="currentColor" />
                </svg>
                <svg className="w-[20px] h-[14.15px] text-muted-foreground" fill="none" viewBox="0 0 20 14.15">
                  <path d={svgPaths.p793b600} fill="currentColor" />
                </svg>
                <button
                  type="button"
                  onClick={showUpdateBellToast}
                  title={
                    hasUpdateBellAlert
                      ? "Hay una actualización de la app"
                      : "Notificaciones"
                  }
                  aria-label={
                    hasUpdateBellAlert
                      ? "Hay una actualización disponible. Tocá para ver detalles."
                      : "Notificaciones"
                  }
                  className="relative w-[16px] h-[20px] shrink-0 border-none bg-transparent p-0 cursor-pointer"
                >
                  <svg
                    className="absolute inset-[-20%_-25%_0_0] w-[20px] h-[24px] pointer-events-none"
                    fill="none"
                    viewBox="0 0 20.01 24"
                    aria-hidden
                  >
                    <path
                      d={svgPaths.p28252700}
                      fill={hasUpdateBellAlert ? "#ff906d" : "#ADAAAA"}
                    />
                  </svg>
                  {hasUpdateBellAlert ? (
                    <span
                      className="absolute top-[-4px] right-[-6px] size-[9px] rounded-full bg-[#ffb020] shadow-[0_0_10px_rgba(255,176,32,0.85)] pointer-events-none motion-safe:animate-pulse"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <main className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
      {upsellType !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all duration-300">
          <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_40px_rgba(255,144,109,0.2)] max-w-[420px] w-full p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,144,109,0.1),transparent)] pointer-events-none" />

            <div className="flex flex-col items-center text-center gap-4 relative z-10">
              {/* Crown/Building Icon SVG */}
              <div className="bg-[rgba(255,144,109,0.12)] border border-[rgba(255,144,109,0.3)] rounded-full size-[64px] flex items-center justify-center shadow-[0_0_20px_rgba(255,144,109,0.2)]">
                {upsellType === "inventario" ? (
                  <svg className="size-[28px] text-[#ff906d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
                    <path d="M3 20h18" />
                  </svg>
                ) : (
                  <svg className="size-[28px] text-[#ff906d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] uppercase tracking-[0.5px]">
                  {upsellType === "inventario" 
                    ? "Módulo de Inventario" 
                    : (plan === "profesional" ? "Sucursales Ilimitadas" : "Múltiples Sucursales")
                  }
                </span>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[12px] uppercase tracking-[1px]">
                  {upsellType === "inventario" 
                    ? "Plan Profesional" 
                    : (plan === "profesional" ? "Plan Empresarial" : "Plan Profesional / Empresarial")
                  }
                </span>
              </div>

              <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[13px] leading-relaxed">
                {upsellType === "inventario" && (
                  <>
                    El control de inventario avanzado, recetas y materias primas (como aceite, carne y papas) está disponible exclusivamente en el <strong className="text-white font-semibold">Plan Profesional</strong>.
                  </>
                )}
                {upsellType === "sucursales" && plan === "profesional" && (
                  <>
                    Llegaste al límite de 3 sucursales de tu Plan Profesional. La gestión de sucursales ilimitadas y soporte corporativo 24/7 está disponible exclusivamente en el <strong className="text-[#a78bfa] font-semibold">Plan Empresarial</strong>.
                  </>
                )}
                {upsellType === "sucursales" && plan !== "profesional" && (
                  <>
                    La gestión de múltiples sucursales (hasta 3 en Profesional, ilimitadas en Empresarial), control de stock y transferencias está disponible en nuestros <strong className="text-white font-semibold">Planes Superiores</strong>.
                  </>
                )}
              </p>

              <div className="bg-[rgba(255,144,109,0.08)] border border-[rgba(255,144,109,0.2)] rounded-[12px] p-3 w-full">
                <p className="font-['Space_Grotesk',sans-serif] text-[#ff906d] text-[13px] font-bold leading-normal flex items-center justify-center gap-2">
                  <svg className="size-[16px] text-[#ff906d] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  {plan === "profesional" 
                    ? "Debés subir al Plan Empresarial. Hablá con el administrador."
                    : "Debés subir de plan. Hablá con el administrador del sistema."
                  }
                </p>
              </div>

              <div className="bg-[#1a1a1a] rounded-[12px] border border-[rgba(72,72,71,0.18)] p-3.5 w-full text-left">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[11px] uppercase tracking-[0.5px] block mb-2">
                  {upsellType === "inventario" ? "¿Qué incluye el Plan Profesional?" : "¿Qué ventajas te ofrece?"}
                </span>
                <ul className="flex flex-col gap-1.5 pl-0 list-none text-[11px] text-[#adaaaa] font-['Inter',sans-serif]">
                  {upsellType === "inventario" ? (
                    <>
                      <li className="flex items-center gap-2">
                        <span className="text-[#ff906d]">✓</span> <b>Múltiples Sucursales</b> en un solo lugar
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[#ff906d]">✓</span> <b>Ingredientes y recetas</b> automáticos
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[#ff906d]">✓</span> <b>Cierres de Cocina</b> y reporte de mermas
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[#ff906d]">✓</span> Control de aceite útil de freidoras
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-center gap-2">
                        <span className="text-[#ff906d]">✓</span> <b>Múltiples locales</b> sincronizados en tiempo real
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[#ff906d]">✓</span> <b>Consolidación de ventas</b> y caja unificada
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[#ff906d]">✓</span> <b>Transferencias de insumos</b> entre locales
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[#ff906d]">✓</span> Filtros rápidos de sucursal en todo el sistema
                      </li>
                    </>
                  )}
                </ul>
              </div>

              <div className="flex flex-col gap-2.5 w-full mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setUpsellType(null);
                    navigate("/ajustes");
                  }}
                  className="w-full bg-[#ff906d] py-3 rounded-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[12px] uppercase tracking-[0.5px] cursor-pointer border-none transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,144,109,0.4)] hover:scale-[1.01] active:scale-95"
                  style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                >
                  Mejorar Plan en Ajustes
                </button>
                
                <button
                  type="button"
                  onClick={() => setUpsellType(null)}
                  className="w-full bg-[#262626] text-[#adaaaa] py-2.5 rounded-[12px] font-['Inter',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-all duration-300 hover:bg-[#333] active:scale-95"
                >
                  Entendido, volver
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all duration-300">
          <div className="bg-[#131313] border border-[rgba(255,144,109,0.3)] rounded-[20px] shadow-[0px_0px_40px_rgba(255,144,109,0.2)] max-w-[420px] w-full p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,144,109,0.1),transparent)] pointer-events-none" />

            <form onSubmit={handleCreateBranch} className="flex flex-col gap-4 relative z-10" style={{ WebkitAppRegion: "no-drag" as any }}>
              <div className="flex flex-col items-center text-center gap-2">
                <div className="bg-[rgba(255,144,109,0.12)] border border-[rgba(255,144,109,0.3)] rounded-full size-[64px] flex items-center justify-center shadow-[0_0_20px_rgba(255,144,109,0.2)]">
                  <svg className="size-[28px] text-[#ff906d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] uppercase tracking-[0.5px] mt-2">
                  Agregar Sucursal
                </h3>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[11px] uppercase tracking-[1px]">
                  {plan === "profesional" ? `Plan Profesional (${sucursales.length}/3)` : "Plan Empresarial (Ilimitadas)"}
                </span>
              </div>

              {branchError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-[12px] p-3 text-center">
                  <p className="font-['Inter',sans-serif] text-red-400 text-[12px] font-semibold">
                    {branchError}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 my-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                    Nombre de la Sucursal *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Sucursal Bella Vista"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    className="bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-2.5 font-['Inter',sans-serif] text-sm text-white placeholder-[#adaaaa]/50 outline-none focus:border-[#ff906d]/50 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                    Dirección (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Av. Rómulo Betancourt #12"
                    value={newBranchAddress}
                    onChange={(e) => setNewBranchAddress(e.target.value)}
                    className="bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-2.5 font-['Inter',sans-serif] text-sm text-white placeholder-[#adaaaa]/50 outline-none focus:border-[#ff906d]/50 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                    Teléfono (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 809-555-0199"
                    value={newBranchPhone}
                    onChange={(e) => setNewBranchPhone(e.target.value)}
                    className="bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-2.5 font-['Inter',sans-serif] text-sm text-white placeholder-[#adaaaa]/50 outline-none focus:border-[#ff906d]/50 transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2.5 w-full mt-1">
                <button
                  type="submit"
                  disabled={isCreatingBranch}
                  className="w-full bg-[#ff906d] py-3 rounded-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[12px] uppercase tracking-[0.5px] cursor-pointer border-none transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,144,109,0.4)] hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                  style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                >
                  {isCreatingBranch ? "Creando..." : "Crear Sucursal"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddBranchModal(false)}
                  className="w-full bg-[#262626] text-[#adaaaa] py-2.5 rounded-[12px] font-['Inter',sans-serif] font-bold text-[11px] uppercase cursor-pointer border-none transition-all duration-300 hover:bg-[#333] active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
</VentaCartSearchProvider>
      </RoleGuard>
    </div>
  );
}
