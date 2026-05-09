"use client";

import { ArrowRight, Sparkles, Star } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative py-28 md:py-40 overflow-hidden">
      {/* Mesh background */}
      <div className="absolute inset-0 mesh-bg" />
      
      {/* Floating orbs — use will-change for GPU compositing */}
      <div className="absolute top-20 right-[15%] w-72 h-72 rounded-full bg-primary/8 blur-3xl float-animation pointer-events-none will-change-transform" />
      <div className="absolute bottom-10 left-[10%] w-96 h-96 rounded-full bg-accent/5 blur-3xl float-animation pointer-events-none will-change-transform" style={{ animationDelay: "-3s" }} />
      <div className="absolute top-1/2 right-[5%] w-48 h-48 rounded-full bg-primary/5 blur-2xl pulse-glow pointer-events-none hidden lg:block will-change-[opacity]" />
      
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center hero-stagger">
          <div className="hero-item inline-flex items-center gap-2 bg-primary/10 border border-primary/20 px-5 py-2 rounded-full mb-8">
            <Sparkles size={14} className="text-primary" />
            <span className="text-primary text-xs font-semibold tracking-wide">Tecnología que sabe a éxito</span>
          </div>
          
          <h1 className="hero-item text-5xl md:text-7xl lg:text-8xl font-display font-900 mb-6 tracking-tight leading-[0.95]">
            Tu restaurante,{" "}
            <span className="gradient-text">un solo sistema</span>
          </h1>
          
          <p className="hero-item text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Control total de tu negocio, desde el pedido hasta la cocina, en tiempo real. 
            Sin complicaciones, sin sorpresas.
          </p>
          
          <div className="hero-item flex flex-col sm:flex-row gap-4 justify-center">
            <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
              <button className="gradient-primary text-primary-foreground px-10 py-4 text-base font-bold rounded-full flex items-center justify-center gap-3 hover:shadow-xl hover:shadow-primary/30 hover:scale-105 transition-all duration-300 border-none cursor-pointer group">
                ¡Pruébalo Gratis!
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </a>
            <a href="#features" className="contents">
              <button className="border border-border bg-card/50 backdrop-blur-sm text-foreground px-10 py-4 text-base font-semibold rounded-full hover:bg-card hover:border-primary/30 transition-all duration-300 cursor-pointer">
                Ver Funciones
              </button>
            </a>
          </div>

          {/* Trust indicators */}
          <div className="hero-item mt-16 flex flex-wrap items-center justify-center gap-8 text-muted-foreground/60">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className="text-primary fill-primary" />
                ))}
              </div>
              <span className="text-xs font-medium">Valorado 5/5</span>
            </div>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <span className="text-xs font-medium">+100 Restaurantes</span>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <span className="text-xs font-medium">Soporte en español</span>
          </div>
        </div>
      </div>
    </section>
  );
}
