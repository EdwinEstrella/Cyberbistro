import { useState } from "react";
import { useNavigate } from "react-router";
import svgPaths from "../../imports/svg-h2gjocs89h";
import imgLoginRegistro from "figma:asset/47f7239cc7433af3270415eeec94f9bdbb11cd99.png";
import imgDecorativeScanlineEffect from "figma:asset/70a05c412757c6d4e1cffbb0780858880dce7a5a.png";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate("/dashboard");
  };

  return (
    <div className="flex items-center justify-center px-[24px] py-[86px] relative min-h-screen w-full">
      {/* Background */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute bg-[#0e0e0e] inset-0" />
        <div className="absolute inset-0 overflow-hidden">
          <img alt="" className="absolute h-full left-0 max-w-none top-0 w-full object-cover" src={imgLoginRegistro} />
        </div>
        <div className="absolute bg-[rgba(14,14,14,0.9)] inset-0" />
      </div>

      {/* Main Card */}
      <div className="content-stretch flex flex-col gap-[24px] items-start max-w-[480px] relative shrink-0 w-[480px]">
        <div className="absolute bg-[rgba(255,144,109,0.1)] blur-[50px] left-[-96px] rounded-[9999px] size-[256px] top-[-96px]" />

        <div className="backdrop-blur-[8px] bg-[rgba(38,38,38,0.6)] relative rounded-[12px] shrink-0 w-full">
          <div className="overflow-clip rounded-[inherit] size-full">
            <div className="content-stretch flex flex-col gap-[40px] items-start p-[49px] relative w-full">
              {/* Scanline overlay */}
              <div className="absolute inset-px opacity-3">
                <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgDecorativeScanlineEffect} />
              </div>

              {/* Header */}
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col gap-[8px] items-center relative w-full">
                  <div className="bg-[#262626] flex items-center justify-center px-px py-[12px] relative rounded-[12px] shrink-0 w-[64px]">
                    <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[12px]" />
                    <div className="h-[30px] relative shrink-0 w-[22.5px]">
                      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 22.5 30">
                        <path d={svgPaths.p280a6f80} fill="#FF906D" />
                      </svg>
                    </div>
                  </div>
                  <div className="pt-[16px]">
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[36px] text-center tracking-[-1.8px] uppercase">
                      CyberBistro
                    </div>
                  </div>
                  <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] text-center tracking-[1.2px] uppercase">
                    Gastronomy Operating System v4.0.2
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="relative shrink-0 w-full flex flex-col gap-[24px]">
                <div className="relative shrink-0 w-full">
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[10px] tracking-[1px] uppercase mb-[8px]">
                    Correo
                  </div>
                  <div className="bg-[#131313] relative w-full">
                    <div className="flex items-center relative">
                      <div className="absolute left-[18px] w-[15px]">
                        <svg className="block w-full" fill="none" viewBox="0 0 15.0408 16.6369">
                          <path d={svgPaths.p2b44ee60} fill="#484847" />
                        </svg>
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="usuario@correo.com"
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-[48px] pr-[16px] py-[18px] outline-none"
                      />
                    </div>
                    <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                  </div>
                </div>

                <div className="relative shrink-0 w-full">
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff7346] text-[10px] tracking-[1px] uppercase mb-[8px]">
                    Contraseña
                  </div>
                  <div className="bg-[#131313] relative w-full">
                    <div className="flex items-center relative">
                      <div className="absolute left-[17px] w-[19px]">
                        <svg className="block w-full" fill="none" viewBox="0 0 19.1667 10">
                          <path d={svgPaths.p22917200} fill="#484847" />
                        </svg>
                      </div>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-transparent font-['Inter',sans-serif] text-[16px] text-white placeholder:text-[rgba(72,72,71,0.5)] pl-[48px] pr-[16px] py-[18px] outline-none"
                      />
                    </div>
                    <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
                  </div>
                </div>

                <div className="bg-[#262626] relative rounded-[12px] shrink-0 w-full">
                  <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[12px]" />
                  <div className="flex items-center justify-between px-[25px] py-[17px] relative w-full">
                    <div className="flex gap-[12px] items-center">
                      <div className="h-[16px] relative shrink-0 w-[20px]">
                        <svg className="block size-full" fill="none" viewBox="0 0 20 16">
                          <path d={svgPaths.p3b4abf00} fill="#FF6AA0" />
                        </svg>
                      </div>
                      <div className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] text-white tracking-[-0.35px] uppercase">
                        Escaneo Biométrico
                      </div>
                    </div>
                    <div className="flex gap-[4px] items-start">
                      <div className="bg-[rgba(255,106,160,0.4)] h-[12px] rounded-[9999px] w-[4px]" />
                      <div className="bg-[#ff6aa0] h-[12px] rounded-[9999px] w-[4px]" />
                      <div className="bg-[rgba(255,106,160,0.4)] h-[12px] rounded-[9999px] w-[4px]" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  className="flex items-center justify-center py-[16px] rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.4)] shrink-0 w-full cursor-pointer border-none"
                  style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}
                >
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] text-black text-center tracking-[1.4px] uppercase">
                    Iniciar Sesión
                  </span>
                </button>
              </div>

              {/* Footer */}
              <div className="relative shrink-0 w-full flex flex-col gap-[16px] items-center">
                <div className="flex gap-[8px] items-center cursor-pointer">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff6aa0] text-[12px] tracking-[1.2px] uppercase">
                    Registrar Nueva Unidad
                  </span>
                  <div className="relative size-[9.333px]">
                    <svg className="block size-full" fill="none" viewBox="0 0 9.33333 9.33333">
                      <path d={svgPaths.pce77c00} fill="#FF6AA0" />
                    </svg>
                  </div>
                </div>
                <div className="pt-[16px] flex gap-[24px] items-center">
                  <div className="flex gap-[8px] items-center">
                    <div className="bg-[#59ee50] rounded-[9999px] shadow-[0px_0px_8px_0px_#59ee50] size-[8px]" />
                    <span className="font-['Inter',sans-serif] font-medium text-[#adaaaa] text-[10px] uppercase">Núcleo Seguro</span>
                  </div>
                  <div className="flex gap-[8px] items-center">
                    <div className="bg-[#ff906d] rounded-[9999px] shadow-[0px_0px_8px_0px_#ff906d] size-[8px]" />
                    <span className="font-['Inter',sans-serif] font-medium text-[#adaaaa] text-[10px] uppercase">Estación Activa</span>
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
  );
}