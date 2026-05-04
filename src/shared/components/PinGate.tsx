import { useState } from "react";

interface PinGateProps {
  onUnlock: () => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  correctPin?: string;
}

export function PinGateModal({ onUnlock, onCancel, title = "Clave Requerida", subtitle = "Ingresá la clave para continuar", correctPin = "1110" }: PinGateProps) {
  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);

  function handleDigit(digit: string) {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);

    if (next.length === 4) {
      if (next === correctPin) {
        onUnlock();
      } else {
        setShaking(true);
        setTimeout(() => { setPin(""); setShaking(false); }, 600);
      }
    }
  }

  function handleBackspace() {
    if (pin.length > 0) {
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
                onClick={() => (isDel ? handleBackspace() : handleDigit(key))}
                className="w-full aspect-square rounded-[16px] font-['Space_Grotesk',sans-serif] font-bold text-[20px] cursor-pointer border-none transition-all active:scale-95 flex items-center justify-center"
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
          onClick={onCancel}
          className="w-full mt-4 py-3 bg-muted text-muted-foreground rounded-[8px] font-['Inter',sans-serif] font-bold text-[12px] uppercase cursor-pointer border-none hover:bg-accent transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}