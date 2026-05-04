import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import svgPaths from "../../../imports/svg-h2gjocs89h";
import imgLoginRegistro from "figma:asset/47f7239cc7433af3270415eeec94f9bdbb11cd99.png";
import imgDecorativeScanlineEffect from "figma:asset/70a05c412757c6d4e1cffbb0780858880dce7a5a.png";
import { TitleBar } from "../../window";
import {
  insforgeClient,
  formatInsforgeConnectivityError,
} from "../../../shared/lib/insforge";
import { INSFORGE_REFRESH_TOKEN_STORAGE_KEY } from "../../../shared/lib/insforgeAuthStorage";
import { resolveTenantUserForSession } from "../../../shared/lib/resolveTenantUserFromAuth";
import { hydrateAuthStateAfterLogin, syncAuthClientAfterLogin } from "../../../shared/hooks/useAuth";
import { defaultRouteForRol } from "../../../shared/lib/roleNav";
import { PinGateModal } from "../../../shared/components/PinGate";

const LOGIN_NOTICE_KEY = "cyberbistro_login_notice";
const REFRESH_TOKEN_KEY = INSFORGE_REFRESH_TOKEN_STORAGE_KEY;
const REMEMBER_LOGIN_KEY = "cyberbistro_remember_login";

// Hoist static SVG paths to avoid re-creation
const ICONS = {
  email: svgPaths.p2b44ee60,
  password: svgPaths.p22917200,
  biometric: svgPaths.p3b4abf00,
  arrow: svgPaths.pce77c00,
  logo: svgPaths.p280a6f80
} as const;

// Hoist static JSX elements
const LOADING_SPINNER = (
  <div className="flex items-center gap-2">
    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
  </div>
);

const STATUS_INDICATORS = (
  <>
    <div className="flex gap-2 sm:gap-2 items-center">
      <div className="bg-[#59ee50] rounded-[9999px] shadow-[0px_0px_8px_0px_#59ee50] size-2 sm:size-2 animate-pulse" />
      <span className="font-['Inter',sans-serif] font-medium text-[#adaaaa] text-[9px] sm:text-[10px] uppercase">Núcleo Seguro</span>
    </div>
    <div className="flex gap-2 sm:gap-2 items-center">
      <div className="bg-[#ff906d] rounded-[9999px] shadow-[0px_0px_8px_0px_#ff906d] size-2 sm:size-2 animate-pulse" />
      <span className="font-['Inter',sans-serif] font-medium text-[#adaaaa] text-[9px] sm:text-[10px] uppercase">Estación Activa</span>
    </div>
  </>
);

const BIOMETRIC_INDICATORS = (
  <div className="flex gap-1 sm:gap-1 items-start">
    <div className="bg-[rgba(255,106,160,0.4)] h-2 sm:h-3 rounded-[9999px] w-1 sm:w-1 animate-pulse" />
    <div className="bg-[#ff6aa0] h-2 sm:h-3 rounded-[9999px] w-1 sm:w-1 animate-pulse" />
    <div className="bg-[rgba(255,106,160,0.4)] h-2 sm:h-3 rounded-[9999px] w-1 sm:w-1 animate-pulse" />
  </div>
);

