import { useState } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";

const ACCESS_PIN = "1110";

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pinInput, setPinInput] = useState("");
  const [shaking, setShaking] = useState(false);

  function handleDigit(digit: string) {
    if (pinInput.length >= 4) return;
    const next = pinInput + digit;
    setPinInput(next);
    if (next.length === 4) {
      if (next === ACCESS_PIN) {
        onUnlock();
      } else {
        setShaking(true);
        setTimeout(() => {
          setPinInput("");
          setShaking(false);
        }, 600);
      }
    }
  }

  function handleDelete() {
    setPinInput((p) => p.slice(0, -1));
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-[32px]">
        <div className="flex flex-col items-center gap-[6px]">
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px]">
            Soporte
          </span>
          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
            Ingresá el PIN para continuar
          </span>
        </div>

        {/* PIN dots */}
        <div
          className="flex gap-[14px] transition-transform"
          style={{
            animation: shaking
              ? "shake 0.5s cubic-bezier(0.36,0.07,0.19,0.97)"
              : undefined,
          }}
        >
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              20% { transform: translateX(-8px); }
              40% { transform: translateX(8px); }
              60% { transform: translateX(-6px); }
              80% { transform: translateX(6px); }
            }
          `}</style>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="size-[14px] rounded-full transition-all duration-150"
              style={{
                backgroundColor:
                  i < pinInput.length
                    ? shaking
                      ? "#ff716c"
                      : "#ff906d"
                    : "rgba(72,72,71,0.4)",
                boxShadow:
                  i < pinInput.length && !shaking
                    ? "0 0 10px rgba(255,144,109,0.5)"
                    : undefined,
              }}
            />
          ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-[10px]">
          {keys.map((key, i) => {
            if (key === "") {
              return <div key={i} />;
            }
            const isDelete = key === "⌫";
            return (
              <button
                key={i}
                onClick={() =>
                  isDelete ? handleDelete() : handleDigit(key)
                }
                className="w-[72px] h-[72px] rounded-[16px] font-['Space_Grotesk',sans-serif] font-bold text-[20px] cursor-pointer border-none transition-all active:scale-95"
                style={{
                  backgroundColor: isDelete
                    ? "rgba(255,113,108,0.1)"
                    : "rgba(38,38,38,0.9)",
                  color: isDelete ? "#ff716c" : "white",
                  border: "1px solid rgba(72,72,71,0.3)",
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SoportePanel({ onLock }: { onLock: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!email.trim() || !password.trim()) {
      setError("Email y contraseña son requeridos.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setCreating(true);
    setError("");
    setSuccess("");

    const { error: authError } = await insforgeClient.auth.signUp({
      email: email.trim(),
      password,
    });

    if (authError) {
      const msg =
        typeof authError === "string"
          ? authError
          : (authError as { message?: string })?.message ?? "Error al crear el usuario.";
      setError(msg);
    } else {
      setSuccess(`Usuario ${email.trim()} creado exitosamente.`);
      setEmail("");
      setPassword("");
    }
    setCreating(false);
  }

  return (
    <div className="flex-1 p-[32px] overflow-auto">
      <div className="max-w-[600px] flex flex-col gap-[32px]">
        <div className="flex items-center justify-between">
          <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px]">
            Soporte
          </h1>
          <button
            onClick={onLock}
            className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] tracking-[0.5px] uppercase cursor-pointer bg-transparent border border-[rgba(72,72,71,0.3)] rounded-[8px] px-[12px] py-[6px] hover:text-[#adaaaa] hover:border-[rgba(72,72,71,0.5)] transition-colors"
          >
            Bloquear
          </button>
        </div>

        {/* Create user card */}
        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[4px]">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
              Crear Nuevo Usuario
            </span>
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
              El usuario recibirá acceso al sistema CyberBistro.
            </span>
          </div>

          {success && (
            <div className="bg-[rgba(89,238,80,0.05)] border border-[rgba(89,238,80,0.2)] rounded-[10px] px-[16px] py-[12px]">
              <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">
                {success}
              </span>
            </div>
          )}
          {error && (
            <div className="bg-[rgba(255,113,108,0.05)] border border-[rgba(255,113,108,0.2)] rounded-[10px] px-[16px] py-[12px]">
              <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">
                {error}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-[16px]">
            <div className="flex flex-col gap-[8px]">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@restaurante.com"
                className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-[16px] py-[12px] font-['Inter',sans-serif] text-white text-[14px] outline-none transition-colors w-full"
                style={{}}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,144,109,0.4)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)")
                }
              />
            </div>
            <div className="flex flex-col gap-[8px]">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-[16px] py-[12px] font-['Inter',sans-serif] text-white text-[14px] outline-none transition-colors w-full"
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,144,109,0.4)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)")
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-[#ff906d] rounded-[12px] px-[24px] py-[13px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[14px] tracking-[0.5px] uppercase cursor-pointer border-none shadow-[0px_0px_20px_0px_rgba(255,144,109,0.2)] transition-opacity disabled:opacity-50 self-start"
          >
            {creating ? "Creando..." : "Crear Usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Soporte() {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <PinGate onUnlock={() => setUnlocked(true)} />;
  }

  return <SoportePanel onLock={() => setUnlocked(false)} />;
}
