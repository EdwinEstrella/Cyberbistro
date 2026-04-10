import { useState, useEffect } from "react";
import svgPaths from "../../../imports/svg-qgatbhef3k";
import imgElectricDrink from "figma:asset/356c18bfe5cca7e51ba295635755e0843e79e4d1.png";
import imgDigitalPasta from "figma:asset/436d73e49206778c5c4b265dfe54e2ed10e7b778.png";
import imgNeonBurger from "figma:asset/40d31d2fb0d13ab6818cfa26176698858002ed8a.png";
import imgSynthSushi from "figma:asset/4850964113c38e7645bb48884f06257abafb37e7.png";
import imgItemThumb from "figma:asset/1802332566dfd56c7b793fe6c7bd542375e71161.png";
import imgItemThumb1 from "figma:asset/e48db40a2c905ad13538d988076ed6e1463b641f.png";

const categories = ["Todos", "Hamburguesas", "Bebidas", "Sushi", "Postres", "Cócteles"];

const tickerItems = [
  { text: "Nuevo Pedido: Mesa 12 - Cyber-Ramen x2", color: "#adaaaa" },
  { text: "● Listo: Pedido #882", color: "#59ee50" },
  { text: "Entrante: Reserva VIP - 20:30", color: "#adaaaa" },
  { text: "● Prioridad: Mesa 04 - Solicitud Especial", color: "#ff6aa0" },
  { text: "Nuevo Pedido: Mesa 08 - Neon-Gyoza", color: "#adaaaa" },
];

