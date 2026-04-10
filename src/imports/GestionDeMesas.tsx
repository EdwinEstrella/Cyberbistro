import svgPaths from "./svg-6uw0vd28yv";
import imgManager from "figma:asset/5d204621e0a6614e7d74eb7bee862abb266e58b9.png";

function Container() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#ff716c] text-[24px] w-[26.41px]">
          <p className="leading-[32px]">01</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge() {
  return (
    <div className="absolute bg-[#ff716c] right-[-8px] rounded-[9999px] size-[24px] top-[-8px]" data-name="Status Badge">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[5px] pt-[4px] relative size-full">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#490006] text-[10px] text-center w-[6.77px]">
          <p className="leading-[15px]">4</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorderShadow() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center p-[2px] relative rounded-[16px] shrink-0 size-[128px]" data-name="Background+Border+Shadow">
      <div aria-hidden="true" className="absolute border-2 border-[#ff716c] border-solid inset-0 pointer-events-none rounded-[16px] shadow-[0px_0px_15px_0px_rgba(255,113,108,0.3)]" />
      <Container />
      <StatusBadge />
    </div>
  );
}

function Table01Occupied() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex flex-col items-start left-[calc(50%-176px)] top-[calc(50%-176px)]" data-name="Table 01 (Occupied)">
      <BackgroundBorderShadow />
    </div>
  );
}

function Container1() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#59ee50] text-[24px] w-[29.81px]">
          <p className="leading-[32px]">02</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorderShadow1() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center p-[2px] relative rounded-[16px] shrink-0 size-[128px]" data-name="Background+Border+Shadow">
      <div aria-hidden="true" className="absolute border-2 border-[#59ee50] border-solid inset-0 pointer-events-none rounded-[16px] shadow-[0px_0px_15px_0px_rgba(89,238,80,0.3)]" />
      <Container1 />
    </div>
  );
}

function Table02Free() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex flex-col items-start left-1/2 top-[calc(50%-176px)]" data-name="Table 02 (Free)">
      <BackgroundBorderShadow1 />
    </div>
  );
}

function Container2() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[24px] w-[30.16px]">
          <p className="leading-[32px]">03</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorderShadow2() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center p-[2px] relative rounded-[16px] shrink-0 size-[128px]" data-name="Background+Border+Shadow">
      <div aria-hidden="true" className="absolute border-2 border-[#ff906d] border-solid inset-0 pointer-events-none rounded-[16px] shadow-[0px_0px_15px_0px_rgba(255,144,109,0.3)]" />
      <Container2 />
      <div className="absolute bg-[rgba(255,144,109,0.1)] inset-0 rounded-[16px]" data-name="Overlay" />
    </div>
  );
}

function Table03Cleaning() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex flex-col items-start left-[calc(50%+176px)] top-[calc(50%-176px)]" data-name="Table 03 (Cleaning)">
      <BackgroundBorderShadow2 />
    </div>
  );
}

function Container4() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#ff716c] text-[24px] w-[30.83px]">
        <p className="leading-[32px]">04</p>
      </div>
    </div>
  );
}

function Container5() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#ff716c] text-[24px] w-[29.95px]">
        <p className="leading-[32px]">05</p>
      </div>
    </div>
  );
}

function Container3() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[32px] items-center relative">
        <Container4 />
        <div className="bg-[rgba(72,72,71,0.3)] h-[48px] shrink-0 w-px" data-name="Vertical Divider" />
        <Container5 />
      </div>
    </div>
  );
}

function Background() {
  return (
    <div className="absolute bg-[#ff716c] right-[-8px] rounded-[9999px] size-[24px] top-[-8px]" data-name="Background">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[5px] pt-[4px] relative size-full">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#490006] text-[10px] text-center w-[10.63px]">
          <p className="leading-[15px]">12</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorderShadow3() {
  return (
    <div className="bg-[#262626] content-stretch flex h-[128px] items-center justify-center p-[2px] relative rounded-[16px] shrink-0 w-[288px]" data-name="Background+Border+Shadow">
      <div aria-hidden="true" className="absolute border-2 border-[#ff716c] border-solid inset-0 pointer-events-none rounded-[16px] shadow-[0px_0px_15px_0px_rgba(255,113,108,0.3)]" />
      <Container3 />
      <Background />
    </div>
  );
}

function LargeCombinedTable() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex flex-col items-start left-[calc(50%-176px)] top-1/2" data-name="Large Combined Table">
      <BackgroundBorderShadow3 />
    </div>
  );
}

