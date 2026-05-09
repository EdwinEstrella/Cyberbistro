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
  Zap,
  Split,
  Settings2,
  Users,
  LayoutGrid,
  MapPin,
  Laptop,
  Printer,
  MousePointer2,
  Keyboard,
  Clock
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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src="/logo.svg" className="w-full h-full object-contain" alt="Cloudix Logo" />
            </div>
            <span className="text-2xl font-bold tracking-tighter uppercase">Cloudix</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium hover:text-primary transition-colors uppercase tracking-widest">Funciones</a>
            <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors uppercase tracking-widest">Planes</a>
            <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
              <button className="bg-primary text-primary-foreground px-6 py-2 text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-all border-none cursor-pointer">
                Solicitar Demo
              </button>
            </a>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-24 md:py-32 overflow-hidden border-b border-border">
          <div className="max-w-7xl mx-auto px-6 relative z-10 text-center md:text-left">
            <motion.div 
              className="max-w-4xl"
              initial="initial"
              animate="animate"
              variants={stagger}
            >
              <motion.div variants={fadeIn} className="inline-block border border-primary/30 bg-primary/5 px-4 py-1 mb-6">
                <span className="text-primary text-[10px] font-bold uppercase tracking-[0.4em]">Tecnología que sabe a éxito</span>
              </motion.div>
              <motion.h1 variants={fadeIn} className="text-5xl md:text-8xl font-bold mb-8 tracking-tighter leading-[0.85] uppercase">
                Sistema de <span className="text-primary">Restaurante</span>
              </motion.h1>
              <motion.h2 variants={fadeIn} className="text-2xl md:text-3xl font-bold mb-8 tracking-tighter uppercase opacity-90">
                Todo tu restaurante en un solo sistema.
              </motion.h2>
              <motion.p variants={fadeIn} className="text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed font-medium">
                Control total de tu negocio, desde el pedido hasta la cocina, <span className="text-primary">en tiempo real.</span>
              </motion.p>
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
                <button className="bg-primary text-primary-foreground px-10 py-5 text-sm font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:glow-primary transition-all border-none cursor-pointer">
                  ¡Pruébalo Gratis! <ArrowRight size={18} />
                </button>
              </a>
              <button className="border border-border bg-transparent text-foreground px-10 py-5 text-sm font-bold uppercase tracking-[0.2em] hover:bg-muted/50 transition-all cursor-pointer">
                Ver Detalles
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

        {/* Features Section - From Flayer */}
        <section id="features" className="py-24 border-b border-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="mb-16">
              <h2 className="text-[11px] font-bold text-primary uppercase tracking-[0.5em] mb-4">Control Detallado</h2>
              <h3 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase max-w-2xl leading-none">Gestiona cada aspecto de tu negocio.</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-border">
              <FeatureCard 
                icon={<Clock size={24} />}
                title="Cocina en Tiempo Real"
                description="Visualiza y gestiona todos los pedidos al instante. Sin errores, sin demoras."
              />
              <FeatureCard 
                icon={<ChefHat size={24} />}
                title="Comandas Digitales"
                description="Envía pedidos directamente a cocina desde cualquier dispositivo."
              />
              <FeatureCard 
                icon={<Receipt size={24} />}
                title="Gestión de Pedidos"
                description="Toma de pedidos rápida y organizada. Mejora la atención y acelera el servicio."
              />
              <FeatureCard 
                icon={<Utensils size={24} />}
                title="Control de Mesas"
                description="Estado en tiempo real: disponible, ocupada, en espera, cuenta abierta."
              />
              <FeatureCard 
                icon={<Split size={24} />}
                title="Cuenta Separada"
                description="Divide cuentas por persona o por ítem. Cobro fácil y sin confusiones."
              />
              <FeatureCard 
                icon={<BarChart3 size={24} />}
                title="Reportes y Estadísticas"
                description="Ventas, productos más vendidos, horas pico y mucho más."
              />
            </div>

            <div className="mt-20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
               <MiniFeature icon={<Settings2 size={18} />} label="Menú Personalizable" />
               <MiniFeature icon={<Zap size={18} />} label="Modificadores y Extras" />
               <MiniFeature icon={<Printer size={18} />} label="Impresión de Cocina y Bar" />
               <MiniFeature icon={<LayoutGrid size={18} />} label="Múltiples Sucursales" />
               <MiniFeature icon={<WalletCards size={18} />} label="Control de Caja y Turnos" />
               <MiniFeature icon={<Monitor size={18} />} label="Integrado con Dispositivos" />
            </div>
          </div>
        </section>

        {/* Subscription Plans */}
        <section id="pricing" className="py-24 bg-card/30 border-b border-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-[11px] font-bold text-primary uppercase tracking-[0.5em] mb-4">Planes de Suscripción</h2>
              <h3 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase leading-none">Escalabilidad sin límites.</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border border-border">
              <PricingCard 
                name="Básico"
                price="40"
                color="oklch(0.75 0.15 140)"
                features={[
                  "1 Sucursal",
                  "Hasta 5 Usuarios",
                  "Comandas Digitales",
                  "Reportes Básicos",
                  "Soporte Estándar"
                ]}
              />
              <PricingCard 
                name="Profesional"
                price="80"
                color="var(--primary)"
                highlighted
                features={[
                  "Hasta 3 Sucursales",
                  "Usuarios Ilimitados",
                  "Cocina en Tiempo Real",
                  "Reportes Avanzados",
                  "Soporte Prioritario"
                ]}
              />
              <PricingCard 
                name="Empresarial"
                price="150"
                color="oklch(0.6 0.2 300)"
                features={[
                  "Sucursales Ilimitadas",
                  "Todo lo del plan PRO",
                  "Integraciones Avanzadas",
                  "Personalización",
                  "Soporte 24/7"
                ]}
              />
            </div>

            {/* Hardware Package Section */}
            <div className="mt-20 bg-background border border-primary/40 p-8 md:p-12 relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-primary px-4 py-1 text-[10px] font-bold uppercase tracking-widest">Oferta Especial</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h4 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase mb-4 leading-none text-primary">Paquete FULL</h4>
                  <p className="text-xl font-bold uppercase tracking-tighter mb-8">¿Sin equipo para empezar? Nosotros te equipamos.</p>
                  <div className="flex items-baseline gap-2 mb-10">
                    <span className="text-6xl font-bold tracking-tighter text-primary">+$300</span>
                    <span className="text-lg font-bold uppercase tracking-widest opacity-60">Pago Único</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <HardwareItem icon={<Laptop size={20} />} label="Computadora" />
                    <HardwareItem icon={<Printer size={20} />} label="Impresora" />
                    <HardwareItem icon={<MousePointer2 size={20} />} label="Mouse" />
                    <HardwareItem icon={<Keyboard size={20} />} label="Teclado" />
                  </div>
                </div>
                <div className="bg-card/50 border border-border p-8 flex flex-col gap-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-primary/10 flex items-center justify-center shrink-0">
                      <MapPin size={24} className="text-primary" />
                    </div>
                    <div>
                      <h5 className="font-bold uppercase tracking-tight text-lg leading-none mb-2">Instalación Foránea</h5>
                      <p className="text-sm text-muted-foreground font-medium">Fuera de Santo Domingo</p>
                      <div className="mt-4 flex items-baseline gap-2">
                        <span className="text-3xl font-bold tracking-tighter">+$40</span>
                        <span className="text-[10px] font-bold uppercase opacity-60">Pago Único</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
            <h2 className="text-5xl md:text-7xl font-bold mb-8 tracking-tighter uppercase leading-[0.9]">
              Tu restaurante más rápido, eficiente y rentable.
            </h2>
            <div className="bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 p-8 max-w-2xl mx-auto inline-block">
              <h3 className="text-2xl font-bold uppercase tracking-tighter mb-4">¡Pruébalo Gratis!</h3>
              <p className="text-sm font-bold uppercase tracking-widest opacity-90 mb-8">Solicita tu demostración sin compromiso.</p>
              <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
                <button className="bg-primary-foreground text-primary px-12 py-5 text-sm font-bold uppercase tracking-[0.3em] hover:scale-105 transition-all border-none cursor-pointer">
                  Contactar Ahora
                </button>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-16 border-t border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
            <div>
               <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-foreground flex items-center justify-center">
                  <span className="text-background text-[10px] font-bold">A</span>
                </div>
                <span className="text-xl font-bold tracking-tighter uppercase text-foreground">Azokia LLC</span>
              </div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest leading-relaxed">
                Tecnología que transforma. Resultados que crecen.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <h5 className="text-[10px] font-bold uppercase tracking-[0.4em] text-primary">Contacto</h5>
              <p className="text-sm font-bold uppercase tracking-tighter">809-596-8988</p>
              <p className="text-sm font-bold uppercase tracking-tighter">Teléfono / WhatsApp</p>
            </div>
            <div className="flex flex-col gap-4">
              <h5 className="text-[10px] font-bold uppercase tracking-[0.4em] text-primary">Redes</h5>
              <p className="text-sm font-bold uppercase tracking-tighter">@azokiallc</p>
              <p className="text-sm font-bold uppercase tracking-tighter">azokia.com</p>
            </div>
          </div>
          <div className="pt-12 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.3em]">
              © 2026 Azokia LLC. Todos los derechos reservados.
            </p>
            <div className="flex gap-8 opacity-60">
              <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-primary transition-colors">Términos</a>
              <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-primary transition-colors">Privacidad</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-10 border-r border-b border-border hover:bg-primary/5 transition-colors group">
      <div className="text-primary mb-8 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h4 className="text-2xl font-bold mb-4 uppercase tracking-tighter leading-none">{title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed font-bold uppercase tracking-tight">
        {description}
      </p>
    </div>
  );
}

