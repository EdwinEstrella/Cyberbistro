import svgPaths from "./svg-h2gjocs89h";
import imgLoginRegistro from "figma:asset/47f7239cc7433af3270415eeec94f9bdbb11cd99.png";
import imgDecorativeScanlineEffect from "figma:asset/70a05c412757c6d4e1cffbb0780858880dce7a5a.png";

function Container() {
  return <div className="h-[300px] opacity-2 w-[514.025px]" data-name="Container" />;
}

function BackgroundDecoration() {
  return (
    <div className="absolute h-[1024px] left-0 overflow-clip top-0 w-[1280px]" data-name="Background Decoration">
      <div className="absolute flex h-[400.316px] items-center justify-center right-[38.42px] top-[52.23px] w-[565.166px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "0" } as React.CSSProperties}>
        <div className="flex-none rotate-12">
          <Container />
        </div>
      </div>
    </div>
  );
}

function Container1() {
  return (
    <div className="h-[30px] relative shrink-0 w-[22.5px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 22.5 30">
        <g id="Container">
          <path d={svgPaths.p280a6f80} fill="var(--fill-0, #FF906D)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function BackgroundBorder() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center px-px py-[12px] relative rounded-[12px] shrink-0 w-[64px]" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <Container1 />
    </div>
  );
}

function Heading() {
  return (
    <div className="content-stretch flex flex-col items-center pt-[16px] relative shrink-0 w-full" data-name="Heading 1">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[40px] justify-center leading-[0] relative shrink-0 text-[#ff906d] text-[36px] text-center tracking-[-1.8px] uppercase w-[214.5px]">
        <p className="leading-[40px]">Cloudix</p>
      </div>
    </div>
  );
}

function Container2() {
  return (
    <div className="content-stretch flex flex-col items-center relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] text-center tracking-[1.2px] uppercase w-[291.08px]">
        <p className="leading-[16px]">Gastronomy Operating System · {__APP_VERSION__}</p>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="relative shrink-0 w-full" data-name="Header">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[8px] items-center relative w-full">
        <BackgroundBorder />
        <Heading />
        <Container2 />
      </div>
    </div>
  );
}

function Container4() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-clip relative rounded-[inherit] w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[16px] text-[rgba(72,72,71,0.5)] w-full">
          <p className="leading-[normal]">STATION_04_MNGR</p>
        </div>
      </div>
    </div>
  );
}

function Input() {
  return (
    <div className="bg-[#131313] relative shrink-0 w-full" data-name="Input">
      <div className="flex flex-row justify-center overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex items-start justify-center pb-[19px] pl-[48px] pr-[16px] pt-[18px] relative w-full">
          <Container4 />
        </div>
      </div>
      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
    </div>
  );
}

function Container3() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-0 right-0 top-[23px]" data-name="Container">
      <Input />
      <div className="absolute bottom-[35.4%] left-[18.52px] top-[35.42%] w-[15.041px]" data-name="Icon">
        <div className="absolute inset-[0_0_-1.79%_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15.0408 16.6369">
            <path d={svgPaths.p2b44ee60} fill="var(--fill-0, #484847)" id="Icon" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function IdInput() {
  return (
    <div className="h-[80px] relative shrink-0 w-full" data-name="ID Input">
      <div className="-translate-y-1/2 absolute flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] left-[4px] text-[#ff7346] text-[10px] top-[7.5px] tracking-[1px] uppercase w-[71.89px]">
        <p className="leading-[15px]">Operator ID</p>
      </div>
      <Container3 />
    </div>
  );
}

function Container6() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-clip relative rounded-[inherit] w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[16px] text-[rgba(72,72,71,0.5)] w-full">
          <p className="leading-[normal]">••••••••••••</p>
        </div>
      </div>
    </div>
  );
}

function Input1() {
  return (
    <div className="bg-[#131313] relative shrink-0 w-full" data-name="Input">
      <div className="flex flex-row justify-center overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex items-start justify-center pb-[19px] pl-[48px] pr-[16px] pt-[18px] relative w-full">
          <Container6 />
        </div>
      </div>
      <div aria-hidden="true" className="absolute border-[#484847] border-b border-solid inset-0 pointer-events-none" />
    </div>
  );
}

