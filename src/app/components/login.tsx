import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import svgPaths from "../../imports/svg-h2gjocs89h";
import imgLoginRegistro from "figma:asset/47f7239cc7433af3270415eeec94f9bdbb11cd99.png";
import imgDecorativeScanlineEffect from "figma:asset/70a05c412757c6d4e1cffbb0780858880dce7a5a.png";
import { TitleBar } from "./TitleBar";
import { insforgeClient } from "../../lib/insforge";

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

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Move interaction logic to event handler (Vercel best practice)
  const handleLogin = useCallback(async () => {
    if (!email || !password) {
      setError("Por favor completa todos los campos");
      return;
    }

    setIsLoading(true);
    setError("");

    const { data, error: authError } = await insforgeClient.auth.signInWithPassword({
      email,
      password
    });

    setIsLoading(false);

    if (authError) {
      setError(authError.message || "Error al iniciar sesión");
      return;
    }

    if (data.user) {
      setIsVisible(false);
      setTimeout(() => navigate("/dashboard"), 300);
    }
  }, [email, password, navigate]);

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
          Gastronomy Operating System v4.0.2
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
        <div className="absolute bg-[#0e0e0e] inset-0" />
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

              {/* Error Message */}
              {error && (
                <div
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
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2 transition-colors duration-300 group-hover:text-[#ff906d]">
                    Correo
                  </div>
                  <div className="bg-[#131313] relative w-full rounded-[6px] sm:rounded-[8px] transition-all duration-300 group-hover:shadow-[0px_0px_20px_-5px_rgba(255,144,109,0.2)] focus-within:shadow-[0px_0px_20px_-5px_rgba(255,144,109,0.3)]">
                    <div className="flex items-center relative">
                      <div className="absolute left-3 sm:left-[18px] w-3 sm:w-[15px] transition-colors duration-300 group-hover:scale-110">
                        <svg className="block w-full" fill="none" viewBox="0 0 15.0408 16.6369">
                          <path d={ICONS.email} fill="#484847" />
                        </svg>
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="usuario@correo.com"
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-10 sm:pl-12 pr-4 py-3 sm:py-4 outline-none transition-colors duration-300"
                        onKeyDown={handleKeyDown}
                      />
                    </div>
                    <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none rounded-[inherit] transition-colors duration-300 group-hover:border-[rgba(255,144,109,0.3)]" />
                  </div>
                </div>

                {/* Password Input */}
                <div className="relative shrink-0 w-full group">
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2 transition-colors duration-300 group-hover:text-[#ff906d]">
                    Contraseña
                  </div>
                  <div className="bg-[#131313] relative w-full rounded-[6px] sm:rounded-[8px] transition-all duration-300 group-hover:shadow-[0px_0px_20px_-5px_rgba(255,144,109,0.2)] focus-within:shadow-[0px_0px_20px_-5px_rgba(255,144,109,0.3)]">
                    <div className="flex items-center relative">
                      <div className="absolute left-3 sm:left-[17px] w-4 sm:w-[19px] transition-colors duration-300 group-hover:scale-110">
                        <svg className="block w-full" fill="none" viewBox="0 0 19.1667 10">
                          <path d={ICONS.password} fill="#484847" />
                        </svg>
                      </div>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="•••••••••••••"
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-10 sm:pl-12 pr-4 py-3 sm:py-4 outline-none transition-colors duration-300"
                        onKeyDown={handleKeyDown}
                      />
                    </div>
                    <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none rounded-[inherit] transition-colors duration-300 group-hover:border-[rgba(255,144,109,0.3)]" />
                  </div>
                </div>

                {/* Biometric Button */}
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

              {/* Footer */}
              <div className="relative shrink-0 w-full flex flex-col gap-3 sm:gap-4 items-center">
                <div
                  className="flex gap-2 sm:gap-2 items-center cursor-pointer transition-all duration-300 hover:gap-3 group"
                  onClick={() => navigate('/register')}
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
    </div>
    </div>
  );
}
