import svgPaths from "./svg-qgatbhef3k";
import imgElectricDrink from "figma:asset/356c18bfe5cca7e51ba295635755e0843e79e4d1.png";
import imgDigitalPasta from "figma:asset/436d73e49206778c5c4b265dfe54e2ed10e7b778.png";
import imgNeonBurger from "figma:asset/40d31d2fb0d13ab6818cfa26176698858002ed8a.png";
import imgSynthSushi from "figma:asset/4850964113c38e7645bb48884f06257abafb37e7.png";
import imgItemThumb from "figma:asset/1802332566dfd56c7b793fe6c7bd542375e71161.png";
import imgItemThumb1 from "figma:asset/e48db40a2c905ad13538d988076ed6e1463b641f.png";
import imgManagerProfile from "figma:asset/9b19a898761052a1578ea4d6c5791772d9acadb1.png";

function Container2() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[10px] tracking-[2px] uppercase w-[266.92px]">
        <p className="leading-[15px]">New Order: Table 12 - Cyber-Ramen x2</p>
      </div>
    </div>
  );
}

function Container3() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular','Noto_Sans:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] relative shrink-0 text-[#59ee50] text-[10px] tracking-[2px] uppercase w-[141.33px]">
        <p className="leading-[15px]">● Ready: Order #882</p>
      </div>
    </div>
  );
}

function Container4() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[10px] tracking-[2px] uppercase w-[233.98px]">
        <p className="leading-[15px]">Incoming: VIP Reservation - 20:30</p>
      </div>
    </div>
  );
}

function Container5() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular','Noto_Sans:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] relative shrink-0 text-[#ff6aa0] text-[10px] tracking-[2px] uppercase w-[268.44px]">
        <p className="leading-[15px]">● Priority: Table 04 - Special Request</p>
      </div>
    </div>
  );
}

function Container6() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[10px] tracking-[2px] uppercase w-[238.25px]">
        <p className="leading-[15px]">New Order: Table 08 - Neon-Gyoza</p>
      </div>
    </div>
  );
}

function Container1() {
  return (
    <div className="h-[15px] relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[48px] items-start relative size-full">
        <Container2 />
        <Container3 />
        <Container4 />
        <Container5 />
        <Container6 />
      </div>
    </div>
  );
}

function Ticker() {
  return (
    <div className="bg-[#131313] relative shrink-0 w-full" data-name="Ticker">
      <div className="content-stretch flex flex-col items-start overflow-clip pb-[9px] pt-[8px] relative rounded-[inherit] w-full">
        <Container1 />
      </div>
      <div aria-hidden="true" className="absolute border-[rgba(255,144,109,0.1)] border-b border-solid inset-0 pointer-events-none" />
    </div>
  );
}

function Button() {
  return (
    <div className="bg-[#ff906d] content-stretch flex flex-col items-center justify-center px-[32px] py-[12px] relative rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.3)] shrink-0" data-name="Button">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#5b1600] text-[16px] text-center tracking-[1.6px] uppercase w-[91.78px]">
        <p className="leading-[24px]">All Items</p>
      </div>
    </div>
  );
}

function Button1() {
  return (
    <div className="bg-[#201f1f] content-stretch flex flex-col items-center justify-center px-[32px] py-[12px] relative rounded-[12px] shrink-0" data-name="Button">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[16px] text-center tracking-[1.6px] uppercase w-[81.97px]">
        <p className="leading-[24px]">Burgers</p>
      </div>
    </div>
  );
}

function Button2() {
  return (
    <div className="bg-[#201f1f] content-stretch flex flex-col items-center justify-center px-[32px] py-[12px] relative rounded-[12px] shrink-0" data-name="Button">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[16px] text-center tracking-[1.6px] uppercase w-[64.77px]">
        <p className="leading-[24px]">Drinks</p>
      </div>
    </div>
  );
}

function Button3() {
  return (
    <div className="bg-[#201f1f] content-stretch flex flex-col items-center justify-center px-[32px] py-[12px] relative rounded-[12px] shrink-0" data-name="Button">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[16px] text-center tracking-[1.6px] uppercase w-[52.84px]">
        <p className="leading-[24px]">Sushi</p>
      </div>
    </div>
  );
}

function Button4() {
  return (
    <div className="bg-[#201f1f] content-stretch flex flex-col items-center justify-center px-[32px] py-[12px] relative rounded-[12px] shrink-0" data-name="Button">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[16px] text-center tracking-[1.6px] uppercase w-[89.55px]">
        <p className="leading-[24px]">Desserts</p>
      </div>
    </div>
  );
}

function Button5() {
  return (
    <div className="bg-[#201f1f] content-stretch flex flex-col items-center justify-center px-[32px] py-[12px] relative rounded-[12px] shrink-0" data-name="Button">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[16px] text-center tracking-[1.6px] uppercase w-[96.75px]">
        <p className="leading-[24px]">Cocktails</p>
      </div>
    </div>
  );
}

