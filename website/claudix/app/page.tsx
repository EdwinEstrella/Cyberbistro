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
  Globe,
  PackageSearch,
  BookOpenCheck,
  Truck,
  QrCode,
  TrendingUp,
  ShieldCheck,
  Users2
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
            <a href="#plan-details" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Detalle de Planes</a>
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
              <span className="text-primary text-xs font-semibold tracking-widest uppercase mb-4 block">Control de Punta a Punta</span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-800 tracking-tight max-w-4xl mx-auto leading-tight">
                Mucho más que un simple sistema de facturación
              </h2>
              <p className="text-muted-foreground mt-4 text-lg max-w-2xl mx-auto">Tecnología avanzada diseñada para el caos real de un restaurante en crecimiento.</p>
            </AnimatedSection>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard 
                icon={<BookOpenCheck size={28} />}
                title="Recetas e Insumos"
                description="Vincula tus platos a materias primas (ml, libras, unidades) para un descuento de stock automático y exacto por cada venta."
                delay={0}
              />
              <FeatureCard 
                icon={<QrCode size={28} />}
                title="Menú Digital y Pedidos QR"
                description="Autoservicio para tus clientes. Pedidos directos desde la mesa a la cocina, con fotos reales y catálogo personalizable."
                delay={0.1}
              />
              <FeatureCard 
                icon={<TrendingUp size={28} />}
                title="Finanzas y CXC/CXP"
                description="Control total de Cuentas por Cobrar (clientes) y Cuentas por Pagar (proveedores) integrado con tu flujo de caja."
                delay={0.2}
              />
              <FeatureCard 
                icon={<PackageSearch size={28} />}
                title="Gestión de Compras"
                description="Registra facturas de proveedores, controla costos de compra y reabastece tu inventario en segundos."
                delay={0.3}
              />
              <FeatureCard 
                icon={<ChefHat size={28} />}
                title="Cocina en Tiempo Real"
                description="Pantalla de producción interactiva. Organiza comandas por tiempo de llegada y prioridad para un servicio impecable."
                delay={0.4}
              />
              <FeatureCard 
                icon={<Receipt size={28} />}
                title="Facturación Fiscal NCF"
                description="Cumple con todas las normativas locales (Consumo, Crédito Fiscal, Gubernamental) de forma rápida y sencilla."
                delay={0.5}
              />
            </div>

            {/* Mini features */}
            <AnimatedSection className="mt-20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" delay={0.3}>
              <MiniFeature icon={<LayoutGrid size={20} />} label="Múltiples Sucursales" />
              <MiniFeature icon={<Users2 size={20} />} label="Gestión de Personal" />
              <MiniFeature icon={<Truck size={20} />} label="Módulo de Deliveries" />
              <MiniFeature icon={<Settings2 size={20} />} label="Personalización Total" />
              <MiniFeature icon={<WalletCards size={20} />} label="Cierres Operativos" />
              <MiniFeature icon={<Monitor size={20} />} label="Modo Offline Local" />
            </AnimatedSection>
          </div>
        </section>

        {/* Subscription Plans */}
        <section id="pricing" className="py-24 md:py-32 relative">
          <div className="absolute inset-0 mesh-bg pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <AnimatedSection className="text-center mb-20">
              <span className="text-primary text-xs font-semibold tracking-widest uppercase mb-4 block">Inversión Inteligente</span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-800 tracking-tight leading-tight">
                Elige el plan ideal para tu éxito
              </h2>
              <p className="text-muted-foreground mt-4 text-lg max-w-xl mx-auto">Soluciones escalables que crecen al ritmo de tu negocio.</p>
            </AnimatedSection>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <PricingCard 
                name="Básico"
                price="40"
                color="oklch(0.72 0.12 160)"
                features={[
                  "1 Sucursal Física",
                  "Punto de Venta (POS)",
                  "Control de Mesas",
                  "Comandas Digitales",
                  "Hasta 5 Usuarios",
                  "NCF y Facturación Fiscal",
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
                  "Inventario Avanzado (Recetas)",
                  "Cuentas por Pagar y Cobrar",
                  "Menú Digital con Pedidos QR",
                  "Módulo de Compras Insumos",
                  "Usuarios Ilimitados",
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
                  "Control Multi-Sede Centralizado",
                  "Todo lo del Plan Profesional",
                  "Integraciones vía API",
                  "Configuraciones Especiales",
                  "Seguridad Avanzada",
                  "Soporte 24/7 Dedicado"
                ]}
                delay={0.2}
              />
            </div>
          </div>
        </section>

        {/* Detailed Plan Breakdown */}
        <section id="plan-details" className="py-24 md:py-32 bg-card/10 border-y border-border/40">
          <div className="max-w-7xl mx-auto px-6">
            <AnimatedSection className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-display font-800 tracking-tight mb-4">¿Cuál es el mejor para ti?</h2>
              <p className="text-muted-foreground">Analiza cómo Cloudix optimiza cada tipo de operación.</p>
            </AnimatedSection>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <AnimatedSection delay={0.1}>
                <div className="flex flex-col gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-500">
                    <Utensils size={24} />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-3 font-display">Plan Básico: Control Ágil</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Ideal para cafés, cafeterías o food trucks que necesitan digitalizar su toma de pedidos y facturación. 
                      Olvídate de las libretas de papel; el sistema organiza tus mesas y envía comandas al instante para un servicio más rápido.
                    </p>
                  </div>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={0.2}>
                <div className="flex flex-col gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-3 font-display">Plan Profesional: Gestión de Costos</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Para restaurantes establecidos que buscan **rentabilidad real**. Al usar el sistema de Recetas, el stock se descuenta por cada mililitro o gramo vendido. 
                      Sabrás exactamente cuánto te cuesta producir cada plato y controlarás tus deudas con proveedores (CXP) y clientes (CXC).
                    </p>
                  </div>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={0.3}>
                <div className="flex flex-col gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                    <Globe size={24} />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-3 font-display">Plan Empresarial: Visión Corporativa</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Si manejas una franquicia o múltiples locales, este plan centraliza toda tu información. 
                      Compara el rendimiento de diferentes sedes desde un solo tablero y recibe soporte técnico dedicado para que tu operación nunca se detenga.
                    </p>
                  </div>
                </div>
              </AnimatedSection>
            </div>
          </div>
        </section>

        {/* Hardware Package Section */}
        <section className="py-24 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <AnimatedSection className="rounded-3xl bg-gradient-to-br from-card via-card to-primary/5 border border-primary/20 p-8 md:p-16 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="inline-block bg-primary text-primary-foreground px-5 py-2 text-xs font-bold rounded-full tracking-widest uppercase mb-8">
                Equipamiento Garantizado
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
                <div>
                  <h3 className="text-4xl md:text-6xl font-display font-900 tracking-tight mb-6 leading-[1.1]">
                    ¿No tienes el equipo? <br />
                    <span className="gradient-text">Nosotros lo ponemos.</span>
                  </h3>
                  <p className="text-xl font-medium text-muted-foreground mb-10 max-w-lg leading-relaxed">
                    Instalamos una estación de trabajo completa, configurada y lista para facturar en tu local.
                  </p>
                  <div className="flex items-baseline gap-3 mb-12">
                    <span className="text-7xl font-display font-900 tracking-tight gradient-text">+$300</span>
                    <span className="text-lg font-medium text-muted-foreground">Pago Único</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <HardwareItem icon={<Laptop size={24} />} label="Computadora de Escritorio" />
                    <HardwareItem icon={<Printer size={24} />} label="Impresora Térmica 80mm" />
                    <HardwareItem icon={<MousePointer2 size={24} />} label="Mouse Óptico" />
                    <HardwareItem icon={<Keyboard size={24} />} label="Teclado Ergonómico" />
                  </div>
                </div>
                
                <div className="flex flex-col gap-6">
                  <div className="bg-background/50 backdrop-blur-md border border-border/50 p-10 rounded-2xl shadow-xl shadow-black/20">
                    <div className="flex items-start gap-6">
                      <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
                        <MapPin size={28} className="text-primary" />
                      </div>
                      <div>
                        <h5 className="font-display font-800 text-2xl mb-2">Instalación Nacional</h5>
                        <p className="text-base text-muted-foreground mb-6 leading-relaxed">
                          Viajamos a cualquier rincón del país para configurar tu red, impresoras y terminales.
                        </p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-display font-900 tracking-tight">+$40</span>
                          <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Fuera de Sto. Dgo.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-primary/5 border border-primary/20 p-8 rounded-2xl">
                    <p className="text-sm italic text-primary/80 font-medium">
                      * El pago único de hardware es independiente de la suscripción mensual. El equipo es propiedad definitiva del restaurante tras la compra.
                    </p>
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
              <h2 className="text-5xl md:text-7xl lg:text-8xl font-display font-900 mb-8 tracking-tight leading-[0.9] text-primary-foreground">
                Potencia tu cocina hoy mismo.
              </h2>
              <p className="text-primary-foreground/75 text-xl mb-14 max-w-2xl mx-auto leading-relaxed">
                Únete a los restaurantes que ya están optimizando sus procesos con la tecnología más avanzada del mercado.
              </p>
              <a href="https://wa.me/18095968986" target="_blank" rel="noopener noreferrer" className="contents">
                <button className="bg-primary-foreground text-primary px-14 py-6 text-lg font-bold rounded-full hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:scale-105 transition-all duration-300 border-none cursor-pointer group">
                  Agenda tu Demostración Gratis
                  <ArrowRight size={22} className="inline ml-3 group-hover:translate-x-2 transition-transform" />
                </button>
              </a>
            </AnimatedSection>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-20 border-t border-border/50 bg-card/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-16 mb-20">
            <div className="md:col-span-2">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center">
                  <span className="text-primary-foreground text-sm font-bold italic">C</span>
                </div>
                <span className="text-2xl font-display font-800 tracking-tight">Cloudix</span>
              </div>
              <p className="text-base text-muted-foreground leading-relaxed max-w-sm">
                Desarrollado por Azokia LLC. <br />
                Innovando en el sector gastronómico con software de alto impacto y hardware garantizado.
              </p>
            </div>
            <div className="flex flex-col gap-6">
              <h5 className="text-xs font-bold text-primary tracking-[2px] uppercase">Contacto Directo</h5>
              <a href="tel:8095968988" className="flex items-center gap-3 text-base text-muted-foreground hover:text-foreground transition-colors group">
                <Phone size={18} className="text-primary/50 group-hover:text-primary transition-colors" />
                809-596-8988
              </a>
              <p className="text-sm text-muted-foreground">
                Soporte técnico y ventas disponible de Lunes a Sábado.
              </p>
            </div>
            <div className="flex flex-col gap-6">
              <h5 className="text-xs font-bold text-primary tracking-[2px] uppercase">Empresa</h5>
              <span className="text-base text-muted-foreground">@azokiallc</span>
              <a href="https://azokia.com" className="flex items-center gap-3 text-base text-muted-foreground hover:text-foreground transition-colors group">
                <Globe size={18} className="text-primary/50 group-hover:text-primary transition-colors" />
                azokia.com
              </a>
            </div>
          </div>
          <div className="pt-10 border-t border-border/30 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="text-sm text-muted-foreground font-medium">
              © 2026 Azokia LLC. Hecho con pasión en Santo Domingo.
            </p>
            <div className="flex gap-8">
              <a href="#" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Términos de Servicio</a>
              <a href="#" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Política de Privacidad</a>
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
    <div className="flex flex-col gap-4 items-center text-center p-6 rounded-2xl bg-card/30 border border-border/30 hover:border-primary/40 hover:bg-card/60 transition-all duration-500 group">
      <div className="text-primary/60 group-hover:text-primary group-hover:scale-110 transition-all duration-300">{icon}</div>
      <span className="text-xs font-bold text-muted-foreground/80 group-hover:text-foreground tracking-tight leading-tight">{label}</span>
    </div>
  );
}

function HardwareItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 p-5 rounded-2xl bg-background/40 border border-border/40 hover:border-primary/40 hover:bg-background/60 transition-all duration-500 group">
      <div className="text-foreground/60 group-hover:text-primary group-hover:rotate-3 transition-all duration-300">{icon}</div>
      <span className="text-[10px] font-bold text-muted-foreground/70 text-center uppercase tracking-wider">{label}</span>
    </div>
  );
}