function Container5() {
  return (
    <div className="absolute content-stretch flex flex-col items-start left-0 right-0 top-[23px]" data-name="Container">
      <Input1 />
      <div className="absolute bottom-[41.23%] left-[16.83px] top-[41.23%] w-[19.167px]" data-name="Icon">
        <div className="absolute inset-[0_0_-1.79%_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.1667 10">
            <path d={svgPaths.p22917200} fill="var(--fill-0, #484847)" id="Icon" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function PasswordInput() {
  return (
    <div className="h-[88px] relative shrink-0 w-full" data-name="Password Input">
      <div className="-translate-y-1/2 absolute flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[15px] justify-center leading-[0] left-[4px] text-[#ff7346] text-[10px] top-[7.5px] tracking-[1px] uppercase w-[85.91px]">
        <p className="leading-[15px]">Access Cipher</p>
      </div>
      <Container5 />
    </div>
  );
}

function Container8() {
  return (
    <div className="h-[16px] relative shrink-0 w-[20px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 16">
        <g id="Container">
          <path d={svgPaths.p3b4abf00} fill="var(--fill-0, #FF6AA0)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container9() {
  return (
    <div className="content-stretch flex flex-col items-center relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[20px] justify-center leading-[0] relative shrink-0 text-[14px] text-center text-white tracking-[-0.35px] uppercase w-[106.42px]">
        <p className="leading-[20px]">Biometric Scan</p>
      </div>
    </div>
  );
}

function Container7() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12px] items-center relative">
        <Container8 />
        <Container9 />
      </div>
    </div>
  );
}

function Container10() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[4px] items-start relative">
        <div className="bg-[rgba(255,106,160,0.4)] h-[12px] rounded-[9999px] shrink-0 w-[4px]" data-name="Overlay" />
        <div className="bg-[#ff6aa0] h-[12px] rounded-[9999px] shrink-0 w-[4px]" data-name="Background" />
        <div className="bg-[rgba(255,106,160,0.4)] h-[12px] rounded-[9999px] shrink-0 w-[4px]" data-name="Overlay" />
      </div>
    </div>
  );
}

function BiometricActionButton() {
  return (
    <div className="bg-[#262626] relative rounded-[12px] shrink-0 w-full" data-name="Biometric Action → Button">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between px-[25px] py-[17px] relative w-full">
          <Container7 />
          <Container10 />
        </div>
      </div>
    </div>
  );
}

function ButtonMainCta() {
  return (
    <div className="content-stretch flex items-center justify-center py-[16px] relative rounded-[12px] shadow-[0px_0px_20px_0px_rgba(255,144,109,0.4)] shrink-0 w-full" data-name="Button - Main CTA" style={{ backgroundImage: "linear-gradient(172.248deg, rgb(255, 144, 109) 0%, rgb(255, 120, 77) 100%)" }}>
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[20px] justify-center leading-[0] relative shrink-0 text-[14px] text-black text-center tracking-[1.4px] uppercase w-[149.19px]">
        <p className="leading-[20px]">Initialize Session</p>
      </div>
    </div>
  );
}

function Form() {
  return (
    <div className="relative shrink-0 w-full" data-name="Form">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[24px] items-start relative w-full">
        <IdInput />
        <PasswordInput />
        <BiometricActionButton />
        <ButtonMainCta />
      </div>
    </div>
  );
}

function Container11() {
  return (
    <div className="relative shrink-0 size-[9.333px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 9.33333 9.33333">
        <g id="Container">
          <path d={svgPaths.pce77c00} fill="var(--fill-0, #FF6AA0)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Link() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-name="Link">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] relative shrink-0 text-[#ff6aa0] text-[12px] tracking-[1.2px] uppercase w-[131.86px]">
        <p className="leading-[16px]">Register New Unit</p>
      </div>
      <Container11 />
    </div>
  );
}

function Container14() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] uppercase w-[69.92px]">
        <p className="leading-[15px]">Core Secure</p>
      </div>
    </div>
  );
}

function Container13() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-name="Container">
      <div className="bg-[#59ee50] rounded-[9999px] shadow-[0px_0px_8px_0px_#59ee50] shrink-0 size-[8px]" data-name="Background+Shadow" />
      <Container14 />
    </div>
  );
}

function Container16() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[15px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] uppercase w-[81.88px]">
        <p className="leading-[15px]">Station Active</p>
      </div>
    </div>
  );
}

function Container15() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-name="Container">
      <div className="bg-[#ff906d] rounded-[9999px] shadow-[0px_0px_8px_0px_#ff906d] shrink-0 size-[8px]" data-name="Background+Shadow" />
      <Container16 />
    </div>
  );
}

function Container12() {
  return (
    <div className="content-stretch flex gap-[24.01px] items-center relative shrink-0" data-name="Container">
      <Container13 />
      <Container15 />
    </div>
  );
}

function Margin() {
  return (
    <div className="content-stretch flex flex-col items-start pt-[16px] relative shrink-0" data-name="Margin">
      <Container12 />
    </div>
  );
}

function Footer() {
  return (
    <div className="relative shrink-0 w-full" data-name="Footer">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-center relative w-full">
        <Link />
        <Margin />
      </div>
    </div>
  );
}

function OverlayBorderShadowOverlayBlur() {
  return (
    <div className="backdrop-blur-[8px] bg-[rgba(38,38,38,0.6)] relative rounded-[12px] shrink-0 w-full" data-name="Overlay+Border+Shadow+OverlayBlur">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[40px] items-start p-[49px] relative w-full">
          <div className="absolute inset-px opacity-3" data-name="Decorative scanline effect">
            <img alt="" className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 max-w-none object-cover pointer-events-none size-full" src={imgDecorativeScanlineEffect} />
          </div>
          <Header />
          <Form />
          <Footer />
        </div>
      </div>
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[12px] shadow-[0px_0px_40px_-10px_rgba(255,144,109,0.3)]" />
    </div>
  );
}