function CategoryBar() {
  return (
    <div className="content-stretch flex gap-[16px] items-start overflow-clip pb-[8px] relative shrink-0 w-full" data-name="Category Bar">
      <Button />
      <Button1 />
      <Button2 />
      <Button3 />
      <Button4 />
      <Button5 />
    </div>
  );
}

function ElectricDrink() {
  return (
    <div className="h-[398.97px] relative shrink-0 w-full" data-name="Electric Drink">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgElectricDrink} />
      </div>
    </div>
  );
}

function Container7() {
  return (
    <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative rounded-[8px] shrink-0 w-full" data-name="Container">
      <ElectricDrink />
    </div>
  );
}

function Heading3() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Heading 4">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[18px] text-white uppercase w-[113.38px]">
        <p className="leading-[28px]">Voltage Fizz</p>
      </div>
    </div>
  );
}

function Container10() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] w-[163.48px]">
        <p className="leading-[16px]">Blue Gin, Tonic, Ionized Lime</p>
      </div>
    </div>
  );
}

function Container9() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-[163.48px]" data-name="Container">
      <Heading3 />
      <Container10 />
    </div>
  );
}

function Container8() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex items-start justify-between relative w-full">
        <Container9 />
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[16px] w-[52.42px]">
          <p className="leading-[24px]">$14.00</p>
        </div>
      </div>
    </div>
  );
}

function Item1() {
  return (
    <div className="bg-[#201f1f] col-1 justify-self-stretch relative rounded-[12px] row-2 self-start shrink-0" data-name="Item 3">
      <div className="content-stretch flex flex-col gap-[16px] items-start p-[16px] relative w-full">
        <Container7 />
        <Container8 />
      </div>
    </div>
  );
}

function DigitalPasta() {
  return (
    <div className="h-[398.97px] relative shrink-0 w-full" data-name="Digital Pasta">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgDigitalPasta} />
      </div>
    </div>
  );
}

function Container11() {
  return (
    <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative rounded-[8px] shrink-0 w-full" data-name="Container">
      <DigitalPasta />
    </div>
  );
}

function Heading4() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Heading 4">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[18px] text-white uppercase w-[175.77px]">
        <p className="leading-[28px]">Null-Noodle Pasta</p>
      </div>
    </div>
  );
}

function Container14() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] w-[170.2px]">
        <p className="leading-[16px]">Ink squid pasta, Ghost pepper</p>
      </div>
    </div>
  );
}

function Container13() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-[175.77px]" data-name="Container">
      <Heading4 />
      <Container14 />
    </div>
  );
}

function Container12() {
  return (
    <div className="content-stretch flex items-start justify-between relative shrink-0 w-full" data-name="Container">
      <Container13 />
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[16px] w-[51.75px]">
        <p className="leading-[24px]">$21.00</p>
      </div>
    </div>
  );
}

function Item2() {
  return (
    <div className="bg-[#201f1f] col-2 justify-self-stretch relative rounded-[12px] row-2 self-start shrink-0" data-name="Item 4">
      <div className="content-stretch flex flex-col gap-[16px] items-start p-[16px] relative w-full">
        <Container11 />
        <Container12 />
      </div>
    </div>
  );
}

function Container17() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p2fcd0500} fill="var(--fill-0, #59EE50)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Background() {
  return (
    <div className="bg-[#006e0a] content-stretch flex items-center justify-center relative rounded-[9999px] shrink-0 size-[40px]" data-name="Background">
      <Container17 />
    </div>
  );
}

function Heading5() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Heading 4">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[20px] justify-center leading-[0] relative shrink-0 text-[14px] text-white uppercase w-[149.33px]">
        <p className="leading-[20px]">Overclock Espresso</p>
      </div>
    </div>
  );
}

function Container16() {
  return (
    <div className="content-stretch flex gap-[12px] items-center relative shrink-0 w-full" data-name="Container">
      <Background />
      <Heading5 />
    </div>
  );
}

function Container20() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[1px] uppercase w-[77.23px]">
        <p className="leading-[15px]">Single Shot</p>
      </div>
    </div>
  );
}

function Container21() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[16px] w-[44.61px]">
        <p className="leading-[24px]">$4.50</p>
      </div>
    </div>
  );
}

function Container19() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-row items-end size-full">
        <div className="content-stretch flex items-end justify-between relative w-full">
          <Container20 />
          <Container21 />
        </div>
      </div>
    </div>
  );
}

function Background1() {
  return (
    <div className="bg-black h-[4px] overflow-clip relative rounded-[9999px] shrink-0 w-full" data-name="Background">
      <div className="absolute bg-[#59ee50] inset-[0_33.34%_0_0]" data-name="Background" />
    </div>
  );
}

function Container18() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full" data-name="Container">
      <Container19 />
      <Background1 />
    </div>
  );
}

function Margin() {
  return (
    <div className="content-stretch flex flex-col items-start pt-[16px] relative shrink-0 w-full" data-name="Margin">
      <Container18 />
    </div>
  );
}

function Container15() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-between relative w-full">
        <Container16 />
        <Margin />
      </div>
    </div>
  );
}

