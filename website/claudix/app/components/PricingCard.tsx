"use client";

import { useRef, useEffect, useState } from "react";
import { Check } from "lucide-react";

export function PricingCard({ name, price, features, color, highlighted = false, delay = 0 }: { 
  name: string; 
  price: string; 
  features: string[];
  color: string;
  highlighted?: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "-50px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref}
      className={`p-8 flex flex-col rounded-2xl border transition-all relative overflow-hidden ${
        highlighted 
          ? 'bg-card/80 border-primary/40 scale-[1.02] lg:scale-105' 
          : 'bg-card/30 border-border/50 hover:border-border'
      }`}
      style={{
        transitionDelay: `${delay}s`,
        opacity: visible ? 1 : 0,
        transform: visible 
          ? (highlighted ? 'scale(1.02)' : 'translateY(0)') 
          : 'translateY(20px)',
        transitionDuration: '0.5s',
        transitionProperty: 'opacity, transform',
      }}
    >
      {highlighted && (
        <>
          <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${color}, oklch(0.82 0.14 60))` }} />
          <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl pointer-events-none" style={{ background: color, opacity: 0.08 }} />
        </>
      )}
      
      <div className="relative z-10 flex flex-col flex-1">
        <h4 className="text-sm font-semibold tracking-wider uppercase mb-6" style={{ color }}>{name}</h4>
        <div className="flex items-baseline gap-1 mb-8">
          <span className="text-sm font-medium text-muted-foreground">US$</span>
          <span className="text-5xl font-display font-900 tracking-tight" style={{ color }}>{price}</span>
          <span className="text-sm text-muted-foreground ml-1">/ mes</span>
        </div>
        <div className="flex-1 space-y-4 mb-8 pt-6 border-t border-border/30">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: `color-mix(in oklch, ${color}, transparent 85%)` }}>
                <Check size={12} style={{ color }} />
              </div>
              <span className="text-sm text-foreground/80">{f}</span>
            </div>
          ))}
        </div>
        <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
          <button 
            className={`w-full py-4 text-sm font-bold rounded-xl transition-all duration-300 border-none cursor-pointer ${
              highlighted 
                ? 'hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]' 
                : 'hover:opacity-90 active:scale-[0.98]'
            }`} 
            style={{ 
              backgroundColor: highlighted ? color : 'transparent',
              color: highlighted ? 'white' : color,
              border: highlighted ? 'none' : `1.5px solid color-mix(in oklch, ${color}, transparent 60%)`
            }}
          >
            Seleccionar
          </button>
        </a>
      </div>
    </div>
  );
}