function Container6() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#59ee50] text-[24px] w-[30.39px]">
          <p className="leading-[32px]">06</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorderShadow4() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center p-[2px] relative rounded-[9999px] shrink-0 size-[128px]" data-name="Background+Border+Shadow">
      <div aria-hidden="true" className="absolute border-2 border-[#59ee50] border-solid inset-0 pointer-events-none rounded-[9999px] shadow-[0px_0px_15px_0px_rgba(89,238,80,0.3)]" />
      <Container6 />
    </div>
  );
}

function Table06Free() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex flex-col items-start left-[calc(50%+80px)] top-1/2" data-name="Table 06 (Free)">
      <BackgroundBorderShadow4 />
    </div>
  );
}

function Container7() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#ff716c] text-[24px] w-[28.38px]">
          <p className="leading-[32px]">07</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorderShadow5() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center p-[2px] relative rounded-[16px] shrink-0 size-[128px]" data-name="Background+Border+Shadow">
      <div aria-hidden="true" className="absolute border-2 border-[#ff716c] border-solid inset-0 pointer-events-none rounded-[16px] shadow-[0px_0px_15px_0px_rgba(255,113,108,0.3)]" />
      <Container7 />
    </div>
  );
}

function Table07Occupied() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex flex-col items-start left-[calc(50%+256px)] top-1/2" data-name="Table 07 (Occupied)">
      <BackgroundBorderShadow5 />
    </div>
  );
}

function Container8() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#59ee50] text-[24px] w-[29.95px]">
          <p className="leading-[32px]">08</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorderShadow6() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center p-[2px] relative rounded-[16px] shrink-0 size-[128px]" data-name="Background+Border+Shadow">
      <div aria-hidden="true" className="absolute border-2 border-[#59ee50] border-solid inset-0 pointer-events-none rounded-[16px] shadow-[0px_0px_15px_0px_rgba(89,238,80,0.3)]" />
      <Container8 />
    </div>
  );
}

function Table08Free() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex flex-col items-start left-[calc(50%-88px)] top-[calc(50%+176px)]" data-name="Table 08 (Free)">
      <BackgroundBorderShadow6 />
    </div>
  );
}

function Container9() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[32px] justify-center leading-[0] relative shrink-0 text-[#59ee50] text-[24px] w-[30.39px]">
          <p className="leading-[32px]">09</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorderShadow7() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center p-[2px] relative rounded-[16px] shrink-0 size-[128px]" data-name="Background+Border+Shadow">
      <div aria-hidden="true" className="absolute border-2 border-[#59ee50] border-solid inset-0 pointer-events-none rounded-[16px] shadow-[0px_0px_15px_0px_rgba(89,238,80,0.3)]" />
      <Container9 />
    </div>
  );
}

function Table09Free() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute content-stretch flex flex-col items-start left-[calc(50%+88px)] top-[calc(50%+176px)]" data-name="Table 09 (Free)">
      <BackgroundBorderShadow7 />
    </div>
  );
}

function Container10() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[10px] text-[rgba(173,170,170,0.4)] tracking-[4px] uppercase w-[221.41px]">
          <p className="leading-[15px]">Kitchen Service Access</p>
        </div>
      </div>
    </div>
  );
}

function KitchenBoundaryVisual() {
  return (
    <div className="absolute bg-[#131313] bottom-px content-stretch flex h-[64px] items-center justify-center left-px pt-px right-px rounded-bl-[32px] rounded-br-[32px]" data-name="Kitchen Boundary Visual">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.3)] border-solid border-t inset-0 pointer-events-none rounded-bl-[32px] rounded-br-[32px]" />
      <Container10 />
    </div>
  );
}

function BackgroundBorder() {
  return (
    <div className="bg-[#131313] h-[700px] relative rounded-[32px] shrink-0 w-[864px]" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[32px]" />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute bg-[rgba(255,255,255,0)] h-[700px] left-1/2 rounded-[32px] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] top-1/2 w-[864px]" data-name="Overlay+Shadow" />
      <Table01Occupied />
      <Table02Free />
      <Table03Cleaning />
      <LargeCombinedTable />
      <Table06Free />
      <Table07Occupied />
      <Table08Free />
      <Table09Free />
      <KitchenBoundaryVisual />
    </div>
  );
}