function Container17() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[-0.5px] uppercase w-full">
          <p className="leading-[15px]">Local Latency</p>
        </div>
      </div>
    </div>
  );
}

function Paragraph() {
  return (
    <div className="h-[28px] relative shrink-0 w-full" data-name="Paragraph">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid font-['Space_Grotesk:Bold',sans-serif] font-bold leading-[0] relative size-full text-[#ff906d]">
        <div className="-translate-y-1/2 absolute flex flex-col h-[28px] justify-center left-0 text-[20px] top-[14px] w-[44.13px]">
          <p className="leading-[28px]">0.04</p>
        </div>
        <div className="-translate-y-1/2 absolute flex flex-col h-[16px] justify-center left-[48.13px] text-[12px] top-[17px] w-[16.55px]">
          <p className="leading-[16px]">ms</p>
        </div>
      </div>
    </div>
  );
}

function OverlayBorderOverlayBlur() {
  return (
    <div className="backdrop-blur-[8px] bg-[rgba(38,38,38,0.6)] col-1 justify-self-stretch relative rounded-[12px] row-1 self-start shrink-0" data-name="Overlay+Border+OverlayBlur">
      <div aria-hidden="true" className="absolute border-[rgba(255,144,109,0.4)] border-b border-l-2 border-r border-solid border-t inset-0 pointer-events-none rounded-[12px]" />
      <div className="content-stretch flex flex-col gap-[4px] items-start pl-[18px] pr-[17px] py-[17px] relative w-full">
        <Container17 />
        <Paragraph />
      </div>
    </div>
  );
}

function Container18() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[-0.5px] uppercase w-full">
          <p className="leading-[15px]">Grid Status</p>
        </div>
      </div>
    </div>
  );
}

function Container19() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold justify-center leading-[0] relative shrink-0 text-[#ff6aa0] text-[20px] uppercase w-full">
          <p className="leading-[28px]">Optimal</p>
        </div>
      </div>
    </div>
  );
}

function OverlayBorderOverlayBlur1() {
  return (
    <div className="backdrop-blur-[8px] bg-[rgba(38,38,38,0.6)] col-2 justify-self-stretch relative rounded-[12px] row-1 self-start shrink-0" data-name="Overlay+Border+OverlayBlur">
      <div aria-hidden="true" className="absolute border-[rgba(255,106,160,0.4)] border-b border-l-2 border-r border-solid border-t inset-0 pointer-events-none rounded-[12px]" />
      <div className="content-stretch flex flex-col gap-[4px] items-start pl-[18px] pr-[17px] py-[17px] relative w-full">
        <Container18 />
        <Container19 />
      </div>
    </div>
  );
}

function SystemMetadataTagsBentoLiteApproach() {
  return (
    <div className="gap-x-[16px] gap-y-[16px] grid grid-cols-[repeat(2,minmax(0,1fr))] grid-rows-[_81px] relative shrink-0 w-full" data-name="System Metadata Tags (Bento-lite approach)">
      <OverlayBorderOverlayBlur />
      <OverlayBorderOverlayBlur1 />
    </div>
  );
}

function MainAuthShellSuppressedPerInstructionsForTransactionalPages() {
  return (
    <div className="content-stretch flex flex-col gap-[24px] items-start max-w-[480px] relative shrink-0 w-[480px]" data-name="Main - Auth Shell suppressed per instructions for transactional pages">
      <div className="absolute bg-[rgba(255,144,109,0.1)] blur-[50px] left-[-96px] rounded-[9999px] size-[256px] top-[-96px]" data-name="Ambient Glow Elements" />
      <OverlayBorderShadowOverlayBlur />
      <div className="absolute bg-[rgba(255,106,160,0.1)] blur-[50px] bottom-[-96px] right-[-96px] rounded-[9999px] size-[256px]" data-name="Overlay+Blur" />
      <SystemMetadataTagsBentoLiteApproach />
    </div>
  );
}

export default function LoginRegistro() {
  return (
    <div className="content-stretch flex items-center justify-center px-[24px] py-[86px] relative size-full" data-name="Login & Registro">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className="absolute bg-[#0e0e0e] inset-0" />
        <div className="absolute inset-0 overflow-hidden">
          <img alt="" className="absolute h-[125%] left-0 max-w-none top-[-12.5%] w-full" src={imgLoginRegistro} />
        </div>
        <div className="absolute bg-[rgba(14,14,14,0.9)] inset-0" />
      </div>
      <BackgroundDecoration />
      <MainAuthShellSuppressedPerInstructionsForTransactionalPages />
    </div>
  );
}