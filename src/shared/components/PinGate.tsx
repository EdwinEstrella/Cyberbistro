import { useState } from "react";

interface PinGateProps {
  onUnlock: (pin?: string) => void;
  onVerify?: (pin: string) => Promise<boolean> | boolean;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  correctPin?: string;
}

export function PinGateModal({ onUnlock, onVerify, onCancel, title = "Clave Requerida", subtitle = "Ingresá la clave para continuar", correctPin }: PinGateProps) {
  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function handleDigit(digit: string) {
    if (pin.length >= 4 || verifying) return;
    const next = pin + digit;
    setPin(next);

    if (next.length === 4) {
      if (onVerify) {
        setVerifying(true);
        const isValid = await onVerify(next);
        setVerifying(false);
        if (isValid) {
          onUnlock(next);
        } else {
          setShaking(true);
          setTimeout(() => { setPin(""); setShaking(false); }, 600);
        }
      } else if (correctPin) {
        if (next === correctPin) {
          onUnlock(next);
        } else {
          setShaking(true);
          setTimeout(() => { setPin(""); setShaking(false); }, 600);
        }
      } else {
        // If no correctPin and no onVerify provided, just return the entered PIN
        onUnlock(next);
      }
    }
  }

  function handleBackspace() {
    if (pin.length > 0 && !verifying) {
      setPin(pin.slice(0, -1));
    }
  }

  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/95 backdrop-blur-sm transition-colors duration-300">
      <div className="bg-card border border-border rounded-[20px] p-[32px] w-full max-w-[320px] shadow-2xl">
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[18px] text-center mb-2">
          {title}
        </h3>
        <p className="font-['Inter',sans-serif] text-muted-foreground text-[12px] text-center mb-6">
          {subtitle}
        </p>

        <div
          className="flex gap-[14px] justify-center mb-6"
          style={{ animation: shaking ? "shake 0.5s ease" : undefined }}
        >
          <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
          {[0,1,2,3].map((i) => (
            <div
              key={i}
              className="size-[14px] rounded-full transition-all duration-150"
              style={{
                backgroundColor: i < pin.length ? (shaking ? "#ff716c" : "#ff906d") : "var(--muted)",
                boxShadow: i < pin.length && !shaking ? "0 0 10px rgba(255,144,109,0.5)" : undefined,
                opacity: verifying ? 0.5 : 1,
              }}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-[10px]">
          {keys.map((key, i) => {
            if (key === "") return <div key={i} />;
            const isDel = key === "⌫";
            return (
              <button
                key={i}
                disabled={verifying}
                onClick={() => (isDel ? handleBackspace() : handleDigit(key))}
                className="w-full aspect-square rounded-[16px] font-['Space_Grotesk',sans-serif] font-bold text-[20px] cursor-pointer border-none transition-all active:scale-95 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isDel ? "rgba(255,113,108,0.1)" : "var(--accent)",
                  color: isDel ? "#ff716c" : "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              >{key}</button>
            );
          })}
        </div>

        <button
          disabled={verifying}
          onClick={onCancel}
          className="w-full mt-4 py-3 bg-muted text-muted-foreground rounded-[8px] font-['Inter',sans-serif] font-bold text-[12px] uppercase cursor-pointer border-none hover:bg-accent transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}