function Component3DTopDownFloorPlan() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="3D/Top Down Floor Plan" style={{ backgroundImage: "linear-gradient(90deg, rgba(255, 144, 109, 0.05) 2.5%, rgba(255, 144, 109, 0) 2.5%), linear-gradient(rgba(255, 144, 109, 0.05) 2.5%, rgba(255, 144, 109, 0) 2.5%)" }}>
      <div className="flex flex-row items-center justify-center overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex items-center justify-center p-[80px] relative size-full">
          <BackgroundBorder />
        </div>
      </div>
    </div>
  );
}

function Container11() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[1px] uppercase w-[44.58px]">
          <p className="leading-[15px]">12 Free</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorder1() {
  return (
    <div className="absolute bg-[#201f1f] content-stretch flex gap-[8px] h-[25px] items-center left-[32px] px-[13px] py-[5px] right-[1161.42px] rounded-[9999px] top-[80px]" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[9999px]" />
      <div className="bg-[#59ee50] rounded-[9999px] shrink-0 size-[8px]" data-name="Background" />
      <Container11 />
    </div>
  );
}

function Container12() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[1px] uppercase w-[71.28px]">
          <p className="leading-[15px]">8 Occupied</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorder2() {
  return (
    <div className="absolute bg-[#201f1f] content-stretch flex gap-[8px] h-[25px] items-center left-[134.58px] px-[13px] py-[5px] right-[1032.14px] rounded-[9999px] top-[80px]" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[9999px]" />
      <div className="bg-[#ff716c] rounded-[9999px] shrink-0 size-[8px]" data-name="Background" />
      <Container12 />
    </div>
  );
}

function Container13() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[1px] uppercase w-[70.83px]">
          <p className="leading-[15px]">2 Cleaning</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundBorder3() {
  return (
    <div className="absolute bg-[#201f1f] content-stretch flex gap-[8px] h-[25px] items-center left-[263.86px] px-[13px] py-[5px] right-[903.31px] rounded-[9999px] top-[80px]" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[9999px]" />
      <div className="bg-[#ff906d] rounded-[9999px] shrink-0 size-[8px]" data-name="Background" />
      <Container13 />
    </div>
  );
}

function Container14() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p3fc48a20} fill="var(--fill-0, white)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button() {
  return (
    <div className="absolute bg-[#201f1f] content-stretch flex flex-col items-start left-[936.01px] p-[13px] right-[299.99px] rounded-[12px] top-[55px]" data-name="Button">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.1)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <Container14 />
    </div>
  );
}

function Container15() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p2899ed00} fill="var(--fill-0, white)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button1() {
  return (
    <div className="absolute bg-[#201f1f] content-stretch flex flex-col items-start left-[998.03px] p-[13px] right-[237.97px] rounded-[12px] top-[55px]" data-name="Button">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.1)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <Container15 />
    </div>
  );
}

function Container16() {
  return (
    <div className="relative shrink-0 size-[14px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 14 14">
        <g id="Container">
          <path d={svgPaths.p2bb32400} fill="var(--fill-0, #460F00)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button2() {
  return (
    <div className="absolute bg-[#ff906d] content-stretch flex gap-[8px] items-center left-[1062.04px] pb-[13px] pt-[12.5px] px-[24px] right-[37.01px] rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.3)] top-[55px]" data-name="Button">
      <Container16 />
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#460f00] text-[16px] text-center w-[110.95px]">
        <p className="leading-[24px]">Quick Booking</p>
      </div>
    </div>
  );
}

function Heading1() {
  return (
    <div className="relative shrink-0 w-full" data-name="Heading 3">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.2)] border-b border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pb-[17px] relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[18px] text-white w-[107.52px]">
          <p className="leading-[28px]">Live Activity</p>
        </div>
      </div>
    </div>
  );
}

function Container18() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] not-italic relative shrink-0 text-[#59ee50] text-[10px] uppercase w-full">
          <p className="leading-[15px]">Check Paid</p>
        </div>
      </div>
    </div>
  );
}

function Container19() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-full">
          <p className="leading-[20px]">Table 08 just cleared.</p>
        </div>
      </div>
    </div>
  );
}

function Container20() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-full">
          <p className="leading-[15px]">2 minutes ago</p>
        </div>
      </div>
    </div>
  );
}