function extractRefreshTokenFromSignInPayload(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const maybeData = data as any;
  const direct = maybeData.refreshToken || maybeData.refresh_token;
  if (typeof direct === "string" && direct.trim().length > 0) return direct;
  const inSession = maybeData.session?.refreshToken || maybeData.session?.refresh_token;
  if (typeof inSession === "string" && inSession.trim().length > 0) return inSession;
  const inTokens = maybeData.tokens?.refreshToken || maybeData.tokens?.refresh_token;
  if (typeof inTokens === "string" && inTokens.trim().length > 0) return inTokens;
  return null;
}

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);

  // Updater states
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'>('idle');
  const [updatePercent, setUpdatePercent] = useState(0);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Update logic
  useEffect(() => {
    const electron = (window as any).electronAPI;
    if (!electron?.onUpdateEvents) return;

    electron.getUpdateState().then((state: any) => {
      if (state) {
        setUpdatePhase(state.phase || 'idle');
        setUpdatePercent(state.percent || 0);
      }
    }).catch(() => {});

    const removeListeners = electron.onUpdateEvents({
      onChecking: () => setUpdatePhase('checking'),
      onUpdateAvailable: () => setUpdatePhase('available'),
      onUpdateNotAvailable: () => setUpdatePhase('idle'),
      onDownloadProgress: (progress: any) => {
        setUpdatePhase('downloading');
        setUpdatePercent(Math.round(progress.percent));
      },
      onUpdateDownloaded: () => setUpdatePhase('ready'),
      onUpdateError: () => setUpdatePhase('error')
    });

    return () => removeListeners();
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    if (stored) {
      setNotice(stored);
      sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMEMBER_LOGIN_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        email?: unknown;
        password?: unknown;
        enabled?: unknown;
      };

      if (parsed.enabled !== true) return;

      setEmail(typeof parsed.email === "string" ? parsed.email : "");
      setPassword(typeof parsed.password === "string" ? parsed.password : "");
      setRememberLogin(true);
    } catch {
      localStorage.removeItem(REMEMBER_LOGIN_KEY);
    }
  }, []);

  // Move interaction logic to event handler (Vercel best practice)
  const handleLogin = useCallback(async () => {
    if (isLoading) return;

    if (!email || !password) {
      setError("Por favor completa todos los campos");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    const { data, error: authError } = await insforgeClient.auth.signInWithPassword({
      email,
      password
    });
    console.info("[AuthFlow] login response", {
      hasData: Boolean(data),
      hasUser: Boolean(data?.user),
      hasDirectRefreshToken:
        Boolean(data && typeof data === "object" && "refreshToken" in data),
    });

    syncAuthClientAfterLogin(data);

    if (authError) {
      const connectivity = formatInsforgeConnectivityError(authError);
      setIsLoading(false);
      setError(connectivity ?? (authError.message || "Error al iniciar sesión"));
      return;
    }

    try {
      if (rememberLogin) {
        localStorage.setItem(
          REMEMBER_LOGIN_KEY,
          JSON.stringify({
            enabled: true,
            email,
            password,
          })
        );
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
      }
    } catch {
      /* ignore storage errors */
    }

    const refreshToken = extractRefreshTokenFromSignInPayload(data);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      try {
        insforgeClient.getHttpClient().setRefreshToken(refreshToken);
      } catch {
        /* ignore */
      }
      console.info("[AuthFlow] login refresh token stored", {
        tokenLength: refreshToken.length,
      });
    } else {
      console.warn("[AuthFlow] login without refresh token in payload");
    }

    if (data?.user) {
      const tu = await resolveTenantUserForSession(data.user);
      if (!tu) {
        setError(
          "Esta cuenta no está vinculada a ningún negocio. El administrador debe darte acceso desde Soporte."
        );
        await insforgeClient.auth.signOut();
        setIsLoading(false);
        return;
      }
      hydrateAuthStateAfterLogin(data.user, tu);
      const dest = defaultRouteForRol(tu.rol);
      setIsVisible(false);
      setTimeout(() => navigate(dest), 300);
    }
    setIsLoading(false);
  }, [email, isLoading, password, navigate, rememberLogin]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  }, [handleLogin]);

  // Memoize header section to avoid re-renders
  const header = useMemo(() => (
    <div className="relative shrink-0 w-full">
      <div className="content-stretch flex flex-col gap-2 sm:gap-2 items-center relative w-full">
        <div className="bg-[#262626] flex items-center justify-center px-px py-2 sm:py-3 relative rounded-[8px] sm:rounded-[12px] shrink-0 w-[48px] sm:w-[64px] transition-transform duration-300 hover:scale-110 hover:rotate-12">
          <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[8px] sm:rounded-[12px]" />
          <div className="h-[20px] sm:h-[30px] relative shrink-0 w-[15px] sm:w-[22.5px]">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 22.5 30">
              <path d={ICONS.logo} fill="#FF906D" />
            </svg>
          </div>
        </div>
        <div className="pt-2 sm:pt-4">
          <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[20px] sm:text-[28px] md:text-[36px] text-center tracking-[-1px] sm:tracking-[-1.8px] uppercase">
            CyberBistro
          </div>
        </div>
        <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] sm:text-[12px] text-center tracking-[1px] sm:tracking-[1.2px] uppercase">
          Gastronomy Operating System
        </div>
      </div>
    </div>
  ), []);

  return (
    <div
      className="flex flex-col min-h-screen w-full transition-opacity duration-300"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <TitleBar />

      <div className="flex items-center justify-center p-4 relative flex-1 w-full overflow-hidden">
      {/* Background */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute bg-background inset-0 transition-colors duration-300" />
        <div className="absolute inset-0 overflow-hidden">
          <img
            alt=""
            className="absolute h-full left-0 max-w-none top-0 w-full object-cover transition-transform duration-700 ease-out hover:scale-105"
            src={imgLoginRegistro}
          />
        </div>
        <div className="absolute bg-[rgba(14,14,14,0.9)] inset-0" />
      </div>

      {/* Main Card */}
      <div
        className="content-stretch flex flex-col gap-3 sm:gap-4 items-start w-full max-w-full sm:max-w-[400px] relative shrink-0 mx-auto transition-all duration-500 ease-out"
        style={{
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
          opacity: isVisible ? 1 : 0
        }}
      >
        {/* Ambient glow effects */}
        <div className="absolute bg-[rgba(255,144,109,0.1)] blur-[50px] left-[-96px] rounded-[9999px] size-[256px] top-[-96px] animate-pulse" />
        <div className="absolute bg-[rgba(255,106,160,0.1)] blur-[50px] bottom-[-96px] right-[-96px] rounded-[9999px] size-[256px] animate-pulse delay-1000" />

        <div className="backdrop-blur-[8px] bg-[rgba(38,38,38,0.6)] relative rounded-[8px] sm:rounded-[12px] shrink-0 w-full transition-all duration-300 hover:shadow-[0px_0px_40px_-10px_rgba(255,144,109,0.3)]">
          <div className="overflow-clip rounded-[inherit] size-full">
            <div className="content-stretch flex flex-col gap-4 sm:gap-6 items-start p-3 sm:p-5 relative w-full">
              {/* Scanline overlay */}
              <div className="absolute inset-px opacity-3">
                <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgDecorativeScanlineEffect} />
              </div>

              {/* Header */}
              {header}

              {/* Post–Soporte u otros avisos */}
              {notice && (
                <div
                  className="bg-[rgba(89,238,80,0.08)] border border-[rgba(89,238,80,0.25)] rounded-[6px] sm:rounded-[8px] p-2 sm:p-3"
                  role="status"
                >
                  <div className="font-['Inter',sans-serif] text-[#59ee50] text-[11px] sm:text-[12px] text-center leading-relaxed">
                    {notice}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div
                  id="login-auth-error"
                  className="bg-[rgba(255,115,70,0.1)] border border-[#ff7346] rounded-[6px] sm:rounded-[8px] p-2 sm:p-3 transition-all duration-300 animate-shake"
                  role="alert"
                >
                  <div className="font-['Inter',sans-serif] text-[#ff7346] text-[11px] sm:text-[12px] text-center">
                    {error}
                  </div>
                </div>
              )}

              {/* Form */}
              <div className="relative shrink-0 w-full flex flex-col gap-3 sm:gap-4">
                {/* Email Input */}
                <div className="relative shrink-0 w-full group">
                  <label
                    htmlFor="login-email"
                    className="block font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2 transition-colors duration-300 group-hover:text-[#ff906d] cursor-pointer"
                  >
                    Correo
                  </label>
                  <div className="bg-[#131313] relative w-full rounded-[6px] sm:rounded-[8px] transition-all duration-300 group-hover:shadow-[0px_0px_20px_-5px_rgba(255,144,109,0.2)] focus-within:shadow-[0px_0px_20px_-5px_rgba(255,144,109,0.3)]">
                    <div className="flex items-center relative">
                      <div className="absolute left-3 sm:left-[18px] w-3 sm:w-[15px] transition-colors duration-300 group-hover:scale-110">
                        <svg className="block w-full" fill="none" viewBox="0 0 15.0408 16.6369">
                          <path d={ICONS.email} fill="#484847" />
                        </svg>
                      </div>
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="usuario@correo.com"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "login-auth-error" : undefined}
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-10 sm:pl-12 pr-4 py-3 sm:py-4 outline-none transition-colors duration-300"
                        onKeyDown={handleKeyDown}
                      />
                    </div>
                    <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none rounded-[inherit] transition-colors duration-300 group-hover:border-[rgba(255,144,109,0.3)]" />
                  </div>
                </div>

                {/* Password Input */}
                <div className="relative shrink-0 w-full group">
                  <label
                    htmlFor="login-password"
                    className="block font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2 transition-colors duration-300 group-hover:text-[#ff906d] cursor-pointer"
                  >
                    Contraseña
                  </label>
                  <div className="bg-[#131313] relative w-full rounded-[6px] sm:rounded-[8px] transition-all duration-300 group-hover:shadow-[0px_0px_20px_-5px_rgba(255,144,109,0.2)] focus-within:shadow-[0px_0px_20px_-5px_rgba(255,144,109,0.3)]">
                    <div className="flex items-center relative">
                      <div className="absolute left-3 sm:left-[17px] w-4 sm:w-[19px] transition-colors duration-300 group-hover:scale-110">
                        <svg className="block w-full" fill="none" viewBox="0 0 19.1667 10">
                          <path d={ICONS.password} fill="#484847" />
                        </svg>
                      </div>
                      <input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="•••••••••••••"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "login-auth-error" : undefined}
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-10 sm:pl-12 pr-4 py-3 sm:py-4 outline-none transition-colors duration-300"
                        onKeyDown={handleKeyDown}
                      />
                    </div>
                    <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none rounded-[inherit] transition-colors duration-300 group-hover:border-[rgba(255,144,109,0.3)]" />
                  </div>
                </div>

                <label
                  htmlFor="login-remember"
                  className="group relative flex items-center justify-between gap-4 rounded-[8px] sm:rounded-[10px] bg-[rgba(19,19,19,0.9)] px-3 sm:px-4 py-3 cursor-pointer transition-all duration-300 hover:bg-[rgba(24,24,24,0.96)] hover:shadow-[0px_0px_20px_-8px_rgba(255,144,109,0.25)]"
                >
                  <div aria-hidden="true" className="absolute inset-0 rounded-[inherit] border border-[rgba(72,72,71,0.28)] transition-colors duration-300 group-hover:border-[rgba(255,144,109,0.26)]" />
                  <div className="relative flex items-center gap-3 min-w-0">
                    <input
                      id="login-remember"
                      type="checkbox"
                      checked={rememberLogin}
                      onChange={(e) => {
                        const nextChecked = e.target.checked;
                        setRememberLogin(nextChecked);
                        if (!nextChecked) {
                          localStorage.removeItem(REMEMBER_LOGIN_KEY);
                        }
                      }}
                      className="peer sr-only"
                    />
                    <span className="relative flex size-[18px] sm:size-5 items-center justify-center rounded-[5px] border border-[rgba(72,72,71,0.7)] bg-[#101010] transition-all duration-300 peer-checked:border-[#ff906d] peer-checked:bg-[linear-gradient(180deg,rgba(255,144,109,0.22)_0%,rgba(255,106,160,0.18)_100%)] peer-checked:shadow-[0px_0px_16px_-6px_rgba(255,144,109,0.75)]">
                      <span className="h-2 w-2 rounded-full bg-[#ff906d] scale-0 opacity-0 transition-all duration-300 peer-checked:scale-100 peer-checked:opacity-100 peer-checked:shadow-[0px_0px_10px_0px_rgba(255,144,109,0.9)]" />
                    </span>
                    <div className="flex flex-col">
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[11px] sm:text-[12px] tracking-[0.08em] uppercase">
                        Recordar
                      </span>
                      <span className="font-['Inter',sans-serif] text-[#7c7c7c] text-[10px] sm:text-[11px] leading-relaxed">
                        Guarda correo y contraseÃ±a en este equipo
                      </span>
                    </div>
                  </div>
                  <div className="relative flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${rememberLogin ? "bg-[#ff906d] shadow-[0px_0px_8px_0px_rgba(255,144,109,0.9)]" : "bg-[#4a4a4a]"}`} />
                    <span className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                      local
                    </span>
                  </div>
                </label>

                {/* Biometric Button (Comentado a pedido)
                <div
                  className="bg-[#262626] relative rounded-[8px] sm:rounded-[12px] shrink-0 w-full cursor-pointer transition-all duration-300 hover:bg-[#2a2a2a] hover:shadow-[0px_0px_20px_-5px_rgba(255,106,160,0.3)] active:scale-95"
                >
                  <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[8px] sm:rounded-[12px] transition-colors duration-300 hover:border-[rgba(255,106,160,0.4)]" />
                  <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-4 relative w-full">
                    <div className="flex gap-2 sm:gap-3 items-center">
                      <div className="h-3 sm:h-4 w-3.5 sm:w-5 transition-transform duration-300 hover:rotate-180">
                        <svg className="block size-full" fill="none" viewBox="0 0 20 16">
                          <path d={ICONS.biometric} fill="#FF6AA0" />
                        </svg>
                      </div>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[11px] sm:text-[14px] text-white tracking-[-0.3px] sm:tracking-[-0.35px] uppercase">
                        Escaneo Biométrico
                      </span>
                    </div>
                    {BIOMETRIC_INDICATORS}
                  </div>
                </div>
                */}

                {/* Login Button */}
                <button
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="flex items-center justify-center py-3 sm:py-4 rounded-[8px] sm:rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.4)] shrink-0 w-full cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-[0px_0px_30px_0px_rgba(255,144,109,0.6)] hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
                  style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      {LOADING_SPINNER}
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[12px] sm:text-[14px] text-black text-center tracking-[1.2px] sm:tracking-[1.4px] uppercase">
                        Verificando...
                      </span>
                    </div>
                  ) : (
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[12px] sm:text-[14px] text-black text-center tracking-[1.2px] sm:tracking-[1.4px] uppercase">
                      Iniciar Sesión
                    </span>
                  )}
                </button>
              </div>

              {/* Updater Info */}
              <div className="w-full mt-4 text-center font-['Inter',sans-serif] text-[11px] text-[#76777d] uppercase tracking-[0.05em] font-semibold">
                <div className="mb-1">Versión {__APP_VERSION__}</div>
                {updatePhase === 'checking' && (
                  <div className="mt-1 bg-[rgba(38,38,38,0.6)] text-[#adaaaa] p-1.5 rounded-[4px]">Buscando actualizaciones...</div>
                )}
                {updatePhase === 'available' && (
                  <div className="mt-1 bg-[rgba(0,102,204,0.1)] text-[#5c9ce6] p-1.5 rounded-[4px] animate-pulse">Actualización disponible. Descargando...</div>
                )}
                {updatePhase === 'downloading' && (
                  <div className="mt-1 bg-[rgba(0,102,204,0.1)] text-[#5c9ce6] p-1.5 rounded-[4px]">Descargando: {updatePercent}%</div>
                )}
                {updatePhase === 'ready' && (
                  <div className="mt-1 bg-[rgba(89,238,80,0.1)] text-[#59ee50] p-1.5 rounded-[4px]">
                    Actualización lista. <button onClick={(e) => { e.preventDefault(); (window as any).electronAPI?.installUpdate(); }} className="underline hover:text-[#7dff75]">Instalar y reiniciar</button>
                  </div>
                )}
                {updatePhase === 'error' && (
                  <div className="mt-1 bg-[rgba(255,115,70,0.1)] text-[#ff7346] p-1.5 rounded-[4px]">Error de actualización</div>
                )}
              </div>

              {/* Footer */}
              <div className="relative shrink-0 w-full flex flex-col gap-3 sm:gap-4 items-center">
                <div
                  className="flex gap-2 sm:gap-2 items-center cursor-pointer transition-all duration-300 hover:gap-3 group"
                  onClick={() => setShowPinGate(true)}
                >
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff6aa0] text-[11px] sm:text-[12px] tracking-[1.1px] sm:tracking-[1.2px] uppercase transition-colors duration-300 group-hover:text-[#ff906d]">
                    Registrar Nueva Unidad
                  </span>
                  <div className="relative size-[7px] sm:size-[9.333px] transition-transform duration-300 group-hover:translate-x-1">
                    <svg className="block size-full" fill="none" viewBox="0 0 9.33333 9.33333">
                      <path d={ICONS.arrow} fill="#FF6AA0" />
                    </svg>
                  </div>
                </div>
                <div className="pt-2 sm:pt-4 flex gap-4 sm:gap-6 items-center">
                  {STATUS_INDICATORS}
                </div>
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[8px] sm:rounded-[12px] shadow-[0px_0px_40px_-10px_rgba(255,144,109,0.3)] transition-opacity duration-300 hover:opacity-50" />
        </div>
      </div>

        {/* PIN Gate Modal for Registration */}
        {showPinGate && (
          <PinGateModal
            onUnlock={() => {
              setShowPinGate(false);
              navigate('/register');
            }}
            onCancel={() => setShowPinGate(false)}
            title="Registro de Nueva Unidad"
            subtitle="Ingresá la clave maestra para continuar"
            correctPin="1110"
          />
        )}
    </div>
    </div>
  );
}
