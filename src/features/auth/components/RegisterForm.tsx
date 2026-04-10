import { useState } from "react";
import { useNavigate } from "react-router";
import svgPaths from "../../../imports/svg-h2gjocs89h";
import imgLoginRegistro from "figma:asset/47f7239cc7433af3270415eeec94f9bdbb11cd99.png";
import imgDecorativeScanlineEffect from "figma:asset/70a05c412757c6d4e1cffbb0780858880dce7a5a.png";
import { TitleBar } from "../../window";
import { insforgeClient } from "../../../shared/lib/insforge";

export function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: authError } = await insforgeClient.auth.signUp({
      email,
      password
    });

    setLoading(false);

    if (authError) {
      setError(authError.message || "Error al registrar usuario");
      return;
    }

    if (data.user) {
      setSuccess(true);
      // Redirigir al login después de 2 segundos
      setTimeout(() => {
        navigate("/");
      }, 2000);
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full">
      <TitleBar />

      <div className="flex items-center justify-center p-4 relative flex-1 w-full overflow-hidden">
      {/* Background */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute bg-[#0e0e0e] inset-0" />
        <div className="absolute inset-0 overflow-hidden">
          <img alt="" className="absolute h-full left-0 max-w-none top-0 w-full object-cover" src={imgLoginRegistro} />
        </div>
        <div className="absolute bg-[rgba(14,14,14,0.9)] inset-0" />
      </div>

      {/* Main Card */}
      <div className="content-stretch flex flex-col gap-3 sm:gap-4 items-start w-full max-w-full sm:max-w-[400px] relative shrink-0 mx-auto">
        <div className="absolute bg-[rgba(255,144,109,0.1)] blur-[50px] left-[-96px] rounded-[9999px] size-[256px] top-[-96px]" />

        <div className="backdrop-blur-[8px] bg-[rgba(38,38,38,0.6)] relative rounded-[8px] sm:rounded-[12px] shrink-0 w-full">
          <div className="overflow-clip rounded-[inherit] size-full">
            <div className="content-stretch flex flex-col gap-4 sm:gap-6 items-start p-3 sm:p-5 relative w-full">
              {/* Scanline overlay */}
              <div className="absolute inset-px opacity-3">
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
                    Nueva Unidad CyberBistro
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

              {/* Form */}
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

                <button
                  onClick={handleRegister}
                  disabled={loading || success}
                  className="flex items-center justify-center py-3 sm:py-4 rounded-[8px] sm:rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.4)] shrink-0 w-full cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                >
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[12px] sm:text-[14px] text-black text-center tracking-[1.2px] sm:tracking-[1.4px] uppercase">
                    {loading ? "Registrando..." : success ? "¡Registrado!" : "Crear Cuenta"}
                  </span>
                </button>
              </div>

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
