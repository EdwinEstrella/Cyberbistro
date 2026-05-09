import { 
  Receipt, 
  Utensils, 
  ChefHat, 
  BarChart3, 
  WalletCards, 
  ArrowRight,
  Monitor,
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
  Phone,
  Globe
} from "lucide-react";
import { HeroSection } from "./components/HeroSection";
import { FeatureCard } from "./components/FeatureCard";
import { PricingCard } from "./components/PricingCard";
import { AnimatedSection } from "./components/AnimatedSection";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass-strong border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src="/logo.svg" className="w-full h-full object-contain" alt="Cloudix Logo" width={40} height={40} />
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
        {/* Hero Section — client component */}
        <HeroSection />

        {/* Features Section */}
        <section id="features" className="py-24 md:py-32 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <AnimatedSection className="text-center mb-20">
              <span className="text-primary text-xs font-semibold tracking-widest uppercase mb-4 block">Control Detallado</span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-800 tracking-tight max-w-3xl mx-auto leading-tight">
                Gestiona cada aspecto de tu negocio
              </h2>
            </AnimatedSection>

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
            <AnimatedSection className="mt-20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" delay={0.3}>
              <MiniFeature icon={<Settings2 size={20} />} label="Menú Personalizable" />
              <MiniFeature icon={<Zap size={20} />} label="Modificadores y Extras" />
              <MiniFeature icon={<Printer size={20} />} label="Impresión Cocina/Bar" />
              <MiniFeature icon={<LayoutGrid size={20} />} label="Múltiples Sucursales" />
              <MiniFeature icon={<WalletCards size={20} />} label="Control de Caja" />
              <MiniFeature icon={<Monitor size={20} />} label="Multi-dispositivo" />
            </AnimatedSection>
          </div>
        </section>

        {/* Subscription Plans */}
        <section id="pricing" className="py-24 md:py-32 relative">
          <div className="absolute inset-0 mesh-bg pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <AnimatedSection className="text-center mb-20">
              <span className="text-primary text-xs font-semibold tracking-widest uppercase mb-4 block">Planes de Suscripción</span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-800 tracking-tight leading-tight">
                Escalabilidad sin límites
              </h2>
              <p className="text-muted-foreground mt-4 text-lg max-w-xl mx-auto">Elige el plan que se adapte a tu negocio. Sin contratos largos, cancela cuando quieras.</p>
            </AnimatedSection>
            
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
            <AnimatedSection className="mt-16 rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-primary/20 p-8 md:p-12 relative overflow-hidden">
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
            </AnimatedSection>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-28 md:py-36 relative overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 gradient-primary opacity-90" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.05),transparent_50%)]" />
          
          <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
            <AnimatedSection>
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
            </AnimatedSection>
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

/* ——— Server-rendered sub-components ——— */

function MiniFeature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-3 items-center text-center p-5 rounded-xl bg-card/30 border border-border/30 hover:border-primary/20 hover:bg-card/50 transition-all duration-300">
      <div className="text-primary/70">{icon}</div>
      <span className="text-[11px] font-semibold text-muted-foreground leading-tight">{label}</span>
    </div>
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