function Item5SmallBentoCard() {
  return (
    <div className="bg-[#201f1f] col-3 justify-self-stretch relative rounded-[12px] row-2 self-start shrink-0" data-name="Item 5: Small Bento Card">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.1)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <div className="flex flex-col justify-center size-full">
        <div className="content-stretch flex flex-col items-start justify-center p-[17px] relative w-full">
          <Container15 />
        </div>
      </div>
    </div>
  );
}

function NeonBurger() {
  return (
    <div className="absolute inset-[0_0.01px_0_0] opacity-60" data-name="Neon Burger">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute h-[200%] left-0 max-w-none top-[-50%] w-full" src={imgNeonBurger} />
      </div>
    </div>
  );
}

function OverlayBorder() {
  return (
    <div className="bg-[rgba(255,106,160,0.2)] content-stretch flex items-start px-[9px] py-[5px] relative rounded-[6px] shrink-0" data-name="Overlay+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(255,106,160,0.3)] border-solid inset-0 pointer-events-none rounded-[6px]" />
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff6aa0] text-[10px] uppercase w-[64.78px]">
        <p className="leading-[15px]">Best Seller</p>
      </div>
    </div>
  );
}

function Heading2() {
  return (
    <div className="content-stretch flex flex-col items-start pt-[4px] relative shrink-0 w-full" data-name="Heading 3">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[36px] justify-center leading-[0] relative shrink-0 text-[30px] text-white tracking-[-0.75px] uppercase w-[300.97px]">
        <p className="leading-[36px]">Cyber-Bison Burger</p>
      </div>
    </div>
  );
}

function Container25() {
  return (
    <div className="content-stretch flex flex-col items-start max-w-[320px] relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Light',sans-serif] font-light h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[14px] w-[318.88px]">
        <p className="leading-[20px]">Double bison patty, digital truffle oil, neon gouda.</p>
      </div>
    </div>
  );
}

function Container24() {
  return (
    <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0" data-name="Container">
      <OverlayBorder />
      <Heading2 />
      <Container25 />
    </div>
  );
}

function Container27() {
  return (
    <div className="content-stretch flex flex-col items-end relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[24px] text-right w-[81.66px]">
        <p className="leading-[32px]">$24.00</p>
      </div>
    </div>
  );
}

function Container26() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <Container27 />
    </div>
  );
}

function Container23() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-row items-end size-full">
        <div className="content-stretch flex items-end justify-between relative w-full">
          <Container24 />
          <Container26 />
        </div>
      </div>
    </div>
  );
}

function Container22() {
  return (
    <div className="absolute bottom-[24px] content-stretch flex flex-col items-start left-[24px] right-[24.01px]" data-name="Container">
      <Container23 />
    </div>
  );
}

function Item1LargeFeature() {
  return (
    <div className="aspect-[2/1] bg-[#201f1f] col-[1/span_2] justify-self-stretch overflow-clip relative rounded-[12px] row-1 shrink-0" data-name="Item 1: Large Feature">
      <NeonBurger />
      <div className="absolute bg-gradient-to-t from-[#0e0e0e] inset-[0_0.01px_0_0] to-[rgba(14,14,14,0)] via-1/2 via-[rgba(14,14,14,0)]" data-name="Gradient" />
      <Container22 />
    </div>
  );
}

function SynthSushi() {
  return (
    <div className="h-[398.98px] relative shrink-0 w-full" data-name="Synth Sushi">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgSynthSushi} />
      </div>
    </div>
  );
}

function Container28() {
  return (
    <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative rounded-[8px] shrink-0 w-full" data-name="Container">
      <SynthSushi />
    </div>
  );
}

function Heading6() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Heading 4">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[18px] text-white uppercase w-[142.53px]">
        <p className="leading-[28px]">Synth-Roll Set</p>
      </div>
    </div>
  );
}

function Container31() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] w-[147.97px]">
        <p className="leading-[16px]">8pc Grade-A Data Salmon</p>
      </div>
    </div>
  );
}

function Container30() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-[147.97px]" data-name="Container">
      <Heading6 />
      <Container31 />
    </div>
  );
}

function Container29() {
  return (
    <div className="content-stretch flex items-start justify-between relative shrink-0 w-full" data-name="Container">
      <Container30 />
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[16px] w-[51.27px]">
        <p className="leading-[24px]">$18.50</p>
      </div>
    </div>
  );
}

function Container33() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] uppercase w-[69.06px]">
        <p className="leading-[15px]">Fresh Catch</p>
      </div>
    </div>
  );
}

function Container32() {
  return (
    <div className="content-stretch flex gap-[8px] items-start relative shrink-0 w-full" data-name="Container">
      <div className="bg-[#59ee50] rounded-[9999px] shrink-0 size-[6px]" data-name="Background" />
      <Container33 />
    </div>
  );
}

