import { useState } from "react";
import { useNavigate } from "react-router";
import svgPaths from "../../../imports/svg-h2gjocs89h";
import imgLoginRegistro from "figma:asset/47f7239cc7433af3270415eeec94f9bdbb11cd99.png";
import imgDecorativeScanlineEffect from "figma:asset/70a05c412757c6d4e1cffbb0780858880dce7a5a.png";
import { TitleBar } from "../../window";
import { insforgeClient } from "../../../shared/lib/insforge";
import { writeTenantSessionCache } from "../../../shared/lib/tenantSessionCache";
import { INSFORGE_REFRESH_TOKEN_STORAGE_KEY } from "../../../shared/lib/insforgeAuthStorage";

function extractAccessTokenFromPayload(data: unknown): string | null {
  if (!data || typeof data != "object") return null;
  const maybeData = data as any;
  const direct = maybeData.accessToken || maybeData.access_token;
  if (typeof direct === "string" && direct.trim().length > 0) return direct;
  const inSession = maybeData.session?.accessToken || maybeData.session?.access_token;
  if (typeof inSession === "string" && inSession.trim().length > 0) return inSession;
  const inTokens = maybeData.tokens?.accessToken || maybeData.tokens?.access_token;
  if (typeof inTokens === "string" && inTokens.trim().length > 0) return inTokens;
  return null;
}

