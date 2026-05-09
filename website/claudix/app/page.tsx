"use client";

import { motion } from "framer-motion";
import { 
  Receipt, 
  Utensils, 
  ChefHat, 
  BarChart3, 
  WalletCards, 
  ArrowRight,
  Monitor,
  Check,
  Zap,
  Split,
  Settings2,
  LayoutGrid,
  MapPin,
  Laptop,
  Printer,
  MousePointer2,
  Keyboard,
  Clock,
  Sparkles,
  Phone,
  Globe,
  Star
} from "lucide-react";

export default function LandingPage() {
  const fadeUp = {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  };

  const fadeIn = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.8 }
  };

  const stagger = {
    animate: {
      transition: {
        staggerChildren: 0.12
      }
    }
  };

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass-strong border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src="/logo.svg" className="w-full h-full object-contain" alt="Cloudix Logo" />
            </div>
            <span className="text-2xl font-display font-800 tracking-tight">Cloudix</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Funciones</a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Planes</a>
            <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
              <button className="gradient-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold rounded-full hover:shadow-lg hover:shadow-primary/25 hover:scale-105 transition-all duration-300 border-none cursor-pointer">
                Solicitar Demo
              </button>
            </a>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-28 md:py-40 overflow-hidden">
          {/* Mesh background */}
          <div className="absolute inset-0 mesh-bg" />
          
          {/* Floating orbs */}
          <div className="absolute top-20 right-[15%] w-72 h-72 rounded-full bg-primary/8 blur-3xl float-animation pointer-events-none" />
          <div className="absolute bottom-10 left-[10%] w-96 h-96 rounded-full bg-accent/5 blur-3xl float-animation pointer-events-none" style={{ animationDelay: "-3s" }} />
          <div className="absolute top-1/2 right-[5%] w-48 h-48 rounded-full bg-primary/5 blur-2xl pulse-glow pointer-events-none hidden lg:block" />
          
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <motion.div 
              className="max-w-4xl mx-auto text-center"
              initial="initial"
              animate="animate"
              variants={stagger}
            >
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 px-5 py-2 rounded-full mb-8">
                <Sparkles size={14} className="text-primary" />
                <span className="text-primary text-xs font-semibold tracking-wide">Tecnología que sabe a éxito</span>
              </motion.div>
              
              <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl lg:text-8xl font-display font-900 mb-6 tracking-tight leading-[0.95]">
                Tu restaurante,{" "}
                <span className="gradient-text">un solo sistema</span>
              </motion.h1>
              
              <motion.p variants={fadeUp} className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
                Control total de tu negocio, desde el pedido hasta la cocina, en tiempo real. 
                Sin complicaciones, sin sorpresas.
              </motion.p>
              
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
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
              </motion.div>

              {/* Trust indicators */}
              <motion.div variants={fadeIn} className="mt-16 flex flex-wrap items-center justify-center gap-8 text-muted-foreground/60">
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
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 md:py-32 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <motion.div 
              className="text-center mb-20"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
            >
              <span className="text-primary text-xs font-semibold tracking-widest uppercase mb-4 block">Control Detallado</span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-800 tracking-tight max-w-3xl mx-auto leading-tight">
                Gestiona cada aspecto de tu negocio
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard 
                icon={<Clock size={28} />}
                title="Cocina en Tiempo Real"
                description="Visualiza y gestiona todos los pedidos al instante. Sin errores, sin demoras."
                delay={0}
              />
              <FeatureCard 
                icon={<ChefHat size={28} />}
                title="Comandas Digitales"
                description="Envía pedidos directamente a cocina desde cualquier dispositivo."
                delay={0.1}
              />
              <FeatureCard 
                icon={<Receipt size={28} />}
                title="Gestión de Pedidos"
                description="Toma de pedidos rápida y organizada. Mejora la atención y acelera el servicio."
                delay={0.2}
              />
              <FeatureCard 
                icon={<Utensils size={28} />}
                title="Control de Mesas"
                description="Estado en tiempo real: disponible, ocupada, en espera, cuenta abierta."
                delay={0.3}
              />
              <FeatureCard 
                icon={<Split size={28} />}
                title="Cuenta Separada"
                description="Divide cuentas por persona o por ítem. Cobro fácil y sin confusiones."
                delay={0.4}
              />
              <FeatureCard 
                icon={<BarChart3 size={28} />}
                title="Reportes y Estadísticas"
                description="Ventas, productos más vendidos, horas pico y mucho más."
                delay={0.5}
              />
            </div>

            {/* Mini features */}
            <motion.div 
              className="mt-20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <MiniFeature icon={<Settings2 size={20} />} label="Menú Personalizable" />
              <MiniFeature icon={<Zap size={20} />} label="Modificadores y Extras" />
              <MiniFeature icon={<Printer size={20} />} label="Impresión Cocina/Bar" />
              <MiniFeature icon={<LayoutGrid size={20} />} label="Múltiples Sucursales" />
              <MiniFeature icon={<WalletCards size={20} />} label="Control de Caja" />
              <MiniFeature icon={<Monitor size={20} />} label="Multi-dispositivo" />
            </motion.div>
          </div>
        </section>

        {/* Subscription Plans */}
        <section id="pricing" className="py-24 md:py-32 relative">
          <div className="absolute inset-0 mesh-bg pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <motion.div 
              className="text-center mb-20"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
            >
              <span className="text-primary text-xs font-semibold tracking-widest uppercase mb-4 block">Planes de Suscripción</span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-800 tracking-tight leading-tight">
                Escalabilidad sin límites
              </h2>
              <p className="text-muted-foreground mt-4 text-lg max-w-xl mx-auto">Elige el plan que se adapte a tu negocio. Sin contratos largos, cancela cuando quieras.</p>
            </motion.div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <PricingCard 
                name="Básico"
                price="40"
                color="oklch(0.72 0.12 160)"
                features={[
                  "1 Sucursal",
                  "Hasta 5 Usuarios",
                  "Comandas Digitales",
                  "Reportes Básicos",
                  "Soporte Estándar"
                ]}
                delay={0}
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
                delay={0.1}
              />
              <PricingCard 
                name="Empresarial"
                price="150"
                color="oklch(0.7 0.15 290)"
                features={[
                  "Sucursales Ilimitadas",
                  "Todo lo del plan PRO",
                  "Integraciones Avanzadas",
                  "Personalización",
                  "Soporte 24/7"
                ]}
                delay={0.2}
              />
            </div>

            {/* Hardware Package Section */}
            <motion.div 
              className="mt-16 rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-primary/20 p-8 md:p-12 relative overflow-hidden"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {/* Corner decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-4 py-1.5 text-xs font-bold rounded-full tracking-wide">
                Oferta Especial
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
                <div>
                  <h3 className="text-4xl md:text-5xl font-display font-800 tracking-tight mb-3">
                    <span className="gradient-text">Paquete FULL</span>
                  </h3>
                  <p className="text-lg font-medium text-muted-foreground mb-8">¿Sin equipo para empezar? Nosotros te equipamos.</p>
                  <div className="flex items-baseline gap-3 mb-10">
                    <span className="text-6xl font-display font-900 tracking-tight gradient-text">+$300</span>
                    <span className="text-sm font-medium text-muted-foreground">Pago Único</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <HardwareItem icon={<Laptop size={22} />} label="Computadora" />
                    <HardwareItem icon={<Printer size={22} />} label="Impresora" />
                    <HardwareItem icon={<MousePointer2 size={22} />} label="Mouse" />
                    <HardwareItem icon={<Keyboard size={22} />} label="Teclado" />
                  </div>
                </div>
                <div className="bg-background/50 backdrop-blur-sm border border-border/50 p-8 rounded-xl">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                      <MapPin size={24} className="text-primary" />
                    </div>
                    <div>
                      <h5 className="font-display font-700 text-lg mb-1">Instalación Foránea</h5>
                      <p className="text-sm text-muted-foreground mb-4">Fuera de Santo Domingo</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-display font-800 tracking-tight">+$40</span>
                        <span className="text-xs text-muted-foreground">Pago Único</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-28 md:py-36 relative overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 gradient-primary opacity-90" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.05),transparent_50%)]" />
          
          <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-900 mb-6 tracking-tight leading-[0.95] text-primary-foreground">
                Tu restaurante más rápido, eficiente y rentable.
              </h2>
              <p className="text-primary-foreground/70 text-lg mb-12 max-w-xl mx-auto">
                Solicita tu demostración sin compromiso y descubre cómo Cloudix puede transformar tu negocio.
              </p>
              <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
                <button className="bg-primary-foreground text-primary px-12 py-5 text-base font-bold rounded-full hover:shadow-2xl hover:scale-105 transition-all duration-300 border-none cursor-pointer group">
                  Contactar Ahora
                  <ArrowRight size={18} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
                </button>
              </a>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-16 border-t border-border/50 bg-card/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 gradient-primary rounded-lg flex items-center justify-center">
                  <span className="text-primary-foreground text-xs font-bold">A</span>
                </div>
                <span className="text-lg font-display font-700 tracking-tight">Azokia LLC</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tecnología que transforma. Resultados que crecen.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <h5 className="text-xs font-semibold text-primary tracking-wider uppercase">Contacto</h5>
              <a href="tel:8095968988" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Phone size={14} />
                809-596-8988
              </a>
              <span className="text-sm text-muted-foreground">Teléfono / WhatsApp</span>
            </div>
            <div className="flex flex-col gap-4">
              <h5 className="text-xs font-semibold text-primary tracking-wider uppercase">Redes</h5>
              <span className="text-sm text-muted-foreground">@azokiallc</span>
              <a href="https://azokia.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Globe size={14} />
                azokia.com
              </a>
            </div>
          </div>
          <div className="pt-8 border-t border-border/30 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-xs text-muted-foreground">
              © 2026 Azokia LLC. Todos los derechos reservados.
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Términos</a>
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacidad</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ——— Sub-components ——— */

function FeatureCard({ icon, title, description, delay = 0 }: { icon: React.ReactNode; title: string; description: string; delay?: number }) {
  return (
    <motion.div 
      className="group p-8 rounded-2xl bg-card/40 border border-border/50 hover:border-primary/30 hover:bg-card/70 transition-all duration-500 relative overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
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
    </motion.div>
  );
}

function MiniFeature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-3 items-center text-center p-5 rounded-xl bg-card/30 border border-border/30 hover:border-primary/20 hover:bg-card/50 transition-all duration-300">
      <div className="text-primary/70">{icon}</div>
      <span className="text-[11px] font-semibold text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}

function PricingCard({ name, price, features, color, highlighted = false, delay = 0 }: { 
  name: string; 
  price: string; 
  features: string[];
  color: string;
  highlighted?: boolean;
  delay?: number;
}) {
  return (
    <motion.div 
      className={`p-8 flex flex-col rounded-2xl border transition-all relative overflow-hidden ${
        highlighted 
          ? 'bg-card/80 border-primary/40 shadow-lg shadow-primary/10 scale-[1.02] lg:scale-105' 
          : 'bg-card/30 border-border/50 hover:border-border'
      }`}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
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
    </motion.div>
  );
}

function HardwareItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-background/50 border border-border/50 hover:border-primary/30 transition-all duration-300 group">
      <div className="text-foreground/70 group-hover:text-primary transition-colors">{icon}</div>
      <span className="text-[11px] font-semibold text-muted-foreground text-center">{label}</span>
    </div>
  );
}