function Item() {
  return (
    <div className="bg-[#201f1f] col-3 justify-self-stretch relative rounded-[12px] row-1 self-start shrink-0" data-name="Item 2">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[16px] items-start p-[16px] relative w-full">
          <Container28 />
          <Container29 />
          <Container32 />
          <div className="absolute h-[45px] right-[20.99px] top-[23.5px] w-[50px]" data-name="Icon">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 50 45">
              <path d={svgPaths.p378e7996} fill="var(--fill-0, white)" id="Icon" opacity="0.1" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductGridBentoStyle() {
  return (
    <div className="gap-x-[24px] gap-y-[24px] grid grid-cols-[repeat(3,minmax(0,1fr))] grid-rows-[__521.98px_490.97px] relative shrink-0 w-full" data-name="Product Grid (Bento Style)">
      <Item1 />
      <Item2 />
      <Item5SmallBentoCard />
      <Item1LargeFeature />
      <Item />
    </div>
  );
}

function LeftSideMenuSelection() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[32px] items-start min-h-px min-w-px relative" data-name="Left Side: Menu Selection">
      <Ticker />
      <CategoryBar />
      <ProductGridBentoStyle />
    </div>
  );
}

function Heading1() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Heading 2">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[20px] text-white uppercase w-[155.53px]">
        <p className="leading-[28px]">Current Order</p>
      </div>
    </div>
  );
}

function Background2() {
  return (
    <div className="bg-[#ff784d] content-stretch flex flex-col items-start px-[8px] py-[2px] relative rounded-[4px] shrink-0" data-name="Background">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#460f00] text-[10px] uppercase w-[44.58px]">
        <p className="leading-[15px]">Table 12</p>
      </div>
    </div>
  );
}

function Container34() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between relative w-full">
        <Heading1 />
        <Background2 />
      </div>
    </div>
  );
}

function Container35() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[1px] uppercase w-full">
          <p className="leading-[15px]">ID: #XB-9920-A</p>
        </div>
      </div>
    </div>
  );
}

function HorizontalBorder() {
  return (
    <div className="relative shrink-0 w-full" data-name="HorizontalBorder">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.2)] border-b border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[4px] items-start pb-[25px] pt-[24px] px-[24px] relative w-full">
        <Container34 />
        <Container35 />
      </div>
    </div>
  );
}

function ItemThumb() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Item Thumb">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgItemThumb} />
      </div>
    </div>
  );
}

function Container37() {
  return (
    <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative rounded-[8px] shrink-0 size-[64px]" data-name="Container">
      <ItemThumb />
    </div>
  );
}

function Heading7() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Heading 5">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[20px] justify-center leading-[0] relative shrink-0 text-[14px] text-white uppercase w-[146.75px]">
        <p className="leading-[20px]">Cyber-Bison Burger</p>
      </div>
    </div>
  );
}

function Button6() {
  return (
    <div className="relative shrink-0 size-[8.167px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.16667 8.16667">
        <g id="Button">
          <path d={svgPaths.p2317cf00} fill="var(--fill-0, #FF716C)" fillOpacity="0.6" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container39() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex items-start justify-between relative w-full">
        <Heading7 />
        <Button6 />
      </div>
    </div>
  );
}

function Container40() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] uppercase w-full">
        <p className="leading-[15px]">Extra Neon Sauce, No Onions</p>
      </div>
    </div>
  );
}

function Button7() {
  return (
    <div className="h-px relative shrink-0 w-[7px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 7 1">
        <g id="Button">
          <path d="M0 1V0H7V1H0V1" fill="var(--fill-0, white)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container42() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] relative shrink-0 text-[12px] text-white w-[14.91px]">
          <p className="leading-[16px]">02</p>
        </div>
      </div>
    </div>
  );
}

function Button8() {
  return (
    <div className="relative shrink-0 size-[7px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 7 7">
        <g id="Button">
          <path d={svgPaths.p5461aa0} fill="var(--fill-0, white)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function BackgroundBorder() {
  return (
    <div className="bg-[#131313] content-stretch flex gap-[12px] items-center px-[9px] py-[5px] relative rounded-[6px] shrink-0" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[6px]" />
      <Button7 />
      <Container42 />
      <Button8 />
    </div>
  );
}

function Container43() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[16px] w-[54.8px]">
        <p className="leading-[24px]">$48.00</p>
      </div>
    </div>
  );
}

function Container41() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between pt-[4px] relative w-full">
          <BackgroundBorder />
          <Container43 />
        </div>
      </div>
    </div>
  );
}

function Container38() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-h-px min-w-px relative self-stretch" data-name="Container">
      <Container39 />
      <Container40 />
      <Container41 />
    </div>
  );
}

function CartItem() {
  return (
    <div className="content-stretch flex gap-[16px] items-start relative shrink-0 w-full" data-name="Cart Item">
      <Container37 />
      <Container38 />
    </div>
  );
}

function ItemThumb1() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Item Thumb">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgItemThumb1} />
      </div>
    </div>
  );
}

function Container45() {
  return (
    <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative rounded-[8px] shrink-0 size-[64px]" data-name="Container">
      <ItemThumb1 />
    </div>
  );
}