function MiniFeature({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex flex-col gap-4 items-center text-center p-4 border border-transparent hover:border-border transition-all">
      <div className="text-primary opacity-80">{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-widest leading-tight">{label}</span>
    </div>
  );
}

function PricingCard({ name, price, features, color, highlighted = false }: { 
  name: string, 
  price: string, 
  features: string[],
  color: string,
  highlighted?: boolean
}) {
  return (
    <div className={`p-10 flex flex-col border-r border-border last:border-r-0 transition-all relative overflow-hidden ${highlighted ? 'bg-primary/[0.03]' : 'bg-transparent'}`}>
      {highlighted && <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>}
      <h4 className="text-sm font-bold uppercase tracking-[0.4em] mb-8 opacity-80" style={{ color: color }}>{name}</h4>
      <div className="flex items-baseline gap-2 mb-10">
        <span className="text-lg font-bold opacity-60">US$</span>
        <span className="text-6xl font-bold tracking-tighter uppercase leading-none" style={{ color: color }}>{price}</span>
        <span className="text-xs uppercase font-bold tracking-widest opacity-60">/ Mes</span>
      </div>
      <div className="flex-1 space-y-6 mb-12 border-t border-border/50 pt-10">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-4">
            <Check size={14} style={{ color: color }} className="shrink-0" />
            <span className="text-xs font-bold uppercase tracking-widest text-foreground/90">{f}</span>
          </div>
        ))}
      </div>
      <div className="bg-muted/30 p-4 text-center mb-8 border border-border/50">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Sin Equipo</span>
      </div>
      <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
        <button className="w-full py-5 text-[11px] font-bold uppercase tracking-[0.3em] transition-all border-none cursor-pointer hover:scale-[1.02] active:scale-[0.98]" style={{ backgroundColor: color, color: 'white' }}>
          Seleccionar
        </button>
      </a>
    </div>
  );
}

function HardwareItem({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 p-4 border border-border hover:border-primary/50 transition-colors">
      <div className="text-foreground opacity-80">{icon}</div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-center">{label}</span>
    </div>
  );
}