export function Dashboard() {
  const [activeCategory, setActiveCategory] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [, setImagesLoaded] = useState(false);

  useEffect(() => {
    // Animación de entrada
    setIsVisible(true);

    // Precargar imágenes
    const images = [imgNeonBurger, imgSynthSushi, imgElectricDrink, imgDigitalPasta, imgItemThumb, imgItemThumb1];
    let loadedCount = 0;

    images.forEach(src => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        if (loadedCount === images.length) {
          setImagesLoaded(true);
        }
      };
      img.src = src;
    });

    // Mostrar contenido después de un delay mínimo para suavizar la transición
    const timer = setTimeout(() => {
      setImagesLoaded(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`flex gap-[32px] p-[32px] flex-1 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col gap-[32px] min-w-0">
        {/* Ticker */}
        <div className="bg-[#131313] py-[8px] border-b border-[rgba(255,144,109,0.1)] overflow-hidden">
          <div className="flex gap-[48px]">
            {tickerItems.map((item, i) => (
              <span key={i} className="font-['Space_Grotesk',sans-serif] text-[10px] tracking-[2px] uppercase whitespace-nowrap" style={{ color: item.color }}>
                {item.text}
              </span>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-[16px] overflow-x-auto pb-[8px]">
          {categories.map((cat, i) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(i)}
              className={`px-[32px] py-[12px] rounded-[12px] shrink-0 font-['Space_Grotesk',sans-serif] font-bold text-[16px] tracking-[1.6px] uppercase border-none cursor-pointer ${
                i === activeCategory
                  ? "bg-[#ff906d] text-[#5b1600] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.3)]"
                  : "bg-[#201f1f] text-[#adaaaa]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-3 gap-[24px]">
          {/* Large Feature */}
          <div className="col-span-2 aspect-[2/1] bg-[#201f1f] rounded-[12px] overflow-hidden relative">
            <div className="absolute inset-0 opacity-60">
              <img alt="" className="absolute h-[200%] left-0 max-w-none top-[-50%] w-full" src={imgNeonBurger} />
            </div>
            <div className="absolute bg-gradient-to-t from-[#0e0e0e] to-transparent inset-0" />
            <div className="absolute bottom-[24px] left-[24px] right-[24px] flex items-end justify-between">
              <div className="flex flex-col gap-[4px]">
                <div className="bg-[rgba(255,106,160,0.2)] border border-[rgba(255,106,160,0.3)] rounded-[6px] px-[9px] py-[5px] w-fit">
                  <span className="font-['Inter',sans-serif] font-bold text-[#ff6aa0] text-[10px] uppercase">Más Vendido</span>
                </div>
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[30px] tracking-[-0.75px] uppercase pt-[4px]">
                  Cyber-Bison Burger
                </div>
                <div className="font-['Inter',sans-serif] font-light text-[#adaaaa] text-[14px] max-w-[320px]">
                  Doble carne de bisonte, aceite de trufa digital, gouda neón.
                </div>
              </div>
              <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[24px]">$24.00</div>
            </div>
          </div>

          {/* Sushi */}
          <div className="bg-[#201f1f] rounded-[12px] overflow-hidden">
            <div className="flex flex-col gap-[16px] p-[16px]">
              <div className="rounded-[8px] overflow-hidden">
                <img alt="" className="w-full aspect-square object-cover" src={imgSynthSushi} />
              </div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase">Synth-Roll Set</div>
                  <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px]">8 piezas de Salmón Data Grado-A</div>
                </div>
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[16px]">$18.50</div>
              </div>
              <div className="flex gap-[8px] items-center">
                <div className="bg-[#59ee50] rounded-full size-[6px]" />
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase">Pesca Fresca</span>
              </div>
            </div>
          </div>

          {/* Electric Drink */}
          <div className="bg-[#201f1f] rounded-[12px]">
            <div className="flex flex-col gap-[16px] p-[16px]">
              <div className="rounded-[8px] overflow-hidden">
                <img alt="" className="w-full aspect-square object-cover" src={imgElectricDrink} />
              </div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase">Voltage Fizz</div>
                  <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px]">Gin Azul, Tónica, Lima Ionizada</div>
                </div>
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[16px]">$14.00</div>
              </div>
            </div>
          </div>

          {/* Pasta */}
          <div className="bg-[#201f1f] rounded-[12px]">
            <div className="flex flex-col gap-[16px] p-[16px]">
              <div className="rounded-[8px] overflow-hidden">
                <img alt="" className="w-full aspect-square object-cover" src={imgDigitalPasta} />
              </div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase">Null-Noodle Pasta</div>
                  <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px]">Pasta calamar en tinta, Chile fantasma</div>
                </div>
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[16px]">$21.00</div>
              </div>
            </div>
          </div>

          {/* Espresso */}
          <div className="bg-[#201f1f] rounded-[12px] border border-[rgba(72,72,71,0.1)]">
            <div className="flex flex-col justify-center p-[17px]">
              <div className="flex gap-[12px] items-center">
                <div className="bg-[#006e0a] rounded-full flex items-center justify-center size-[40px]">
                  <svg className="size-[18px]" fill="none" viewBox="0 0 18 18">
                    <path d={svgPaths.p2fcd0500} fill="#59EE50" />
                  </svg>
                </div>
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px] uppercase">Espresso Overclock</div>
              </div>
              <div className="pt-[16px] flex flex-col gap-[8px]">
                <div className="flex items-end justify-between">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[1px] uppercase">Dosis Simple</span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[16px]">$4.50</span>
                </div>
                <div className="bg-black h-[4px] rounded-full overflow-hidden">
                  <div className="bg-[#59ee50] h-full w-2/3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Cart Panel */}
      <div className="w-[343px] shrink-0 backdrop-blur-[12px] bg-[rgba(32,31,31,0.6)] rounded-[16px] border border-[rgba(72,72,71,0.1)] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] flex flex-col self-start sticky top-[96px]">
        <div className="border-b border-[rgba(72,72,71,0.2)] px-[24px] pt-[24px] pb-[25px]">
          <div className="flex items-center justify-between">
            <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] uppercase">Pedido Actual</div>
            <div className="bg-[#ff784d] rounded-[4px] px-[8px] py-[2px]">
              <span className="font-['Inter',sans-serif] font-bold text-[#460f00] text-[10px] uppercase">Mesa 12</span>
            </div>
          </div>
          <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[1px] uppercase mt-[4px]">ID: #XB-9920-A</div>
        </div>

        <div className="flex-1 p-[24px] flex flex-col gap-[24px]">
          {/* Cart Item 1 */}
          <div className="flex gap-[16px]">
            <div className="rounded-[8px] overflow-hidden size-[64px] shrink-0">
              <img alt="" className="size-full object-cover" src={imgItemThumb} />
            </div>
            <div className="flex-1 flex flex-col gap-[4px]">
              <div className="flex items-start justify-between">
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px] uppercase">Cyber-Bison Burger</div>
                <svg className="shrink-0 size-[8px] mt-[6px] cursor-pointer" fill="none" viewBox="0 0 8.16667 8.16667">
                  <path d={svgPaths.p2317cf00} fill="#FF716C" fillOpacity="0.6" />
                </svg>
              </div>
              <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase">Salsa Neón Extra, Sin Cebolla</div>
              <div className="flex items-center justify-between pt-[4px]">
                <div className="bg-[#131313] flex gap-[12px] items-center px-[9px] py-[5px] rounded-[6px] border border-[rgba(72,72,71,0.3)]">
                  <svg className="w-[7px] h-px cursor-pointer" fill="none" viewBox="0 0 7 1"><path d="M0 1V0H7V1H0V1" fill="white" /></svg>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px]">02</span>
                  <svg className="size-[7px] cursor-pointer" fill="none" viewBox="0 0 7 7"><path d={svgPaths.p5461aa0} fill="white" /></svg>
                </div>
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[16px]">$48.00</div>
              </div>
            </div>
          </div>

          {/* Cart Item 2 */}
          <div className="flex gap-[16px]">
            <div className="rounded-[8px] overflow-hidden size-[64px] shrink-0">
              <img alt="" className="size-full object-cover" src={imgItemThumb1} />
            </div>
            <div className="flex-1 flex flex-col gap-[4px]">
              <div className="flex items-start justify-between">
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px] uppercase">Voltage Fizz</div>
                <svg className="shrink-0 size-[8px] mt-[6px] cursor-pointer" fill="none" viewBox="0 0 8.16667 8.16667">
                  <path d={svgPaths.p2317cf00} fill="#FF716C" fillOpacity="0.6" />
                </svg>
              </div>
              <div className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase">Hielo Normal</div>
              <div className="flex items-center justify-between pt-[4px]">
                <div className="bg-[#131313] flex gap-[12px] items-center px-[9px] py-[5px] rounded-[6px] border border-[rgba(72,72,71,0.3)]">
                  <svg className="w-[7px] h-px cursor-pointer" fill="none" viewBox="0 0 7 1"><path d="M0 1V0H7V1H0V1" fill="white" /></svg>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px]">01</span>
                  <svg className="size-[7px] cursor-pointer" fill="none" viewBox="0 0 7 7"><path d={svgPaths.p5461aa0} fill="white" /></svg>
                </div>
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[16px]">$14.00</div>
              </div>
            </div>
          </div>
        </div>

        {/* Totals & Actions */}
        <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.8)] border-t border-[rgba(72,72,71,0.2)] rounded-b-[16px] px-[24px] py-[24px] flex flex-col gap-[24px]">
          <div className="flex flex-col gap-[8px]">
            <div className="flex justify-between">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase">Subtotal</span>
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase">$62.00</span>
            </div>
            <div className="flex justify-between">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase">Impuesto Servicio (15%)</span>
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase">$9.30</span>
            </div>
            <div className="border-t border-[rgba(72,72,71,0.1)] pt-[9px] flex items-center justify-between">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase">Total</span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[24px]">$71.30</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-[12px]">
            <button className="flex gap-[8px] items-center justify-center py-[14px] rounded-[12px] border-2 border-[#59ee50] bg-transparent cursor-pointer shadow-[0px_0px_15px_0px_rgba(89,238,80,0.1)]">
              <svg className="w-[15px] h-[13.5px]" fill="none" viewBox="0 0 15 13.5"><path d={svgPaths.p18098d80} fill="#59EE50" /></svg>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[12px] tracking-[1.2px] uppercase">Imprimir Ticket</span>
            </button>
            <button className="flex gap-[8px] items-center justify-center py-[14px] rounded-[12px] border-2 border-[#59ee50] bg-transparent cursor-pointer shadow-[0px_0px_15px_0px_rgba(89,238,80,0.1)]">
              <svg className="w-[11.25px] h-[15px]" fill="none" viewBox="0 0 11.25 15"><path d={svgPaths.p30f20700} fill="#59EE50" /></svg>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[12px] tracking-[1.2px] uppercase">Cocina</span>
            </button>
            <button className="col-span-2 flex gap-[12px] items-center justify-center py-[16px] rounded-[12px] bg-[#ff906d] border-none cursor-pointer">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[16px] tracking-[3.2px] uppercase">Cobrar $71.30</span>
              <svg className="size-[16px]" fill="none" viewBox="0 0 16 16"><path d={svgPaths.p1a406200} fill="#5B1600" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