function Heading8() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Heading 5">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[20px] justify-center leading-[0] relative shrink-0 text-[14px] text-white uppercase w-[88.17px]">
        <p className="leading-[20px]">Voltage Fizz</p>
      </div>
    </div>
  );
}

function Button9() {
  return (
    <div className="relative shrink-0 size-[8.167px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 8.16667 8.16667">
        <g id="Button">
          <path d={svgPaths.p2317cf00} fill="var(--fill-0, #FF716C)" fillOpacity="0.6" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container47() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex items-start justify-between relative w-full">
        <Heading8 />
        <Button9 />
      </div>
    </div>
  );
}

function Container48() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] uppercase w-full">
        <p className="leading-[15px]">Regular Ice</p>
      </div>
    </div>
  );
}

function Button10() {
  return (
    <div className="h-px relative shrink-0 w-[7px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 7 1">
        <g id="Button">
          <path d="M0 1V0H7V1H0V1" fill="var(--fill-0, white)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container50() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] relative shrink-0 text-[12px] text-white w-[13.2px]">
          <p className="leading-[16px]">01</p>
        </div>
      </div>
    </div>
  );
}

function Button11() {
  return (
    <div className="relative shrink-0 size-[7px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 7 7">
        <g id="Button">
          <path d={svgPaths.p5461aa0} fill="var(--fill-0, white)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function BackgroundBorder1() {
  return (
    <div className="bg-[#131313] content-stretch flex gap-[12px] items-center px-[9px] py-[5px] relative rounded-[6px] shrink-0" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[6px]" />
      <Button10 />
      <Container50 />
      <Button11 />
    </div>
  );
}

function Container51() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[16px] w-[52.42px]">
        <p className="leading-[24px]">$14.00</p>
      </div>
    </div>
  );
}

function Container49() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between pt-[4px] relative w-full">
          <BackgroundBorder1 />
          <Container51 />
        </div>
      </div>
    </div>
  );
}

function Container46() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-h-px min-w-px relative self-stretch" data-name="Container">
      <Container47 />
      <Container48 />
      <Container49 />
    </div>
  );
}

function Container44() {
  return (
    <div className="content-stretch flex gap-[16px] items-start relative shrink-0 w-full" data-name="Container">
      <Container45 />
      <Container46 />
    </div>
  );
}

function Container36() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Container">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[24px] items-start p-[24px] relative size-full">
          <CartItem />
          <Container44 />
        </div>
      </div>
    </div>
  );
}

function Container54() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase w-[71.41px]">
        <p className="leading-[16px]">Subtotal</p>
      </div>
    </div>
  );
}

function Container55() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase w-[47.95px]">
        <p className="leading-[16px]">$62.00</p>
      </div>
    </div>
  );
}

function Container53() {
  return (
    <div className="h-[16px] relative shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex items-start justify-between relative size-full">
        <Container54 />
        <Container55 />
      </div>
    </div>
  );
}

function Container57() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase w-[132.8px]">
        <p className="leading-[16px]">Service Tax (15%)</p>
      </div>
    </div>
  );
}

function Container58() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase w-[38.95px]">
        <p className="leading-[16px]">$9.30</p>
      </div>
    </div>
  );
}

function Container56() {
  return (
    <div className="h-[16px] relative shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex items-start justify-between relative size-full">
        <Container57 />
        <Container58 />
      </div>
    </div>
  );
}

function Container59() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[18px] text-white uppercase w-[52.34px]">
          <p className="leading-[28px]">Total</p>
        </div>
      </div>
    </div>
  );
}

function Container60() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#59ee50] text-[24px] w-[75.75px]">
          <p className="leading-[32px]">$71.30</p>
        </div>
      </div>
    </div>
  );
}

function HorizontalBorder1() {
  return (
    <div className="relative shrink-0 w-full" data-name="HorizontalBorder">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.1)] border-solid border-t inset-0 pointer-events-none" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between pt-[9px] relative w-full">
          <Container59 />
          <Container60 />
        </div>
      </div>
    </div>
  );
}

function Container52() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[8px] items-start relative w-full">
        <Container53 />
        <Container56 />
        <HorizontalBorder1 />
      </div>
    </div>
  );
}