function ActivityItem() {
  return (
    <div className="bg-[#201f1f] relative rounded-[12px] shrink-0 w-full" data-name="Activity Item">
      <div aria-hidden="true" className="absolute border-[#59ee50] border-l-4 border-solid inset-0 pointer-events-none rounded-[12px]" />
      <div className="content-stretch flex flex-col gap-[4px] items-start pl-[16px] pr-[12px] py-[12px] relative w-full">
        <Container18 />
        <Container19 />
        <Container20 />
      </div>
    </div>
  );
}

function Container21() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] not-italic relative shrink-0 text-[#ff716c] text-[10px] uppercase w-full">
          <p className="leading-[15px]">Warning</p>
        </div>
      </div>
    </div>
  );
}

function Container22() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-full">
          <p className="leading-[20px]">Table 01: Order 15m delay.</p>
        </div>
      </div>
    </div>
  );
}

function Container23() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-full">
          <p className="leading-[15px]">5 minutes ago</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundVerticalBorder() {
  return (
    <div className="bg-[#201f1f] relative rounded-[12px] shrink-0 w-full" data-name="Background+VerticalBorder">
      <div aria-hidden="true" className="absolute border-[#ff716c] border-l-4 border-solid inset-0 pointer-events-none rounded-[12px]" />
      <div className="content-stretch flex flex-col gap-[4px] items-start pl-[16px] pr-[12px] py-[12px] relative w-full">
        <Container21 />
        <Container22 />
        <Container23 />
      </div>
    </div>
  );
}

function Container24() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] not-italic relative shrink-0 text-[#ff6aa0] text-[10px] uppercase w-full">
          <p className="leading-[15px]">VIP Arrival</p>
        </div>
      </div>
    </div>
  );
}

function Container25() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-full">
          <p className="leading-[20px]">Mr. Sato seated at 04.</p>
        </div>
      </div>
    </div>
  );
}

function Container26() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-full">
          <p className="leading-[15px]">12 minutes ago</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundVerticalBorder1() {
  return (
    <div className="bg-[#201f1f] relative rounded-[12px] shrink-0 w-full" data-name="Background+VerticalBorder">
      <div aria-hidden="true" className="absolute border-[#ff6aa0] border-l-4 border-solid inset-0 pointer-events-none rounded-[12px]" />
      <div className="content-stretch flex flex-col gap-[4px] items-start pl-[16px] pr-[12px] py-[12px] relative w-full">
        <Container24 />
        <Container25 />
        <Container26 />
      </div>
    </div>
  );
}

function Container27() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] not-italic relative shrink-0 text-[#ff906d] text-[10px] uppercase w-full">
          <p className="leading-[15px]">Service</p>
        </div>
      </div>
    </div>
  );
}

function Container28() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Semi_Bold',sans-serif] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-full">
          <p className="leading-[20px]">Table 03 needs cleanup.</p>
        </div>
      </div>
    </div>
  );
}

function Container29() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-full">
          <p className="leading-[15px]">18 minutes ago</p>
        </div>
      </div>
    </div>
  );
}

function BackgroundVerticalBorder2() {
  return (
    <div className="bg-[#201f1f] relative rounded-[12px] shrink-0 w-full" data-name="Background+VerticalBorder">
      <div aria-hidden="true" className="absolute border-[#ff906d] border-l-4 border-solid inset-0 pointer-events-none rounded-[12px]" />
      <div className="content-stretch flex flex-col gap-[4px] items-start pl-[16px] pr-[12px] py-[12px] relative w-full">
        <Container27 />
        <Container28 />
        <Container29 />
      </div>
    </div>
  );
}

function Container17() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start pr-[8px] relative w-full">
          <ActivityItem />
          <BackgroundVerticalBorder />
          <BackgroundVerticalBorder1 />
          <BackgroundVerticalBorder2 />
        </div>
      </div>
    </div>
  );
}

function Container30() {
  return (
    <div className="content-stretch flex flex-col items-start pb-[4px] relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[12px] tracking-[1.2px] uppercase w-full">
        <p className="leading-[16px]">Kitchen Load</p>
      </div>
    </div>
  );
}

function Background2() {
  return <div className="bg-black h-[8px] rounded-[9999px] shrink-0 w-full" data-name="Background" />;
}

function Container32() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-[36.27px]">
        <p className="leading-[15px]">Optimal</p>
      </div>
    </div>
  );
}

function Container33() {
  return (
    <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff906d] text-[10px] w-[68.38px]">
        <p className="leading-[15px]">75% Capacity</p>
      </div>
    </div>
  );
}

