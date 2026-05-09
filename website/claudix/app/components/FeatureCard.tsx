"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

export function FeatureCard({ icon, title, description, delay = 0 }: { 
  icon: ReactNode; 
  title: string; 
  description: string; 
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
      className="group p-8 rounded-2xl bg-card/40 border border-border/50 hover:border-primary/30 hover:bg-card/70 transition-all duration-500 relative overflow-hidden fade-up-element"
      style={{ 
        transitionDelay: `${delay}s`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
      }}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
      
      <div className="relative z-10">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 group-hover:bg-primary/15 transition-all duration-300">
          {icon}
        </div>
        <h4 className="text-xl font-display font-700 mb-3 tracking-tight">{title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