function Container62() {
  return (
    <div className="h-[13.5px] relative shrink-0 w-[15px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15 13.5">
        <g id="Container">
          <path d={svgPaths.p18098d80} fill="var(--fill-0, #59EE50)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button12() {
  return (
    <div className="bg-[rgba(255,255,255,0)] col-1 content-stretch flex gap-[8px] items-center justify-center justify-self-start pl-[12.77px] pr-[12.76px] py-[14px] relative rounded-[12px] row-1 self-start shrink-0" data-name="Button">
      <div aria-hidden="true" className="absolute border-2 border-[#59ee50] border-solid inset-0 pointer-events-none rounded-[12px] shadow-[0px_0px_15px_0px_rgba(89,238,80,0.1)]" />
      <Container62 />
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] relative shrink-0 text-[#59ee50] text-[12px] text-center tracking-[1.2px] uppercase w-[89px]">
        <p className="leading-[16px]">Print Ticket</p>
      </div>
    </div>
  );
}

function Container63() {
  return (
    <div className="h-[15px] relative shrink-0 w-[11.25px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.25 15">
        <g id="Container">
          <path d={svgPaths.p30f20700} fill="var(--fill-0, #59EE50)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button13() {
  return (
    <div className="bg-[rgba(255,255,255,0)] col-2 content-stretch flex gap-[8px] items-center justify-center justify-self-start pl-[29.22px] pr-[29.24px] py-[14px] relative rounded-[12px] row-1 self-start shrink-0" data-name="Button">
      <div aria-hidden="true" className="absolute border-2 border-[#59ee50] border-solid inset-0 pointer-events-none rounded-[12px] shadow-[0px_0px_15px_0px_rgba(89,238,80,0.1)]" />
      <Container63 />
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] relative shrink-0 text-[#59ee50] text-[12px] text-center tracking-[1.2px] uppercase w-[56.09px]">
        <p className="leading-[16px]">Kitchen</p>
      </div>
    </div>
  );
}

function Container64() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Container">
          <path d={svgPaths.p1a406200} fill="var(--fill-0, #5B1600)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button14() {
  return (
    <div className="bg-[#ff906d] col-[1/span_2] content-stretch flex gap-[12px] items-center justify-center justify-self-start pl-[50.19px] pr-[50.18px] py-[16px] relative rounded-[12px] row-2 self-start shrink-0" data-name="Button">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#5b1600] text-[16px] text-center tracking-[3.2px] uppercase w-[156.69px]">
        <p className="leading-[24px]">Charge $71.30</p>
      </div>
      <Container64 />
    </div>
  );
}

function Container61() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid gap-x-[12px] gap-y-[12px] grid grid-cols-[repeat(2,minmax(0,1fr))] grid-rows-[__56px_56px] relative w-full">
        <Button12 />
        <Button13 />
        <Button14 />
      </div>
    </div>
  );
}

function OrderTotalsActions() {
  return (
    <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.8)] relative rounded-bl-[16px] rounded-br-[16px] shrink-0 w-full" data-name="Order Totals & Actions">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.2)] border-solid border-t inset-0 pointer-events-none rounded-bl-[16px] rounded-br-[16px]" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[24px] items-start pb-[24px] pt-[25px] px-[24px] relative w-full">
        <Container52 />
        <Container61 />
      </div>
    </div>
  );
}

function AsideRightSideFloatingCartPanel() {
  return (
    <div className="backdrop-blur-[12px] bg-[rgba(32,31,31,0.6)] content-stretch flex flex-col h-[1194px] items-start p-px relative rounded-[16px] shrink-0 w-[343.08px]" data-name="Aside - Right Side: Floating Cart Panel">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.1)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <div className="absolute bg-[rgba(255,255,255,0)] h-[1194px] left-0 rounded-[16px] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] top-0 w-[343.08px]" data-name="Aside - Right Side: Floating Cart Panel:shadow" />
      <HorizontalBorder />
      <Container36 />
      <OrderTotalsActions />
    </div>
  );
}

function Container() {
  return (
    <div className="content-stretch flex gap-[32px] items-start pb-[120px] relative shrink-0 w-full" data-name="Container">
      <LeftSideMenuSelection />
      <AsideRightSideFloatingCartPanel />
    </div>
  );
}

function MainContent() {
  return (
    <div className="min-h-[1314px] relative shrink-0 w-full" data-name="Main Content">
      <div className="flex flex-col justify-center min-h-[inherit] size-full">
        <div className="content-stretch flex flex-col items-start justify-center min-h-[inherit] pb-[32px] pt-[80px] px-[32px] relative w-full">
          <Container />
        </div>
      </div>
    </div>
  );
}

function Heading() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Heading 1">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[24px] tracking-[-0.6px] uppercase w-full">
        <p className="leading-[32px]">Neon-Gastro</p>
      </div>
    </div>
  );
}

function Container66() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[1px] uppercase w-full">
        <p className="leading-[15px]">Station 04 - Active</p>
      </div>
    </div>
  );
}

function Container65() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex flex-col gap-[4px] items-start p-[24px] relative w-full">
        <Heading />
        <Container66 />
      </div>
    </div>
  );
}

function Container67() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p20793584} fill="var(--fill-0, #FF906D)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container68() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[16px] tracking-[-0.4px] w-[79.98px]">
          <p className="leading-[24px]">Dashboard</p>
        </div>
      </div>
    </div>
  );
}

function Link() {
  return (
    <div className="bg-[#262626] content-stretch flex gap-[16px] items-center pl-[20px] pr-[16px] py-[12px] relative w-[224px]" data-name="Link">
      <div aria-hidden="true" className="absolute border-[#ff906d] border-l-4 border-solid inset-0 pointer-events-none" />
      <Container67 />
      <Container68 />
    </div>
  );
}