function Container31() {
  return (
    <div className="content-stretch flex h-[15px] items-start justify-between relative shrink-0 w-full" data-name="Container">
      <Container32 />
      <Container33 />
    </div>
  );
}

function Background1() {
  return (
    <div className="bg-[#262626] relative rounded-[16px] shrink-0 w-full" data-name="Background">
      <div className="content-stretch flex flex-col gap-[8px] items-start p-[16px] relative w-full">
        <Container30 />
        <Background2 />
        <Container31 />
      </div>
    </div>
  );
}

function Margin() {
  return (
    <div className="flex-[1_0_0] min-h-[91px] min-w-px relative w-full" data-name="Margin">
      <div className="flex flex-col justify-end min-h-[inherit] size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-end min-h-[inherit] pt-[286px] relative size-full">
          <Background1 />
        </div>
      </div>
    </div>
  );
}

function AsideSidebarActivityPanel() {
  return (
    <div className="absolute backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] bottom-[32px] content-stretch flex flex-col gap-[24px] items-start p-[25px] right-[32px] rounded-[32px] top-[96px] w-[320px]" data-name="Aside - Sidebar Activity Panel">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.1)] border-solid inset-0 pointer-events-none rounded-[32px]" />
      <Heading1 />
      <Container17 />
      <Margin />
    </div>
  );
}

function Button3() {
  return (
    <div className="bg-[#262626] relative rounded-[12px] shrink-0" data-name="Button">
      <div aria-hidden="true" className="absolute border border-[rgba(255,144,109,0.2)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center px-[25px] py-[9px] relative">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff906d] text-[12px] text-center tracking-[1.2px] uppercase w-[91.41px]">
          <p className="leading-[16px]">Main Dining</p>
        </div>
      </div>
    </div>
  );
}

function Button4() {
  return (
    <div className="relative rounded-[12px] shrink-0" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center pb-[9.5px] pt-[8.5px] px-[24px] relative">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] text-center tracking-[1.2px] uppercase w-[70.31px]">
          <p className="leading-[16px]">Bar Area</p>
        </div>
      </div>
    </div>
  );
}

function Button5() {
  return (
    <div className="relative rounded-[12px] shrink-0" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center pb-[9.5px] pt-[8.5px] px-[24px] relative">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] text-center tracking-[1.2px] uppercase w-[41.3px]">
          <p className="leading-[16px]">Patio</p>
        </div>
      </div>
    </div>
  );
}

function Button6() {
  return (
    <div className="relative rounded-[12px] shrink-0" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center pb-[9.5px] pt-[8.5px] px-[24px] relative">
        <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] text-center tracking-[1.2px] uppercase w-[84.88px]">
          <p className="leading-[16px]">VIP Lounge</p>
        </div>
      </div>
    </div>
  );
}

function FloorNavigationOverlay() {
  return (
    <div className="absolute backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] bottom-[40px] content-stretch flex gap-[16px] items-start left-[28.6%] p-[9px] right-[28.6%] rounded-[16px]" data-name="Floor Navigation Overlay">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.1)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <Button3 />
      <Button4 />
      <Button5 />
      <Button6 />
    </div>
  );
}

function MainCanvas() {
  return (
    <div className="bg-[#0e0e0e] h-[1024px] relative shrink-0 w-full" data-name="Main Canvas">
      <div className="flex flex-col justify-center overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col items-start justify-center pl-[256px] pt-[64px] relative size-full">
          <Component3DTopDownFloorPlan />
          <div className="-translate-y-1/2 absolute flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[40px] justify-center leading-[0] left-[32px] right-[937.39px] text-[36px] text-white top-[52px]">
            <p className="leading-[40px]">Main Dining Room</p>
          </div>
          <BackgroundBorder1 />
          <BackgroundBorder2 />
          <BackgroundBorder3 />
          <Button />
          <Button1 />
          <Button2 />
          <AsideSidebarActivityPanel />
          <FloorNavigationOverlay />
        </div>
      </div>
    </div>
  );
}

function Heading() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Heading 1">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[24px] tracking-[-0.4px] uppercase w-full">
        <p className="leading-[32px]">Neon-Gastro</p>
      </div>
    </div>
  );
}

function Container35() {
  return (
    <div className="content-stretch flex flex-col items-start opacity-70 relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[12px] tracking-[-0.4px] w-full">
        <p className="leading-[16px]">Station 04 - Active</p>
      </div>
    </div>
  );
}