function extractRefreshTokenFromPayload(data: unknown): string | null {
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

export function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<'account' | 'plan' | 'basic' | 'contact' | 'location'>('account');
  const [plan, setPlan] = useState<'basico' | 'profesional' | 'empresarial'>('basico');

  // Datos de la empresa
  const [nombreNegocio, setNombreNegocio] = useState("");
  const [rnc, setRnc] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  /** ID de Auth devuelto por signUp; getCurrentUser puede fallar si la sesión aún no está lista */
  const [registeredAuthUserId, setRegisteredAuthUserId] = useState<string | null>(null);

  const navigate = useNavigate();

  const startAccountRegistration = async () => {
    if (!email || !password || !confirmPassword) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrase?as no coinciden");
      return;
    }

    if (password.length < 6) {
      setError("La contrase?a debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      // Crear usuario en Auth
      const { data: signData, error: authError } = await insforgeClient.auth.signUp({
        email,
        password
      });

      if (authError) {
        throw new Error(authError.message || "Error al crear usuario");
      }

      if (signData?.requireEmailVerification) {
        throw new Error("El backend todav?a est? exigiendo validar el correo. Desactiv? la verificaci?n de email en InsForge para este flujo de registro.");
      }

      const accessToken = extractAccessTokenFromPayload(signData);
      if (accessToken) {
        try {
          insforgeClient.getHttpClient().setAuthToken(accessToken);
        } catch { /* ignore */ }
      }

      const refreshToken = extractRefreshTokenFromPayload(signData);
      if (refreshToken) {
        localStorage.setItem(INSFORGE_REFRESH_TOKEN_STORAGE_KEY, refreshToken);
        try {
          insforgeClient.getHttpClient().setRefreshToken(refreshToken);
        } catch { /* ignore */ }
      }

      const newUserId = signData?.user?.id;
      if (newUserId) {
        setRegisteredAuthUserId(newUserId);
      }

      setLoading(false);
      setStep('plan');
    } catch (err: any) {
      setError(err.message || "Error al crear cuenta");
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError("");

    // Paso 1: validar PIN una sola vez y crear usuario en Auth
    if (step === 'account') {
      await startAccountRegistration();
      return;
    }

    if (step === 'plan') {
      setStep('basic');
      return;
    }

    // Pasos de negocio: avanzar al siguiente
    if (step === 'basic') {
      if (!nombreNegocio.trim()) {
        setError("El nombre del negocio es requerido");
        return;
      }
      setStep('contact');
      return;
    }

    if (step === 'contact') {
      setStep('location');
      return;
    }

    // Paso final: Crear tenant y actualizar usuario
    if (step === 'location') {
      completeRegistration();
    }
  };

  const completeRegistration = async () => {
    setLoading(true);
    setError("");

    try {
      // 1. Resolver ID de Auth: signUp, sesión actual o nuevo login
      let authUserId = registeredAuthUserId;

      if (!authUserId) {
        const { data: cur, error: userError } = await insforgeClient.auth.getCurrentUser();
        if (!userError && cur?.user?.id) {
          authUserId = cur.user.id;
        }
      }

      if (!authUserId && email && password) {
        const { data: signInData, error: signInErr } = await insforgeClient.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!signInErr) {
          const accessToken = extractAccessTokenFromPayload(signInData);
          if (accessToken) {
            try { insforgeClient.getHttpClient().setAuthToken(accessToken); } catch { /* ignore */ }
          }

          const refreshToken = extractRefreshTokenFromPayload(signInData);
          if (refreshToken) {
            localStorage.setItem(INSFORGE_REFRESH_TOKEN_STORAGE_KEY, refreshToken);
            try { insforgeClient.getHttpClient().setRefreshToken(refreshToken); } catch { /* ignore */ }
          }
          const { data: cur2 } = await insforgeClient.auth.getCurrentUser();
          if (cur2?.user?.id) authUserId = cur2.user.id;
        }
      }

      if (!authUserId) {
        throw new Error(
          "No se pudo vincular la sesión. Cerrá el modal, iniciá sesión con tu correo y volvé a completar el registro desde Ajustes o contactá soporte."
        );
      }

      // 2. Crear el tenant y su usuario due?o en una sola operaci?n de BD.
      // Direct inserts contra `tenants` + `tenant_users` rompen con RLS: todav?a no existe
      // membres?a del tenant para que la policy pueda autorizar al usuario.
      const { data: registrationRows, error: registrationError } = await insforgeClient.database.rpc(
        'cyberbistro_register_tenant',
        {
          p_auth_user_id: authUserId,
          p_email: email.trim(),
          p_nombre_negocio: nombreNegocio.trim(),
          p_rnc: rnc.trim() || null,
          p_direccion: direccion.trim() || null,
          p_telefono: telefono.trim() || null,
          p_plan: plan,
        }
      );

      const registration = (Array.isArray(registrationRows) ? registrationRows[0] : registrationRows) as { tenant_id?: string } | null;

      if (registrationError || !registration?.tenant_id) {
        throw new Error(registrationError?.message || "Error al crear tenant");
      }

      const tenantId = registration.tenant_id;

      writeTenantSessionCache(authUserId, {
        tenant_id: tenantId,
        email: email.trim(),
        rol: "admin",
        nombre: nombreNegocio.trim() || null,
        plan: plan,
      });

      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);

    } catch (err: any) {
      setError(err.message || "Error al completar registro");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full">
      <TitleBar />

      <div className="flex items-center justify-center p-4 relative flex-1 w-full overflow-hidden">
      {/* Background */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute bg-background inset-0 transition-colors duration-300" />
        <div className="absolute inset-0 overflow-hidden">
          <img alt="" className="absolute h-full left-0 max-w-none top-0 w-full object-cover" src={imgLoginRegistro} />
        </div>
        <div className="absolute bg-[rgba(14,14,14,0.9)] inset-0" />
      </div>

      {/* Main Card */}
      <div className={`content-stretch flex flex-col gap-3 sm:gap-4 items-start w-full max-w-full relative shrink-0 mx-auto transition-all duration-500 ease-in-out ${
        step === 'plan' ? 'sm:max-w-[850px] md:max-w-[900px]' : 'sm:max-w-[400px]'
      }`}>
        <div className="absolute bg-[rgba(255,144,109,0.1)] blur-[50px] left-[-96px] rounded-[9999px] size-[256px] top-[-96px]" />

        <div className="backdrop-blur-[8px] bg-[rgba(38,38,38,0.6)] relative rounded-[8px] sm:rounded-[12px] shrink-0 w-full">
          <div className="overflow-clip rounded-[inherit] size-full">
            <div className="content-stretch flex flex-col gap-4 sm:gap-6 items-start p-3 sm:p-5 relative w-full">
              {/* Scanline overlay */}
              <div className="absolute inset-px opacity-3 pointer-events-none">
                <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgDecorativeScanlineEffect} />
              </div>

              {/* Header */}
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col gap-[8px] items-center relative w-full">
                  <div className="bg-[#262626] flex items-center justify-center px-px py-2 sm:py-3 relative rounded-[8px] sm:rounded-[12px] shrink-0 w-[48px] sm:w-[64px]">
                    <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[8px] sm:rounded-[12px]" />
                    <div className="h-[20px] sm:h-[30px] relative shrink-0 w-[15px] sm:w-[22.5px]">
                      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 22.5 30">
                        <path d={svgPaths.p280a6f80} fill="#FF906D" />
                      </svg>
                    </div>
                  </div>
                  <div className="pt-2 sm:pt-4">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[20px] sm:text-[28px] md:text-[36px] text-center tracking-[-1px] sm:tracking-[-1.8px] uppercase">
                      Registro
                    </div>
                  </div>
                  <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] sm:text-[12px] text-center tracking-[1px] sm:tracking-[1.2px] uppercase">
                    {step === 'account' && 'Crea tu Cuenta'}
                    {step === 'plan' && 'Selecciona tu Plan'}
                    {step === 'basic' && 'Información Básica'}
                    {step === 'contact' && 'Contacto'}
                    {step === 'location' && 'Ubicación'}
                  </div>
                </div>
              </div>

              {/* Success Message */}
              {success && (
                <div className="bg-[rgba(89,238,80,0.1)] border border-[#59ee50] rounded-[8px] p-[12px]">
                  <div className="font-['Inter',sans-serif] text-[#59ee50] text-[12px] text-center">
                    ¡Registro exitoso! Redirigiendo al login...
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-[rgba(255,115,70,0.1)] border border-[#ff7346] rounded-[8px] p-[12px]">
                  <div className="font-['Inter',sans-serif] text-[#ff7346] text-[12px] text-center">
                    {error}
                  </div>
                </div>
              )}

              {/* Progress Indicator */}
              <div className="flex items-center justify-center gap-1.5 my-3 w-full">
                <div className={`flex items-center justify-center size-[24px] rounded-full font-['Space_Grotesk',sans-serif] font-bold text-[11px] transition-all duration-300 ${
                  step === 'account' ? 'bg-[#ff906d] text-black' : 'bg-[#262626] text-[#adaaaa]'
                }`}>
                  1
                </div>
                <div className={`w-4 h-[2px] rounded-full transition-all duration-300 ${
                  step !== 'account' ? 'bg-[#ff906d]' : 'bg-[#262626]'
                }`} />
                <div className={`flex items-center justify-center size-[24px] rounded-full font-['Space_Grotesk',sans-serif] font-bold text-[11px] transition-all duration-300 ${
                  step === 'plan' ? 'bg-[#ff906d] text-black' : 'bg-[#262626] text-[#adaaaa]'
                }`}>
                  2
                </div>
                <div className={`w-4 h-[2px] rounded-full transition-all duration-300 ${
                  step !== 'account' && step !== 'plan' ? 'bg-[#ff906d]' : 'bg-[#262626]'
                }`} />
                <div className={`flex items-center justify-center size-[24px] rounded-full font-['Space_Grotesk',sans-serif] font-bold text-[11px] transition-all duration-300 ${
                  step === 'basic' ? 'bg-[#ff906d] text-black' : 'bg-[#262626] text-[#adaaaa]'
                }`}>
                  3
                </div>
                <div className={`w-4 h-[2px] rounded-full transition-all duration-300 ${
                  step === 'contact' || step === 'location' ? 'bg-[#ff906d]' : 'bg-[#262626]'
                }`} />
                <div className={`flex items-center justify-center size-[24px] rounded-full font-['Space_Grotesk',sans-serif] font-bold text-[11px] transition-all duration-300 ${
                  step === 'contact' ? 'bg-[#ff906d] text-black' : 'bg-[#262626] text-[#adaaaa]'
                }`}>
                  4
                </div>
                <div className={`w-4 h-[2px] rounded-full transition-all duration-300 ${
                  step === 'location' ? 'bg-[#ff906d]' : 'bg-[#262626]'
                }`} />
                <div className={`flex items-center justify-center size-[24px] rounded-full font-['Space_Grotesk',sans-serif] font-bold text-[11px] transition-all duration-300 ${
                  step === 'location' ? 'bg-[#ff906d] text-black' : 'bg-[#262626] text-[#adaaaa]'
                }`}>
                  5
                </div>
              </div>

              {/* Step 1: Account */}
              {step === 'account' && (
                <div className="relative shrink-0 w-full flex flex-col gap-3 sm:gap-4">
                  <div className="relative shrink-0 w-full">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2">
                      Correo
                    </div>
                    <div className="bg-[#131313] relative w-full">
                      <div className="flex items-center relative">
                        <div className="absolute left-3 sm:left-[18px] w-3 sm:w-[15px]">
                          <svg className="block w-full" fill="none" viewBox="0 0 15.0408 16.6369">
                            <path d={svgPaths.p2b44ee60} fill="#484847" />
                          </svg>
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="usuario@correo.com"
                          className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-10 sm:pl-12 pr-4 py-3 sm:py-4 outline-none"
                        />
                      </div>
                      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                    </div>
                  </div>

                  <div className="relative shrink-0 w-full">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2">
                      Contraseña
                    </div>
                    <div className="bg-[#131313] relative w-full">
                      <div className="flex items-center relative">
                        <div className="absolute left-3 sm:left-[17px] w-4 sm:w-[19px]">
                          <svg className="block w-full" fill="none" viewBox="0 0 19.1667 10">
                            <path d={svgPaths.p22917200} fill="#484847" />
                          </svg>
                        </div>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-10 sm:pl-12 pr-4 py-3 sm:py-4 outline-none"
                        />
                      </div>
                      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                    </div>
                  </div>

                  <div className="relative shrink-0 w-full">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2">
                      Confirmar Contraseña
                    </div>
                    <div className="bg-[#131313] relative w-full">
                      <div className="flex items-center relative">
                        <div className="absolute left-3 sm:left-[17px] w-4 sm:w-[19px]">
                          <svg className="block w-full" fill="none" viewBox="0 0 19.1667 10">
                            <path d={svgPaths.p22917200} fill="#484847" />
                          </svg>
                        </div>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repite tu contraseña"
                          className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-10 sm:pl-12 pr-4 py-3 sm:py-4 outline-none"
                        />
                      </div>
                      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                    </div>
                  </div>

                  {/* Create Account Button */}
                  <button
                    onClick={handleRegister}
                    disabled={loading}
                    className="flex items-center justify-center py-3 sm:py-4 rounded-[8px] sm:rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.4)] shrink-0 w-full cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-[0px_0px_30px_0px_rgba(255,144,109,0.6)] hover:scale-[1.02] active:scale-95"
                    style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                  >
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[12px] sm:text-[14px] text-black text-center tracking-[1.2px] sm:tracking-[1.4px] uppercase">
                      {loading ? "Creando cuenta..." : "Crear Cuenta"}
                    </span>
                  </button>
                </div>
              )}

              {/* Step 2: Plan Selection */}
              {step === 'plan' && (
                <div className="relative shrink-0 w-full flex flex-col gap-3">
                  <div className="font-['Inter',sans-serif] text-center text-[#adaaaa] text-[11px] mb-1 sm:mb-2 leading-relaxed">
                    Elegí el plan para tu bistro. Podés cambiarlo en cualquier momento desde el panel de Super Admin.
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3.5 sm:gap-4 w-full items-stretch">
                    {/* Plan Básico */}
                    <div
                      onClick={() => setPlan('basico')}
                      className={`cursor-pointer rounded-[10px] border p-3.5 transition-all duration-300 relative overflow-clip flex-1 flex flex-col justify-between ${
                        plan === 'basico'
                          ? 'bg-[rgba(132,204,22,0.06)] border-[#84cc16] shadow-[0px_0px_12px_rgba(132,204,22,0.12)]'
                          : 'bg-[rgba(20,20,20,0.4)] border-[rgba(72,72,71,0.22)] hover:border-[rgba(255,144,109,0.25)]'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <div>
                            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] uppercase tracking-[0.5px]">
                              Plan Básico
                            </h4>
                            <p className="font-['Inter',sans-serif] text-[10px] text-[#adaaaa] mt-0.5">
                              Ideal para empezar sin rodeos
                            </p>
                          </div>
                          <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#84cc16] text-[12px] whitespace-nowrap">
                            $40/Mes
                          </div>
                        </div>

                        <ul className="flex flex-col gap-1 mt-2.5 pl-0 list-none text-left">
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-[#adaaaa]">
                            <span className="text-[#84cc16] text-[11px]">✓</span> 1 Sucursal Única
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-[#adaaaa]">
                            <span className="text-[#84cc16] text-[11px]">✓</span> 5 Usuarios Máximo
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-[#adaaaa]">
                            <span className="text-[#84cc16] text-[11px]">✓</span> Reportes Básicos
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-[#555] line-through">
                            ✗ Múltiples Sucursales
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-[#555] line-through">
                            ✗ Control de Inventario y Recetas
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Plan Profesional */}
                    <div
                      onClick={() => setPlan('profesional')}
                      className={`cursor-pointer rounded-[10px] border p-3.5 transition-all duration-300 relative overflow-clip flex-1 flex flex-col justify-between ${
                        plan === 'profesional'
                          ? 'bg-[rgba(59,130,246,0.1)] border-[#3b82f6] shadow-[0px_0px_16px_rgba(59,130,246,0.2)]'
                          : 'bg-[rgba(20,20,20,0.4)] border-[rgba(72,72,71,0.22)] hover:border-[rgba(255,144,109,0.25)]'
                      }`}
                    >
                      <div className="absolute top-0 right-0 bg-[#3b82f6] text-white font-['Space_Grotesk',sans-serif] font-bold text-[8px] uppercase tracking-[0.5px] px-1.5 py-0.5 rounded-bl-[6px]">
                        Recomendado
                      </div>

                      <div>
                        <div className="flex justify-between items-start mb-1 gap-2 pt-2.5 sm:pt-0">
                          <div>
                            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] uppercase tracking-[0.5px] flex items-center gap-1">
                              Plan Profesional
                            </h4>
                            <p className="font-['Inter',sans-serif] text-[10px] text-[#adaaaa] mt-0.5">
                              Control total y expansión
                            </p>
                          </div>
                          <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#3b82f6] text-[12px] whitespace-nowrap">
                            $80/Mes
                          </div>
                        </div>

                        <ul className="flex flex-col gap-1 mt-2.5 pl-0 list-none text-left">
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-white">
                            <span className="text-[#3b82f6] text-[11px]">✓</span> <b>Hasta 3 Sucursales</b>
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-white">
                            <span className="text-[#3b82f6] text-[11px]">✓</span> <b>Usuarios Ilimitados</b>
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-white">
                            <span className="text-[#3b82f6] text-[11px]">✓</span> <b>Inventario y Recetas</b>
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-white">
                            <span className="text-[#3b82f6] text-[11px]">✓</span> <b>Facturación Electrónica (e-CF)</b>
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-[#adaaaa]">
                            <span className="text-[#3b82f6] text-[11px]">✓</span> Reportes de Cocina
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Plan Empresarial */}
                    <div
                      onClick={() => setPlan('empresarial')}
                      className={`cursor-pointer rounded-[10px] border p-3.5 transition-all duration-300 relative overflow-clip flex-1 flex flex-col justify-between ${
                        plan === 'empresarial'
                          ? 'bg-[rgba(139,92,246,0.1)] border-[#8b5cf6] shadow-[0px_0px_16px_rgba(139,92,246,0.2)]'
                          : 'bg-[rgba(20,20,20,0.4)] border-[rgba(72,72,71,0.22)] hover:border-[rgba(255,144,109,0.25)]'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <div>
                            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] uppercase tracking-[0.5px] flex items-center gap-1">
                              Plan Empresarial
                            </h4>
                            <p className="font-['Inter',sans-serif] text-[10px] text-[#adaaaa] mt-0.5">
                              Locales ilimitados y soporte
                            </p>
                          </div>
                          <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#a78bfa] text-[12px] whitespace-nowrap">
                            $150/Mes
                          </div>
                        </div>

                        <ul className="flex flex-col gap-1 mt-2.5 pl-0 list-none text-left">
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-white">
                            <span className="text-[#a78bfa] text-[11px]">✓</span> <b>Sucursales Ilimitadas</b>
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-white">
                            <span className="text-[#a78bfa] text-[11px]">✓</span> <b>Integraciones Avanzadas</b>
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-white">
                            <span className="text-[#a78bfa] text-[11px]">✓</span> <b>Soporte 24/7 Corporativo</b>
                          </li>
                          <li className="flex items-center gap-2 font-['Inter',sans-serif] text-[10.5px] text-white">
                            <span className="text-[#a78bfa] text-[11px]">✓</span> Todo al 100% incluido
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 w-full justify-center mt-3">
                    <button
                      onClick={() => setStep('account')}
                      className="flex items-center justify-center py-3 px-6 rounded-[8px] sm:rounded-[10px] shrink-0 cursor-pointer border-none bg-[#262626] text-[#adaaaa] transition-all duration-300 hover:bg-[#333] active:scale-95 order-2 sm:order-1 sm:w-[150px]"
                    >
                      <span className="font-['Inter',sans-serif] font-bold text-[11px] uppercase">
                        Volver
                      </span>
                    </button>
                    <button
                      onClick={handleRegister}
                      className="flex items-center justify-center py-3 px-8 rounded-[8px] sm:rounded-[10px] shadow-[0px_0px_15px_0px_rgba(255,144,109,0.3)] shrink-0 cursor-pointer border-none transition-all duration-300 hover:shadow-[0px_0px_25px_0px_rgba(255,144,109,0.5)] hover:scale-[1.01] active:scale-95 order-1 sm:order-2 sm:flex-1"
                      style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                    >
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[12px] text-black text-center tracking-[1.2px] uppercase">
                        Continuar
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Basic Info */}
              {step === 'basic' && (
                <div className="relative shrink-0 w-full flex flex-col gap-3 sm:gap-4">
                  <div className="relative shrink-0 w-full">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2">
                      Nombre del Negocio *
                    </div>
                    <div className="bg-[#131313] relative w-full">
                      <input
                        type="text"
                        value={nombreNegocio}
                        onChange={(e) => setNombreNegocio(e.target.value)}
                        placeholder="Ej: La Cocina de Mamá"
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] px-4 py-3 sm:py-4 outline-none"
                      />
                      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Contact */}
              {step === 'contact' && (
                <div className="relative shrink-0 w-full flex flex-col gap-3 sm:gap-4">
                  <div className="relative shrink-0 w-full">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2">
                      RNC
                    </div>
                    <div className="bg-[#131313] relative w-full">
                      <input
                        type="text"
                        value={rnc}
                        onChange={(e) => setRnc(e.target.value)}
                        placeholder="Opcional"
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] px-4 py-3 sm:py-4 outline-none"
                      />
                      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                    </div>
                  </div>

                  <div className="relative shrink-0 w-full">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2">
                      Teléfono
                    </div>
                    <div className="bg-[#131313] relative w-full">
                      <input
                        type="tel"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="Opcional"
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] px-4 py-3 sm:py-4 outline-none"
                      />
                      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Location */}
              {step === 'location' && (
                <div className="relative shrink-0 w-full flex flex-col gap-3 sm:gap-4">
                  <div className="relative shrink-0 w-full">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[9px] sm:text-[10px] tracking-[0.8px] sm:tracking-[1px] uppercase mb-1 sm:mb-2">
                      Dirección
                    </div>
                    <div className="bg-[#131313] relative w-full">
                      <input
                        type="text"
                        value={direccion}
                        onChange={(e) => setDireccion(e.target.value)}
                        placeholder="Opcional"
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[14px] sm:text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] px-4 py-3 sm:py-4 outline-none"
                      />
                      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                    </div>
                  </div>

                  {/* Complete Registration Button */}
                  <button
                    onClick={handleRegister}
                    disabled={loading || success}
                    className="flex items-center justify-center py-3 sm:py-4 rounded-[8px] sm:rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.4)] shrink-0 w-full cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-[0px_0px_30px_0px_rgba(255,144,109,0.6)] hover:scale-[1.02] active:scale-95"
                    style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                  >
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[12px] sm:text-[14px] text-black text-center tracking-[1.2px] sm:tracking-[1.4px] uppercase">
                      {loading ? "Completando..." : success ? "¡Completado!" : "Completar Registro"}
                    </span>
                  </button>

                  {/* Back Button */}
                  <button
                    onClick={() => setStep('contact')}
                    disabled={loading || success}
                    className="flex items-center justify-center py-2 sm:py-3 rounded-[8px] sm:rounded-[12px] shrink-0 w-full cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed bg-[#262626] text-[#adaaaa] transition-all duration-300 hover:bg-[#333] active:scale-95"
                  >
                    <span className="font-['Inter',sans-serif] font-bold text-[11px] sm:text-[12px] uppercase">
                      Volver
                    </span>
                  </button>
                </div>
              )}

              {/* Next/Back Buttons for Steps 3-4 */}
              {(step === 'basic' || step === 'contact') && (
                <div className="relative shrink-0 w-full flex flex-col gap-2">
                  <button
                    onClick={handleRegister}
                    disabled={loading}
                    className="flex items-center justify-center py-3 sm:py-4 rounded-[8px] sm:rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.4)] shrink-0 w-full cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-[0px_0px_30px_0px_rgba(255,144,109,0.6)] hover:scale-[1.02] active:scale-95"
                    style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                  >
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[12px] sm:text-[14px] text-black text-center tracking-[1.2px] sm:tracking-[1.4px] uppercase">
                      Siguiente
                    </span>
                  </button>

                  <button
                    onClick={() => setStep(step === 'basic' ? 'plan' : 'basic')}
                    disabled={loading}
                    className="flex items-center justify-center py-2 sm:py-3 rounded-[8px] sm:rounded-[12px] shrink-0 w-full cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed bg-[#262626] text-[#adaaaa] transition-all duration-300 hover:bg-[#333] active:scale-95"
                  >
                    <span className="font-['Inter',sans-serif] font-bold text-[11px] sm:text-[12px] uppercase">
                      Volver
                    </span>
                  </button>
                </div>
              )}

              {/* Footer */}
              <div className="relative shrink-0 w-full flex flex-col gap-4 sm:gap-4 items-center">
                <div
                  onClick={() => navigate("/")}
                  className="flex gap-[8px] items-center cursor-pointer"
                >
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff6aa0] text-[12px] tracking-[1.2px] uppercase">
                    Volver al Login
                  </span>
                  <div className="relative size-[9.333px]">
                    <svg className="block size-full" fill="none" viewBox="0 0 9.33333 9.33333">
                      <path d={svgPaths.pce77c00} fill="#FF6AA0" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[12px] shadow-[0px_0px_40px_-10px_rgba(255,144,109,0.3)]" />
        </div>

        <div className="absolute bg-[rgba(255,106,160,0.1)] blur-[50px] bottom-[-96px] right-[-96px] rounded-[9999px] size-[256px]" />
      </div>
      </div>
    </div>
  );
}
