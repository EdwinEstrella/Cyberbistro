"use client";

import { motion } from "framer-motion";
import { 
  Receipt, 
  Utensils, 
  ChefHat, 
  BarChart3, 
  WalletCards, 
  ShieldCheck,
  ArrowRight,
  Monitor,
  Database,
  Check,
  Zap
} from "lucide-react";

export default function LandingPage() {
  const fadeIn = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: "easeOut" }
  };

  const stagger = {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold">C</span>
            </div>
            <span className="text-xl font-bold tracking-tighter uppercase">Cloudix</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium hover:text-primary transition-colors uppercase tracking-widest">Funciones</a>
            <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors uppercase tracking-widest">Planes</a>
            <button className="bg-primary text-primary-foreground px-6 py-2 text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-all border-none cursor-pointer">
              Empezar
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-24 md:py-32 overflow-hidden border-b border-border">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <motion.div 
              className="max-w-3xl"
              initial="initial"
              animate="animate"
              variants={stagger}
            >
              <motion.div variants={fadeIn} className="inline-block border border-primary/30 bg-primary/5 px-4 py-1 mb-6">
                <span className="text-primary text-[10px] font-bold uppercase tracking-[0.3em]">Sistema Operativo v12.0</span>
              </motion.div>
              <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-bold mb-8 tracking-tighter leading-[0.9]">
                EL CONTROL TOTAL DE TU <span className="text-primary">RESTAURANTE</span> EN UNA SOLA INTERFAZ.
              </motion.h1>
              <motion.p variants={fadeIn} className="text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed">
                Facturación fiscal NCF, comandas en tiempo real, gestión de mesas, registro de gastos y cierres operativos. Diseñado para la velocidad.
              </motion.p>
              <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4">
                <button className="bg-primary text-primary-foreground px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:glow-primary transition-all border-none cursor-pointer">
                  Prueba Gratuita <ArrowRight size={18} />
                </button>
                <button className="border border-border bg-transparent text-foreground px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] hover:bg-muted/50 transition-all cursor-pointer">
                  Ver Documentación
                </button>
              </motion.div>
            </motion.div>
          </div>
          
          {/* Abstract Grid Background */}
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none hidden lg:block">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
            <div className="absolute inset-0 bg-gradient-to-l from-background to-transparent"></div>
          </div>
        </section>

        {/* Core Features Grid */}
        <section id="features" className="py-24 bg-card/30">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
              <div className="max-w-xl">
                <h2 className="text-[11px] font-bold text-primary uppercase tracking-[0.4em] mb-4">Capacidades Reales</h2>
                <h3 className="text-4xl font-bold tracking-tighter uppercase">Todo lo que necesitas para operar sin fricción.</h3>
              </div>
              <p className="text-muted-foreground text-sm max-w-xs font-medium uppercase tracking-wider leading-relaxed">
                Arquitectura robusta con sincronización en tiempo real e integración fiscal completa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-border">
              <FeatureCard 
                icon={<Receipt size={24} />}
                title="Facturación NCF"
                description="Emisión de comprobantes fiscales (B01, B02, etc.) con secuencias automáticas configurables por el usuario."
              />
              <FeatureCard 
                icon={<Utensils size={24} />}
                title="Gestión de Mesas"
                description="Control visual del salón, apertura de cuentas por mesa y soporte para órdenes 'Para llevar'."
              />
              <FeatureCard 
                icon={<ChefHat size={24} />}
                title="Comandas Digitales"
                description="Sincronización instantánea con la cocina. Visualización de estados y tiempos de preparación."
              />
              <FeatureCard 
                icon={<WalletCards size={24} />}
                title="Registro de Gastos"
                description="Control detallado de salidas de caja por categorías (Inventario, Nómina, Servicios) integrado al ciclo diario."
              />
              <FeatureCard 
                icon={<BarChart3 size={24} />}
                title="Cierres de Caja"
                description="Resumen operativo completo: ventas pagadas, pendientes, itbis recaudado y neto operativo por ciclo."
              />
              <FeatureCard 
                icon={<ShieldCheck size={24} />}
                title="Seguridad Multitenant"
                description="Políticas RLS que garantizan el aislamiento total de datos entre diferentes negocios y sucursales."
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-24 border-t border-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-[11px] font-bold text-primary uppercase tracking-[0.4em] mb-4">Planes</h2>
              <h3 className="text-4xl font-bold tracking-tighter uppercase">Escalabilidad para tu negocio.</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <PricingCard 
                name="Básico"
                price="40"
                description="Ideal para pequeños locales y cafeterías."
                features={[
                  "Facturación Estándar",
                  "Gestión de hasta 10 mesas",
                  "Cierres Diarios",
                  "Soporte vía Ticket"
                ]}
              />
              <PricingCard 
                name="Profesional"
                price="80"
                description="Para restaurantes con alto volumen de ventas."
                features={[
                  "Facturación Fiscal NCF",
                  "Gestión de Mesas Ilimitadas",
                  "Módulo de Gastos",
                  "Comandas en Tiempo Real",
                  "Soporte Prioritario"
                ]}
                highlighted
              />
              <PricingCard 
                name="Enterprise"
                price="150"
                description="Solución completa para múltiples sucursales."
                features={[
                  "Todo lo del plan Pro",
                  "Multi-sucursal centralizado",
                  "Dashboard Estadístico Avanzado",
                  "Integraciones Custom",
                  "Account Manager Dedicado"
                ]}
              />
            </div>
          </div>
        </section>

        {/* Tech Stack / Architecture */}
        <section className="py-24 border-t border-border bg-card/10">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5em] mb-12">Stack Tecnológico</h2>
            <div className="flex flex-wrap justify-center gap-12 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
              <TechIcon icon={<Monitor size={32} />} label="Electron" />
              <TechIcon icon={<Database size={32} />} label="PostgreSQL" />
              <TechIcon icon={<Zap size={32} />} label="Vite" />
              <TechIcon icon={<ChefHat size={32} />} label="React" />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-primary text-primary-foreground">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <h2 className="text-5xl md:text-6xl font-bold mb-8 tracking-tighter uppercase leading-none">
              ¿Listo para modernizar tu negocio?
            </h2>
            <button className="bg-primary-foreground text-primary px-10 py-5 text-sm font-bold uppercase tracking-[0.3em] hover:scale-105 transition-all border-none cursor-pointer">
              Solicitar Demo
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-card/20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-foreground flex items-center justify-center">
              <span className="text-background text-[10px] font-bold">C</span>
            </div>
            <span className="text-lg font-bold tracking-tighter uppercase">Cloudix OS</span>
          </div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest">
            © 2026 Cloudix Systems. Todos los derechos reservados.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-[11px] font-bold uppercase tracking-widest hover:text-primary">Términos</a>
            <a href="#" className="text-[11px] font-bold uppercase tracking-widest hover:text-primary">Privacidad</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-10 border-r border-b border-border hover:bg-primary/5 transition-colors group">
      <div className="text-primary mb-6 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h4 className="text-xl font-bold mb-4 uppercase tracking-tighter">{title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed font-medium">
        {description}
      </p>
    </div>
  );
}

function PricingCard({ name, price, description, features, highlighted = false }: { 
  name: string, 
  price: string, 
  description: string, 
  features: string[],
  highlighted?: boolean
}) {
  return (
    <div className={`p-8 border border-border flex flex-col transition-all ${highlighted ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card/30'}`}>
      <h4 className="text-sm font-bold text-primary uppercase tracking-[0.3em] mb-2">{name}</h4>
      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-4xl font-bold tracking-tighter uppercase">${price}</span>
        <span className="text-muted-foreground text-xs uppercase font-bold tracking-widest">/ Mes</span>
      </div>
      <p className="text-sm text-muted-foreground mb-8 font-medium leading-relaxed uppercase tracking-tight">
        {description}
      </p>
      <div className="flex-1 space-y-4 mb-8">
        {features.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <Check size={16} className="text-primary mt-0.5 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-tighter text-foreground/80 leading-snug">{f}</span>
          </div>
        ))}
      </div>
      <button className={`w-full py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border-none cursor-pointer ${highlighted ? 'bg-primary text-primary-foreground hover:glow-primary' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
        Seleccionar Plan
      </button>
    </div>
  );
}

function TechIcon({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <span className="text-sm font-bold uppercase tracking-widest">{label}</span>
    </div>
  );
}