function Container34() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="content-stretch flex flex-col gap-[4px] items-start p-[24px] relative w-full">
        <Heading />
        <Container35 />
      </div>
    </div>
  );
}

function Container36() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p20793584} fill="var(--fill-0, #6B7280)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container37() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[79.83px]">
        <p className="leading-[24px]">Dashboard</p>
      </div>
    </div>
  );
}

function Link() {
  return (
    <div className="relative rounded-[8px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative w-full">
          <Container36 />
          <Container37 />
        </div>
      </div>
    </div>
  );
}

function Container38() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
        <g id="Container">
          <path d={svgPaths.p186f5ba0} fill="var(--fill-0, #FF906D)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container39() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[16px] tracking-[-0.4px] w-[46.97px]">
          <p className="leading-[24px]">Tables</p>
        </div>
      </div>
    </div>
  );
}

function LinkActiveStateLogicTables() {
  return (
    <div className="bg-[#262626] relative rounded-[8px] shrink-0 w-full" data-name="Link - Active State Logic: Tables">
      <div aria-hidden="true" className="absolute border-[#ff906d] border-l-4 border-solid inset-0 pointer-events-none rounded-[8px]" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center pl-[16px] pr-[12px] py-[12px] relative w-full">
          <Container38 />
          <Container39 />
        </div>
      </div>
    </div>
  );
}

function Container40() {
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

function Container41() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[70.02px]">
        <p className="leading-[24px]">Inventory</p>
      </div>
    </div>
  );
}

function Link1() {
  return (
    <div className="relative rounded-[8px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative w-full">
          <Container40 />
          <Container41 />
        </div>
      </div>
    </div>
  );
}

function Container42() {
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

function Container43() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[68.48px]">
        <p className="leading-[24px]">Analytics</p>
      </div>
    </div>
  );
}

function Link2() {
  return (
    <div className="relative rounded-[8px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative w-full">
          <Container42 />
          <Container43 />
        </div>
      </div>
    </div>
  );
}

function Container44() {
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

function Container45() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[60.7px]">
        <p className="leading-[24px]">Support</p>
      </div>
    </div>
  );
}

function Link3() {
  return (
    <div className="relative rounded-[8px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative w-full">
          <Container44 />
          <Container45 />
        </div>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Nav">
      <div className="content-stretch flex flex-col gap-[8px] items-start px-[16px] relative size-full">
        <Link />
        <LinkActiveStateLogicTables />
        <Link1 />
        <Link2 />
        <Link3 />
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

function Container46() {
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

function Container47() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[60.7px]">
        <p className="leading-[24px]">Settings</p>
      </div>
    </div>
  );
}

function Link4() {
  return (
    <div className="relative rounded-[8px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12px] items-center p-[12px] relative w-full">
          <Container46 />
          <Container47 />
        </div>
      </div>
    </div>
  );
}

function Container48() {
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

function Container49() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] relative shrink-0 text-[#6b7280] text-[16px] tracking-[-0.4px] w-[57.2px]">
        <p className="leading-[24px]">Log out</p>
      </div>
    </div>
  );
}

function Link5() {
  return (
    <div className="relative rounded-[8px] shrink-0 w-full" data-name="Link">
      <div className="flex flex-row items-center size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12px] items-center p-[12px] relative w-full">
          <Container48 />
          <Container49 />
        </div>
      </div>
    </div>
  );
}

function HorizontalBorder() {
  return (
    <div className="relative shrink-0 w-full" data-name="HorizontalBorder">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.2)] border-solid border-t inset-0 pointer-events-none" />
      <div className="content-stretch flex flex-col items-start pb-[16px] pt-[17px] px-[16px] relative w-full">
        <Link4 />
        <Link5 />
      </div>
    </div>
  );
}

function AsideSideNavBarShell() {
  return (
    <div className="absolute bg-[#131313] content-stretch flex flex-col h-[1024px] items-start left-0 top-0 w-[256px]" data-name="Aside - SideNavBar Shell">
      <Container34 />
      <NavMargin />
      <HorizontalBorder />
    </div>
  );
}

function Container51() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[18px] w-[131.36px]">
        <p className="leading-[28px]">CyberBistro OS</p>
      </div>
    </div>
  );
}