function Container69() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p186f5ba0} fill="var(--fill-0, #6B7280)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container70() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[46.94px]">
        <p className="leading-[24px]">Tables</p>
      </div>
    </div>
  );
}

function Link1() {
  return (
    <div className="relative shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative w-full">
          <Container69 />
          <Container70 />
        </div>
      </div>
    </div>
  );
}

function Container71() {
  return (
    <div className="relative shrink-0 size-[20px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
        <g id="Container">
          <path d={svgPaths.p643d217} fill="var(--fill-0, #6B7280)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container72() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[70.02px]">
        <p className="leading-[24px]">Inventory</p>
      </div>
    </div>
  );
}

function Link2() {
  return (
    <div className="relative shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative w-full">
          <Container71 />
          <Container72 />
        </div>
      </div>
    </div>
  );
}

function Container73() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p30837e80} fill="var(--fill-0, #6B7280)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container74() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[68.48px]">
        <p className="leading-[24px]">Analytics</p>
      </div>
    </div>
  );
}

function Link3() {
  return (
    <div className="relative shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative w-full">
          <Container73 />
          <Container74 />
        </div>
      </div>
    </div>
  );
}

function Container75() {
  return (
    <div className="h-[16px] relative shrink-0 w-[20px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 16">
        <g id="Container">
          <path d={svgPaths.p18c14180} fill="var(--fill-0, #6B7280)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container76() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[60.7px]">
        <p className="leading-[24px]">Support</p>
      </div>
    </div>
  );
}

function Link4() {
  return (
    <div className="relative shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative w-full">
          <Container75 />
          <Container76 />
        </div>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Nav">
      <div className="flex flex-col items-center size-full">
        <div className="content-stretch flex flex-col gap-[8px] items-center px-[16px] relative size-full">
          <div className="flex h-[47.04px] items-center justify-center relative shrink-0 w-[219.52px]" style={{ "--transform-inner-width": "1185", "--transform-inner-height": "43" } as React.CSSProperties}>
            <div className="flex-none scale-x-98 scale-y-98">
              <Link />
            </div>
          </div>
          <Link1 />
          <Link2 />
          <Link3 />
          <Link4 />
        </div>
      </div>
    </div>
  );
}

function NavMargin() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Nav:margin">
      <div className="flex flex-col justify-center size-full">
        <div className="content-stretch flex flex-col items-start justify-center pt-[16px] relative size-full">
          <Nav />
        </div>
      </div>
    </div>
  );
}

function Container77() {
  return (
    <div className="h-[20px] relative shrink-0 w-[20.1px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20.1 20">
        <g id="Container">
          <path d={svgPaths.p3cdadd00} fill="var(--fill-0, #6B7280)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container78() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[60.7px]">
        <p className="leading-[24px]">Settings</p>
      </div>
    </div>
  );
}

function Link5() {
  return (
    <div className="relative shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative w-full">
          <Container77 />
          <Container78 />
        </div>
      </div>
    </div>
  );
}

function Container79() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p3e9df400} fill="var(--fill-0, #6B7280)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container80() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[57.2px]">
        <p className="leading-[24px]">Log out</p>
      </div>
    </div>
  );
}

function Link6() {
  return (
    <div className="relative shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative w-full">
          <Container79 />
          <Container80 />
        </div>
      </div>
    </div>
  );
}

function HorizontalBorder2() {
  return (
    <div className="relative shrink-0 w-full" data-name="HorizontalBorder">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.2)] border-solid border-t inset-0 pointer-events-none" />
      <div className="content-stretch flex flex-col gap-[8px] items-start pb-[16px] pt-[17px] px-[16px] relative w-full">
        <Link5 />
        <Link6 />
      </div>
    </div>
  );
}

function AsideSideNavBarShell() {
  return (
    <div className="absolute bg-[#131313] content-stretch flex flex-col h-[1314px] items-start left-0 top-0 w-[256px]" data-name="Aside - SideNavBar Shell">
      <Container65 />
      <NavMargin />
      <HorizontalBorder2 />
    </div>
  );
}

function Container82() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[18px] uppercase w-[144.8px]">
        <p className="leading-[28px]">Cloudix OS</p>
      </div>
    </div>
  );
}

function Container83() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[10px] tracking-[0.5px] uppercase w-[67.66px]">
          <p className="leading-[15px]">Kitchen Live</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorder2() {
  return (
    <div className="bg-[#201f1f] content-stretch flex gap-[8px] items-center px-[13px] py-[5px] relative rounded-[9999px] shrink-0" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[9999px]" />
      <div className="bg-[#59ee50] rounded-[9999px] shrink-0 size-[8px]" data-name="Background" />
      <Container83 />
    </div>
  );
}

function Container81() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[24px] items-center relative">
        <Container82 />
        <div className="bg-[rgba(72,72,71,0.3)] h-[16px] shrink-0 w-px" data-name="Vertical Divider" />
        <BackgroundBorder2 />
      </div>
    </div>
  );
}