function Container52() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[20px] justify-center leading-[0] relative shrink-0 text-[#adaaaa] text-[14px] uppercase w-[140.03px]">
        <p className="leading-[20px]">Floor Management</p>
      </div>
    </div>
  );
}

function Container50() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[16px] items-center relative">
        <Container51 />
        <div className="bg-[rgba(72,72,71,0.3)] h-[16px] shrink-0 w-px" data-name="Vertical Divider" />
        <Container52 />
      </div>
    </div>
  );
}

function Container55() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-h-px min-w-px overflow-clip relative" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#6b7280] text-[12px] w-full">
        <p className="leading-[normal]">Search tables or guests...</p>
      </div>
    </div>
  );
}

function Input() {
  return (
    <div className="bg-[#131313] content-stretch flex items-start justify-center overflow-clip pb-[7px] pt-[6px] px-[16px] relative rounded-[9999px] shrink-0 w-[256px]" data-name="Input">
      <Container55 />
    </div>
  );
}

function Container54() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <Input />
      <div className="absolute right-[13.76px] size-[10.5px] top-[10.75px]" data-name="Icon">
        <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 10.5 10.5">
          <path d={svgPaths.p210dd580} fill="var(--fill-0, #ADAAAA)" id="Icon" />
        </svg>
      </div>
    </div>
  );
}

function Container57() {
  return (
    <div className="h-[21px] relative shrink-0 w-[18px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 21">
        <g id="Container">
          <path d={svgPaths.pe40b59c} fill="var(--fill-0, #FF906D)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container58() {
  return (
    <div className="h-[14.15px] relative shrink-0 w-[20px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 14.15">
        <g id="Container">
          <path d={svgPaths.p793b600} fill="var(--fill-0, #FF906D)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container59() {
  return (
    <div className="h-[20px] relative shrink-0 w-[16px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 20">
        <g id="Container">
          <path d={svgPaths.p164b49c0} fill="var(--fill-0, #FF906D)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container56() {
  return (
    <div className="content-stretch flex gap-[16px] items-center relative shrink-0" data-name="Container">
      <Container57 />
      <Container58 />
      <Container59 />
    </div>
  );
}

function Manager() {
  return (
    <div className="pointer-events-none relative rounded-[9999px] shrink-0 size-[32px]" data-name="Manager">
      <div className="absolute inset-0 overflow-hidden rounded-[9999px]">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgManager} />
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(255,144,109,0.3)] border-solid inset-0 rounded-[9999px]" />
    </div>
  );
}

function Container53() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[24px] items-center relative">
        <Container54 />
        <Container56 />
        <Manager />
      </div>
    </div>
  );
}

function HeaderTopAppBarShell() {
  return (
    <div className="absolute backdrop-blur-[6px] bg-[rgba(14,14,14,0.6)] content-stretch flex h-[64px] items-center justify-between left-[256px] pb-px px-[32px] right-0 top-0" data-name="Header - TopAppBar Shell">
      <div aria-hidden="true" className="absolute border-[rgba(72,72,71,0.2)] border-b border-solid inset-0 pointer-events-none shadow-[0px_4px_24px_0px_rgba(255,144,109,0.08)]" />
      <Container50 />
      <Container53 />
    </div>
  );
}

export default function GestionDeMesas() {
  return (
    <div className="bg-[#0e0e0e] content-stretch flex flex-col items-start relative size-full" data-name="Gestión de Mesas">
      <MainCanvas />
      <div className="absolute h-[1024px] left-0 opacity-20 top-0 w-[1280px]" data-name="Global Decoration" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg viewBox=\\'0 0 1280 1024\\' xmlns=\\'http://www.w3.org/2000/svg\\' preserveAspectRatio=\\'none\\'><rect x=\\'0\\' y=\\'0\\' height=\\'100%\\' width=\\'100%\\' fill=\\'url(%23grad)\\' opacity=\\'1\\'/><defs><radialGradient id=\\'grad\\' gradientUnits=\\'userSpaceOnUse\\' cx=\\'0\\' cy=\\'0\\' r=\\'10\\' gradientTransform=\\'matrix(81.96 0 0 81.96 640 512)\\'><stop stop-color=\\'rgba(255,144,109,0.1)\\' offset=\\'0\\'/><stop stop-color=\\'rgba(255,144,109,0)\\' offset=\\'0.7\\'/></radialGradient></defs></svg>')" }} />
      <AsideSideNavBarShell />
      <HeaderTopAppBarShell />
    </div>
  );
}