function Container86() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-h-px min-w-px overflow-clip relative" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[12px] tracking-[-0.6px] uppercase w-full">
        <p className="leading-[normal]">SEARCH DISHES...</p>
      </div>
    </div>
  );
}

function Input() {
  return (
    <div className="bg-[#131313] content-stretch flex items-start justify-center overflow-clip pl-[40px] pr-[16px] py-[6px] relative rounded-[2px] shrink-0 w-[256px]" data-name="Input">
      <Container86 />
    </div>
  );
}

function Container85() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <Input />
      <div className="absolute bottom-[31.25%] left-[13.75px] top-[31.25%] w-[10.5px]" data-name="Icon">
        <div className="absolute inset-[0_0_-3.7%_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 10.5 10.5">
            <path d={svgPaths.p210dd580} fill="var(--fill-0, #ADAAAA)" id="Icon" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Button15() {
  return (
    <div className="h-[21px] relative shrink-0 w-[18px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 21">
        <g id="Button">
          <path d={svgPaths.pe40b59c} fill="var(--fill-0, #ADAAAA)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button16() {
  return (
    <div className="h-[14.15px] relative shrink-0 w-[20px]" data-name="Button">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 14.15">
        <g id="Button">
          <path d={svgPaths.p793b600} fill="var(--fill-0, #ADAAAA)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button17() {
  return (
    <div className="h-[20px] relative shrink-0 w-[16px]" data-name="Button">
      <div className="absolute inset-[-20%_-25.06%_0_0]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20.01 24">
          <g id="Button">
            <path d={svgPaths.p28252700} fill="var(--fill-0, #ADAAAA)" id="Icon" />
            <rect fill="var(--fill-0, #FF6AA0)" height="8" id="Background" rx="4" width="8" x="12.01" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Container87() {
  return (
    <div className="content-stretch flex gap-[16px] items-center relative shrink-0" data-name="Container">
      <Button15 />
      <Button16 />
      <Button17 />
    </div>
  );
}

function Container89() {
  return (
    <div className="content-stretch flex flex-col items-end relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[10px] text-right text-white uppercase w-[68.08px]">
        <p className="leading-[15px]">M. Kusanagi</p>
      </div>
    </div>
  );
}

function Container90() {
  return (
    <div className="content-stretch flex flex-col items-end relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff906d] text-[8px] text-right tracking-[-0.4px] uppercase w-[63.41px]">
        <p className="leading-[12px]">Floor Manager</p>
      </div>
    </div>
  );
}

function Container88() {
  return (
    <div className="relative shrink-0 w-[68.08px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <Container89 />
        <Container90 />
      </div>
    </div>
  );
}

function ManagerProfile() {
  return (
    <div className="pointer-events-none relative rounded-[9999px] shrink-0 size-[32px]" data-name="Manager Profile">
      <div className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 overflow-hidden rounded-[9999px]">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgManagerProfile} />
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(255,144,109,0.3)] border-solid inset-0 rounded-[9999px]" />
    </div>
  );
}

function VerticalBorder() {
  return (
    <div className="content-stretch flex gap-[12px] items-center pl-[25px] relative shrink-0" data-name="VerticalBorder">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.2)] border-l border-solid inset-0 pointer-events-none" />
      <Container88 />
      <ManagerProfile />
    </div>
  );
}

function Margin1() {
  return (
    <div className="content-stretch flex flex-col items-start pl-[8px] relative shrink-0" data-name="Margin">
      <VerticalBorder />
    </div>
  );
}

function Container84() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[24px] items-center relative">
        <Container85 />
        <Container87 />
        <Margin1 />
      </div>
    </div>
  );
}

function HeaderTopAppBarShell() {
  return (
    <div className="absolute backdrop-blur-[6px] bg-[rgba(14,14,14,0.6)] content-stretch flex h-[64px] items-center justify-between left-[256px] pb-px pl-[32px] pr-[31.99px] right-0 top-0" data-name="Header - TopAppBar Shell">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.2)] border-b border-solid inset-0 pointer-events-none shadow-[0px_4px_24px_0px_rgba(255,144,109,0.08)]" />
      <Container81 />
      <Container84 />
    </div>
  );
}

function Container91() {
  return (
    <div className="relative shrink-0 size-[14px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 14 14">
        <g id="Container">
          <path d={svgPaths.p2bb32400} fill="var(--fill-0, #470021)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function ButtonFabForQuickActions() {
  return (
    <div className="absolute bg-[#ff6aa0] bottom-[144px] content-stretch flex items-center justify-center right-[430px] rounded-[9999px] shadow-[0px_0px_30px_0px_rgba(255,106,160,0.4)] size-[56px]" data-name="Button - FAB for Quick Actions">
      <Container91 />
    </div>
  );
}

export default function DashboardPos() {
  return (
    <div className="bg-[#0e0e0e] content-stretch flex flex-col items-start pl-[256px] relative size-full" data-name="Dashboard POS">
      <MainContent />
      <AsideSideNavBarShell />
      <HeaderTopAppBarShell />
      <ButtonFabForQuickActions />
    </div>
  );
}