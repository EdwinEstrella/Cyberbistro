import svgPaths from "./svg-2fgf4mgp0x";

function Container() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase w-full">
        <p className="leading-[16px]">Total Revenue (24h)</p>
      </div>
    </div>
  );
}

function Heading() {
  return (
    <div className="font-['Space_Grotesk:Bold',sans-serif] font-bold h-[48px] leading-[0] relative shrink-0 tracking-[-1.2px] w-full" data-name="Heading 2">
      <div className="-translate-y-1/2 absolute flex flex-col h-[48px] justify-center left-0 text-[48px] text-white top-[23.5px] w-[174.88px]">
        <p className="leading-[48px]">$14,284</p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col h-[32px] justify-center left-[174.88px] text-[#ff906d] text-[24px] top-[31.5px] w-[33.52px]">
        <p className="leading-[32px]">.50</p>
      </div>
    </div>
  );
}

function Container2() {
  return (
    <div className="h-[7px] relative shrink-0 w-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 7">
        <g id="Container">
          <path d={svgPaths.pde19380} fill="var(--fill-0, #59EE50)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container3() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[#59ee50] text-[14px] w-[140.17px]">
        <p className="leading-[20px]">+12.4% vs yesterday</p>
      </div>
    </div>
  );
}

function Container1() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Container">
      <Container2 />
      <Container3 />
    </div>
  );
}

function Background() {
  return (
    <div className="bg-[#201f1f] col-1 justify-self-stretch relative rounded-[24px] row-1 self-start shrink-0" data-name="Background">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[16px] items-start pb-[54px] pt-[24px] px-[24px] relative w-full">
          <Container />
          <Heading />
          <Container1 />
          <div className="absolute bg-[rgba(255,144,109,0.05)] blur-[32px] right-[-16px] rounded-[9999px] size-[96px] top-[-16px]" data-name="Overlay+Blur" />
        </div>
      </div>
    </div>
  );
}

function Container4() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase w-full">
        <p className="leading-[16px]">Average Ticket</p>
      </div>
    </div>
  );
}

function Heading1() {
  return (
    <div className="content-stretch flex font-['Space_Grotesk:Bold',sans-serif] font-bold items-end leading-[0] relative shrink-0 tracking-[-1.2px] w-full" data-name="Heading 2">
      <div className="flex flex-col h-[48px] justify-center relative shrink-0 text-[48px] text-white w-[84.83px]">
        <p className="leading-[48px]">$84</p>
      </div>
      <div className="flex flex-col h-[32px] justify-center relative shrink-0 text-[#adaaaa] text-[24px] w-[33.38px]">
        <p className="leading-[32px]">.20</p>
      </div>
    </div>
  );
}

function Container6() {
  return (
    <div className="h-[1.167px] relative shrink-0 w-[9.333px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 9.33333 1.16667">
        <g id="Container">
          <path d={svgPaths.p320f7600} fill="var(--fill-0, white)" fillOpacity="0.4" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container7() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-[rgba(255,255,255,0.4)] w-[124.38px]">
        <p className="leading-[20px]">Consistent volume</p>
      </div>
    </div>
  );
}

function Container5() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Container">
      <Container6 />
      <Container7 />
    </div>
  );
}

function Background1() {
  return (
    <div className="bg-[#201f1f] col-2 justify-self-stretch relative rounded-[24px] row-1 self-start shrink-0" data-name="Background">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[16px] items-start pb-[54px] pt-[24px] px-[24px] relative w-full">
          <Container4 />
          <Heading1 />
          <Container5 />
        </div>
      </div>
    </div>
  );
}

function Container8() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] tracking-[-0.6px] uppercase w-full">
        <p className="leading-[16px]">Pending Invoices</p>
      </div>
    </div>
  );
}

function Heading2() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Heading 2">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold justify-center leading-[0] relative shrink-0 text-[#ff6aa0] text-[48px] tracking-[-1.2px] w-full">
        <p className="leading-[48px]">12</p>
      </div>
    </div>
  );
}

function Container10() {
  return (
    <div className="relative shrink-0 size-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 11.6667">
        <g id="Container">
          <path d={svgPaths.p29478120} fill="var(--fill-0, #FF6AA0)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container11() {
  return (
    <div className="content-stretch flex flex-col items-start pr-[53.83px] relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[40px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff6aa0] text-[14px] w-[98.15px]">
        <p className="leading-[20px] mb-0">$1,420 waiting</p>
        <p className="leading-[20px]">clearance</p>
      </div>
    </div>
  );
}

function Container9() {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-name="Container">
      <Container10 />
      <Container11 />
    </div>
  );
}

function Background2() {
  return (
    <div className="bg-[#201f1f] col-3 justify-self-stretch relative rounded-[24px] row-1 self-start shrink-0" data-name="Background">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col gap-[16px] items-start pb-[34px] pt-[24px] px-[24px] relative w-full">
          <Container8 />
          <Heading2 />
          <Container9 />
        </div>
      </div>
    </div>
  );
}

function LargeStats() {
  return (
    <div className="col-[1/span_3] gap-x-[24px] gap-y-[24px] grid grid-cols-[repeat(3,minmax(0,1fr))] grid-rows-[_194px] justify-self-stretch relative row-1 self-start shrink-0" data-name="Large Stats">
      <Background />
      <Background1 />
      <Background2 />
    </div>
  );
}

function Paragraph() {
  return (
    <div className="relative shrink-0 w-full" data-name="Paragraph">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start justify-between relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] tracking-[1.2px] uppercase w-[68.81px]">
          <p className="leading-[16px]">7d Trend</p>
        </div>
        <div className="relative shrink-0 size-[18px]" data-name="Icon">
          <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
            <path d={svgPaths.p4c2b800} fill="var(--fill-0, #FF906D)" id="Icon" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Container12() {
  return (
    <div className="content-stretch flex gap-[6px] h-[96px] items-end justify-center relative shrink-0 w-full" data-name="Container">
      <div className="bg-[rgba(255,144,109,0.2)] flex-[1_0_0] h-[38.39px] min-h-px min-w-px rounded-tl-[2px] rounded-tr-[2px]" data-name="Overlay" />
      <div className="bg-[rgba(255,144,109,0.3)] flex-[1_0_0] h-[57.59px] min-h-px min-w-px rounded-tl-[2px] rounded-tr-[2px]" data-name="Overlay" />
      <div className="bg-[rgba(255,144,109,0.4)] flex-[1_0_0] h-[52.8px] min-h-px min-w-px rounded-tl-[2px] rounded-tr-[2px]" data-name="Overlay" />
      <div className="bg-[rgba(255,144,109,0.6)] flex-[1_0_0] h-[76.8px] min-h-px min-w-px rounded-tl-[2px] rounded-tr-[2px]" data-name="Overlay" />
      <div className="bg-[rgba(255,144,109,0.5)] flex-[1_0_0] h-[62.39px] min-h-px min-w-px rounded-tl-[2px] rounded-tr-[2px]" data-name="Overlay" />
      <div className="bg-[rgba(255,144,109,0.8)] flex-[1_0_0] h-[86.39px] min-h-px min-w-px rounded-tl-[2px] rounded-tr-[2px]" data-name="Overlay" />
      <div className="bg-[#ff906d] flex-[1_0_0] h-full min-h-px min-w-px rounded-tl-[2px] rounded-tr-[2px] shadow-[0px_-4px_10px_0px_rgba(255,144,109,0.3)]" data-name="Background+Shadow" />
    </div>
  );
}

function Margin() {
  return (
    <div className="h-[104px] relative shrink-0 w-full" data-name="Margin">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pb-[8px] relative size-full">
        <Container12 />
      </div>
    </div>
  );
}

function Container13() {
  return (
    <div className="relative shrink-0 w-full" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] text-center w-[160.8px]">
          <p className="leading-[16px]">Week-on-week growth peak</p>
        </div>
      </div>
    </div>
  );
}

function MiniTrendChartPlaceholder() {
  return (
    <div className="bg-[#131313] col-4 justify-self-stretch relative rounded-[24px] row-1 self-start shrink-0" data-name="Mini Trend Chart Placeholder">
      <div aria-hidden="true" className="absolute border border-[rgba(255,144,109,0.05)] border-solid inset-0 pointer-events-none rounded-[24px]" />
      <div className="content-stretch flex flex-col items-start justify-between p-[25px] relative w-full">
        <Paragraph />
        <Margin />
        <Container13 />
      </div>
    </div>
  );
}

function SectionHeroStatsBento() {
  return (
    <div className="gap-x-[24px] gap-y-[24px] grid grid-cols-[repeat(4,minmax(0,1fr))] grid-rows-[_194px] relative shrink-0 w-full" data-name="Section - Hero Stats Bento">
      <LargeStats />
      <MiniTrendChartPlaceholder />
    </div>
  );
}

function Margin1() {
  return (
    <div className="h-[10px] relative shrink-0 w-[17px]" data-name="Margin">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17 10">
        <g id="Margin">
          <path d={svgPaths.p2eec2540} fill="var(--fill-0, #ADAAAA)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Svg() {
  return (
    <div className="relative shrink-0 size-[21px]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 21 21">
        <g id="SVG">
          <path d="M6.3 8.4L10.5 12.6L14.7 8.4" id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.575" />
        </g>
      </svg>
    </div>
  );
}

function ImageFill() {
  return (
    <div className="absolute content-stretch flex flex-col h-[36px] items-start justify-center left-0 overflow-clip pl-[112px] pr-[8px] py-[7.5px] top-0 w-[141px]" data-name="image fill">
      <Svg />
    </div>
  );
}

function Container15() {
  return (
    <div className="-translate-y-1/2 absolute content-stretch flex flex-col items-start left-[12px] overflow-clip pr-[10.87px] top-1/2" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-[86.13px]">
        <p className="leading-[20px]">Last 30 Days</p>
      </div>
    </div>
  );
}

function Options() {
  return (
    <div className="h-[36px] relative shrink-0 w-[141px]" data-name="Options">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <ImageFill />
        <Container15 />
      </div>
    </div>
  );
}

function BackgroundBorder() {
  return (
    <div className="bg-black content-stretch flex items-center px-[17px] py-[9px] relative rounded-[12px] shrink-0" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <Margin1 />
      <Options />
    </div>
  );
}

function Margin2() {
  return (
    <div className="h-[8px] mr-[-0.01px] relative shrink-0 w-[16.021px]" data-name="Margin">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16.0206 8">
        <g id="Margin">
          <path d={svgPaths.p1bdc3fa0} fill="var(--fill-0, #ADAAAA)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Svg1() {
  return (
    <div className="relative shrink-0 size-[21px]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 21 21">
        <g id="SVG">
          <path d="M6.3 8.4L10.5 12.6L14.7 8.4" id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.575" />
        </g>
      </svg>
    </div>
  );
}

function ImageFill1() {
  return (
    <div className="absolute content-stretch flex flex-col h-[36px] items-start justify-center left-0 overflow-clip pl-[93px] pr-[8px] py-[7.5px] top-0 w-[122px]" data-name="image fill">
      <Svg1 />
    </div>
  );
}

function Container16() {
  return (
    <div className="-translate-y-1/2 absolute content-stretch flex flex-col items-start left-[12px] overflow-clip top-1/2" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-[77.67px]">
        <p className="leading-[20px]">All Statuses</p>
      </div>
    </div>
  );
}

function Options1() {
  return (
    <div className="h-[36px] mr-[-0.01px] relative shrink-0 w-[122px]" data-name="Options">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <ImageFill1 />
        <Container16 />
      </div>
    </div>
  );
}

function BackgroundBorder1() {
  return (
    <div className="bg-black content-stretch flex items-center pl-[17px] pr-[17.01px] py-[9px] relative rounded-[12px] shrink-0" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <Margin2 />
      <Options1 />
    </div>
  );
}

function Margin3() {
  return (
    <div className="h-[8px] relative shrink-0 w-[19px]" data-name="Margin">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19 8">
        <g id="Margin">
          <path d={svgPaths.p34cb4a00} fill="var(--fill-0, #ADAAAA)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Svg2() {
  return (
    <div className="relative shrink-0 size-[21px]" data-name="SVG">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 21 21">
        <g id="SVG">
          <path d="M6.3 8.4L10.5 12.6L14.7 8.4" id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.575" />
        </g>
      </svg>
    </div>
  );
}

function ImageFill2() {
  return (
    <div className="absolute content-stretch flex flex-col h-[36px] items-start justify-center left-0 overflow-clip pl-[101px] pr-[8px] py-[7.5px] top-0 w-[130px]" data-name="image fill">
      <Svg2 />
    </div>
  );
}

function Container17() {
  return (
    <div className="-translate-y-1/2 absolute content-stretch flex flex-col items-start left-[12px] overflow-clip pr-[7.59px] top-1/2" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[20px] justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-[78.41px]">
        <p className="leading-[20px]">All Methods</p>
      </div>
    </div>
  );
}

function Options2() {
  return (
    <div className="h-[36px] relative shrink-0 w-[130px]" data-name="Options">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <ImageFill2 />
        <Container17 />
      </div>
    </div>
  );
}

function BackgroundBorder2() {
  return (
    <div className="bg-black content-stretch flex items-center px-[17px] py-[9px] relative rounded-[12px] shrink-0" data-name="Background+Border">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.3)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <Margin3 />
      <Options2 />
    </div>
  );
}

function Container14() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[16px] items-center relative">
        <BackgroundBorder />
        <BackgroundBorder1 />
        <BackgroundBorder2 />
      </div>
    </div>
  );
}

function Container18() {
  return (
    <div className="relative shrink-0 size-[9.333px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 9.33333 9.33333">
        <g id="Container">
          <path d={svgPaths.p21f4d300} fill="var(--fill-0, white)" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button() {
  return (
    <div className="bg-[#262626] relative rounded-[12px] shrink-0" data-name="Button">
      <div aria-hidden="true" className="absolute border border-[rgba(72,72,71,0.2)] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center px-[25px] py-[9px] relative">
        <Container18 />
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] not-italic relative shrink-0 text-[16px] text-center text-white w-[86.75px]">
          <p className="leading-[24px]">Export CSV</p>
        </div>
      </div>
    </div>
  );
}

function SectionFiltersBar() {
  return (
    <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.6)] relative rounded-[16px] shrink-0 w-full" data-name="Section - Filters Bar">
      <div aria-hidden="true" className="absolute border border-[rgba(255,255,255,0.05)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between p-[17px] relative w-full">
          <Container14 />
          <Button />
        </div>
      </div>
    </div>
  );
}

function Cell() {
  return (
    <div className="content-stretch flex flex-col items-start px-[32px] py-[20px] relative shrink-0 w-[120.06px]" data-name="Cell">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[2px] uppercase w-[55.48px]">
        <p className="leading-[normal] mb-0">Invoice</p>
        <p className="leading-[normal]">ID</p>
      </div>
    </div>
  );
}

function Cell1() {
  return (
    <div className="content-stretch flex flex-col items-start px-[24px] py-[26px] relative shrink-0 w-[126.61px]" data-name="Cell">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[2px] uppercase w-[78.41px]">
        <p className="leading-[normal]">Timestamp</p>
      </div>
    </div>
  );
}

function Cell2() {
  return (
    <div className="content-stretch flex flex-col items-start px-[24px] py-[20px] relative shrink-0 w-[148.33px]" data-name="Cell">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[24px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[2px] uppercase w-[83.47px]">
        <p className="leading-[normal] mb-0">Customer /</p>
        <p className="leading-[normal]">Table</p>
      </div>
    </div>
  );
}

function Cell3() {
  return (
    <div className="content-stretch flex flex-col items-start px-[24px] py-[26px] relative shrink-0 w-[113.52px]" data-name="Cell">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[2px] uppercase w-[56.47px]">
        <p className="leading-[normal]">Method</p>
      </div>
    </div>
  );
}

function Cell4() {
  return (
    <div className="content-stretch flex flex-col items-start px-[24px] py-[26px] relative shrink-0 w-[141.98px]" data-name="Cell">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] tracking-[2px] uppercase w-[51.39px]">
        <p className="leading-[normal]">Status</p>
      </div>
    </div>
  );
}

function Cell5() {
  return (
    <div className="content-stretch flex flex-col items-end px-[24px] py-[26px] relative shrink-0 w-[133.47px]" data-name="Cell">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] text-right tracking-[2px] uppercase w-[58.11px]">
        <p className="leading-[normal]">Amount</p>
      </div>
    </div>
  );
}

function Cell6() {
  return (
    <div className="content-stretch flex flex-col items-end px-[32px] py-[26px] relative shrink-0 w-[176.03px]" data-name="Cell">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] text-right tracking-[2px] uppercase w-[59.81px]">
        <p className="leading-[normal]">Actions</p>
      </div>
    </div>
  );
}

function HeaderRow() {
  return (
    <div className="bg-[rgba(32,31,31,0.5)] content-stretch flex items-start justify-center relative shrink-0 w-full" data-name="Header → Row">
      <Cell />
      <Cell1 />
      <Cell2 />
      <Cell3 />
      <Cell4 />
      <Cell5 />
      <Cell6 />
    </div>
  );
}

function Data() {
  return (
    <div className="content-stretch flex flex-col items-start pb-[45.5px] pt-[45px] px-[32px] relative shrink-0 w-[120.06px]" data-name="Data">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[42px] justify-center leading-[0] relative shrink-0 text-[16px] text-white w-[38.03px]">
        <p className="leading-[normal] mb-0">#CB-</p>
        <p className="leading-[normal]">9421</p>
      </div>
    </div>
  );
}

function Container19() {
  return (
    <div className="content-stretch flex flex-col items-start opacity-50 relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] w-full">
        <p className="leading-[16px]">14:22 PM</p>
      </div>
    </div>
  );
}

function Data1() {
  return (
    <div className="content-stretch flex flex-col gap-[0.5px] items-start pb-[38.5px] pt-[37.5px] px-[24px] relative shrink-0 w-[126.61px]" data-name="Data">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[40px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[14px] w-[48.16px]">
        <p className="leading-[20px] mb-0">Oct 24,</p>
        <p className="leading-[20px]">2023</p>
      </div>
      <Container19 />
    </div>
  );
}

function Overlay() {
  return (
    <div className="bg-[rgba(255,106,160,0.1)] content-stretch flex h-[32px] items-center justify-center pb-[8.5px] pt-[7.5px] relative rounded-[8px] shrink-0 w-[15.59px]" data-name="Overlay">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff6aa0] text-[12px] text-center w-[15.31px]">
        <p className="leading-[16px]">T4</p>
      </div>
    </div>
  );
}

function Container21() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[60px] justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-[68.64px]">
        <p className="leading-[20px] mb-0">Table 04 -</p>
        <p className="leading-[20px] mb-0">VIP</p>
        <p className="leading-[20px]">Section</p>
      </div>
    </div>
  );
}

function Container22() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-[53.84px]">
        <p className="leading-[normal] mb-0">Guest: Alex</p>
        <p className="leading-[normal]">Sterling</p>
      </div>
    </div>
  );
}

function Container20() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-[68.64px]" data-name="Container">
      <Container21 />
      <Container22 />
    </div>
  );
}

function Data2() {
  return (
    <div className="content-stretch flex gap-[12.01px] items-center pl-[24px] relative shrink-0 w-[124.33px]" data-name="Data">
      <Overlay />
      <Container20 />
    </div>
  );
}

function Container23() {
  return (
    <div className="h-[13.5px] relative shrink-0 w-[9.75px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 9.75 13.5">
        <g id="Container">
          <path d={svgPaths.p7132d90} fill="var(--fill-0, white)" fillOpacity="0.7" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container24() {
  return (
    <div className="content-stretch flex flex-col items-start pr-[0.94px] relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[32px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.7)] w-[38.58px]">
        <p className="leading-[16px] mb-0">Crypto</p>
        <p className="leading-[16px]">(ETH)</p>
      </div>
    </div>
  );
}

function Data3() {
  return (
    <div className="content-stretch flex gap-[8px] items-center pl-[48px] relative shrink-0 w-[113.52px]" data-name="Data">
      <Container23 />
      <Container24 />
    </div>
  );
}

function OverlayShadow() {
  return (
    <div className="bg-[rgba(89,238,80,0.1)] content-stretch flex gap-[6px] items-center px-[12px] py-[4px] relative rounded-[9999px] shadow-[0px_0px_15px_0px_rgba(89,238,80,0.2)] shrink-0" data-name="Overlay+Shadow">
      <div className="bg-[#59ee50] rounded-[9999px] shrink-0 size-[6px]" data-name="Background" />
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#59ee50] text-[10px] tracking-[0.5px] uppercase w-[25.16px]">
        <p className="leading-[normal]">Paid</p>
      </div>
    </div>
  );
}

function Data4() {
  return (
    <div className="content-stretch flex flex-col items-start pb-[56.5px] pl-[48px] pr-[24px] pt-[56px] relative shrink-0 w-[165.98px]" data-name="Data">
      <OverlayShadow />
    </div>
  );
}

function Data5() {
  return (
    <div className="content-stretch flex flex-col items-end pb-[53px] pt-[51.5px] px-[24px] relative shrink-0 w-[133.47px]" data-name="Data">
      <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[18px] text-right text-white w-[72.98px]">
        <p className="leading-[28px]">$420.00</p>
      </div>
    </div>
  );
}

function Container25() {
  return (
    <div className="h-[8.75px] relative shrink-0 w-[12.833px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12.8333 8.75">
        <g id="Container">
          <path d={svgPaths.p1b1e2a00} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button1() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container25 />
    </div>
  );
}

function Container26() {
  return (
    <div className="relative shrink-0 size-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 11.6667">
        <g id="Container">
          <path d={svgPaths.p13fa9e80} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button2() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container26 />
    </div>
  );
}

function Container27() {
  return (
    <div className="h-[9.333px] relative shrink-0 w-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 9.33333">
        <g id="Container">
          <path d={svgPaths.p1c659f80} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button3() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container27 />
    </div>
  );
}

function Data6() {
  return (
    <div className="content-stretch flex gap-[8px] items-center justify-end pl-[32px] relative shrink-0 w-[144.03px]" data-name="Data">
      <Button1 />
      <Button2 />
      <Button3 />
    </div>
  );
}

function Row() {
  return (
    <div className="mb-[-1px] relative shrink-0 w-full" data-name="Row 1">
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center pr-[32px] relative w-full">
          <Data />
          <Data1 />
          <Data2 />
          <Data3 />
          <Data4 />
          <Data5 />
          <Data6 />
        </div>
      </div>
    </div>
  );
}

function Data7() {
  return (
    <div className="relative shrink-0 w-[120.06px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start px-[32px] py-[39.5px] relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[42px] justify-center leading-[0] relative shrink-0 text-[16px] text-white w-[39.94px]">
          <p className="leading-[normal] mb-0">#CB-</p>
          <p className="leading-[normal]">9420</p>
        </div>
      </div>
    </div>
  );
}

function Container28() {
  return (
    <div className="content-stretch flex flex-col items-start opacity-50 relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] w-full">
        <p className="leading-[16px]">14:05 PM</p>
      </div>
    </div>
  );
}

function Data8() {
  return (
    <div className="relative shrink-0 w-[126.61px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[0.5px] items-start pb-[32.5px] pt-[32px] px-[24px] relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[40px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[14px] w-[48.16px]">
          <p className="leading-[20px] mb-0">Oct 24,</p>
          <p className="leading-[20px]">2023</p>
        </div>
        <Container28 />
      </div>
    </div>
  );
}

function Overlay1() {
  return (
    <div className="bg-[rgba(255,144,109,0.1)] content-stretch flex h-[32px] items-center justify-center pb-[8.5px] pt-[7.5px] relative rounded-[8px] shrink-0 w-[15.84px]" data-name="Overlay">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff906d] text-[12px] text-center w-[13.13px]">
        <p className="leading-[16px]">B1</p>
      </div>
    </div>
  );
}

function Container30() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[60px] justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-[64.04px]">
        <p className="leading-[20px] mb-0">Bar</p>
        <p className="leading-[20px] mb-0">Counter -</p>
        <p className="leading-[20px]">Stool 12</p>
      </div>
    </div>
  );
}

function Container31() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-[68.8px]">
        <p className="leading-[normal]">Guest: Walk-in</p>
      </div>
    </div>
  );
}

function Container29() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-[68.8px]" data-name="Container">
      <Container30 />
      <Container31 />
    </div>
  );
}

function Data9() {
  return (
    <div className="relative shrink-0 w-[124.33px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12.01px] items-center pl-[24px] relative w-full">
        <Overlay1 />
        <Container29 />
      </div>
    </div>
  );
}

function Container32() {
  return (
    <div className="relative shrink-0 size-[15px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15 15">
        <g id="Container">
          <path d={svgPaths.p1aa02a80} fill="var(--fill-0, white)" fillOpacity="0.7" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container33() {
  return (
    <div className="content-stretch flex flex-col items-start pr-[4.05px] relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[32px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.7)] w-[35.47px]">
        <p className="leading-[16px] mb-0">Digital</p>
        <p className="leading-[16px]">Wallet</p>
      </div>
    </div>
  );
}

function Data10() {
  return (
    <div className="relative shrink-0 w-[113.52px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center pl-[48px] relative w-full">
        <Container32 />
        <Container33 />
      </div>
    </div>
  );
}

function Overlay2() {
  return (
    <div className="bg-[rgba(255,144,109,0.1)] content-stretch flex gap-[6px] items-center px-[12px] py-[4px] relative rounded-[9999px] shrink-0" data-name="Overlay">
      <div className="bg-[#ff906d] rounded-[9999px] shrink-0 size-[6px]" data-name="Background" />
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff906d] text-[10px] tracking-[0.5px] uppercase w-[48.84px]">
        <p className="leading-[normal]">Pending</p>
      </div>
    </div>
  );
}

function Data11() {
  return (
    <div className="relative shrink-0 w-[165.98px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pl-[48px] pr-[24px] py-[50.5px] relative w-full">
        <Overlay2 />
      </div>
    </div>
  );
}

function Data12() {
  return (
    <div className="relative shrink-0 w-[133.47px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-end pb-[47px] pt-[46px] px-[24px] relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[18px] text-right text-white w-[61.14px]">
          <p className="leading-[28px]">$54.30</p>
        </div>
      </div>
    </div>
  );
}

function Container34() {
  return (
    <div className="h-[8.75px] relative shrink-0 w-[12.833px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12.8333 8.75">
        <g id="Container">
          <path d={svgPaths.p1b1e2a00} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button4() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container34 />
    </div>
  );
}

function Container35() {
  return (
    <div className="relative shrink-0 size-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 11.6667">
        <g id="Container">
          <path d={svgPaths.p13fa9e80} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button5() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container35 />
    </div>
  );
}

function Container36() {
  return (
    <div className="h-[9.333px] relative shrink-0 w-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 9.33333">
        <g id="Container">
          <path d={svgPaths.p1c659f80} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button6() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container36 />
    </div>
  );
}

function Data13() {
  return (
    <div className="relative shrink-0 w-[144.03px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center justify-end pl-[32px] relative w-full">
        <Button4 />
        <Button5 />
        <Button6 />
      </div>
    </div>
  );
}

function Row1() {
  return (
    <div className="mb-[-1px] relative shrink-0 w-full" data-name="Row 2">
      <div aria-hidden="true" className="absolute border-[rgba(255,255,255,0.05)] border-solid border-t inset-0 pointer-events-none" />
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center pr-[32px] pt-px relative w-full">
          <Data7 />
          <Data8 />
          <Data9 />
          <Data10 />
          <Data11 />
          <Data12 />
          <Data13 />
        </div>
      </div>
    </div>
  );
}

function Data14() {
  return (
    <div className="relative shrink-0 w-[120.06px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start px-[32px] py-[35.5px] relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[42px] justify-center leading-[0] relative shrink-0 text-[16px] text-white w-[38.03px]">
          <p className="leading-[normal] mb-0">#CB-</p>
          <p className="leading-[normal]">9419</p>
        </div>
      </div>
    </div>
  );
}

function Container37() {
  return (
    <div className="content-stretch flex flex-col items-start opacity-50 relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] w-full">
        <p className="leading-[16px]">13:45 PM</p>
      </div>
    </div>
  );
}

function Data15() {
  return (
    <div className="relative shrink-0 w-[126.61px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[0.5px] items-start pb-[28.5px] pt-[28px] px-[24px] relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[40px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[14px] w-[48.16px]">
          <p className="leading-[20px] mb-0">Oct 24,</p>
          <p className="leading-[20px]">2023</p>
        </div>
        <Container37 />
      </div>
    </div>
  );
}

function Overlay3() {
  return (
    <div className="bg-[rgba(72,72,71,0.2)] content-stretch flex h-[32px] items-center justify-center pb-[8.5px] pt-[7.5px] relative rounded-[8px] shrink-0 w-[16.2px]" data-name="Overlay">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.6)] text-center w-[15.81px]">
        <p className="leading-[16px]">T9</p>
      </div>
    </div>
  );
}

function Container39() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[40px] justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-[70.51px]">
        <p className="leading-[20px] mb-0">Table 09 -</p>
        <p className="leading-[20px]">Main Floor</p>
      </div>
    </div>
  );
}

function Container40() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-[68.6px]">
        <p className="leading-[normal] mb-0">Guest: Marcus</p>
        <p className="leading-[normal]">Vane</p>
      </div>
    </div>
  );
}

function Container38() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-[70.51px]" data-name="Container">
      <Container39 />
      <Container40 />
    </div>
  );
}

function Data16() {
  return (
    <div className="relative shrink-0 w-[124.33px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12.01px] items-center pl-[24px] relative w-full">
        <Overlay3 />
        <Container38 />
      </div>
    </div>
  );
}

function Container41() {
  return (
    <div className="h-[12px] relative shrink-0 w-[15px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15 12">
        <g id="Container">
          <path d={svgPaths.p1db5c490} fill="var(--fill-0, white)" fillOpacity="0.7" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container42() {
  return (
    <div className="content-stretch flex flex-col items-start pr-[5.25px] relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[32px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.7)] w-[34.27px]">
        <p className="leading-[16px] mb-0">Credit</p>
        <p className="leading-[16px]">Card</p>
      </div>
    </div>
  );
}

function Data17() {
  return (
    <div className="relative shrink-0 w-[113.52px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center pl-[48px] relative w-full">
        <Container41 />
        <Container42 />
      </div>
    </div>
  );
}

function Overlay4() {
  return (
    <div className="bg-[rgba(255,113,108,0.1)] content-stretch flex gap-[6px] items-center px-[12px] py-[4px] relative rounded-[9999px] shrink-0" data-name="Overlay">
      <div className="bg-[#ff716c] rounded-[9999px] shrink-0 size-[6px]" data-name="Background" />
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff716c] text-[10px] tracking-[0.5px] uppercase w-[57.98px]">
        <p className="leading-[normal]">Refunded</p>
      </div>
    </div>
  );
}

function Data18() {
  return (
    <div className="relative shrink-0 w-[165.98px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pl-[48px] pr-[24px] py-[46.5px] relative w-full">
        <Overlay4 />
      </div>
    </div>
  );
}

function Data19() {
  return (
    <div className="relative shrink-0 w-[133.47px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-end pb-[43px] pt-[42px] px-[24px] relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[#d7383b] text-[18px] text-right w-[66px]">
          <p className="leading-[28px]">-$12.00</p>
        </div>
      </div>
    </div>
  );
}

function Container43() {
  return (
    <div className="h-[8.75px] relative shrink-0 w-[12.833px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12.8333 8.75">
        <g id="Container">
          <path d={svgPaths.p1b1e2a00} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button7() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container43 />
    </div>
  );
}

function Container44() {
  return (
    <div className="relative shrink-0 size-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 11.6667">
        <g id="Container">
          <path d={svgPaths.p13fa9e80} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button8() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container44 />
    </div>
  );
}

function Container45() {
  return (
    <div className="h-[9.333px] relative shrink-0 w-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 9.33333">
        <g id="Container">
          <path d={svgPaths.p1c659f80} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button9() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container45 />
    </div>
  );
}

function Data20() {
  return (
    <div className="relative shrink-0 w-[144.03px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center justify-end pl-[32px] relative w-full">
        <Button7 />
        <Button8 />
        <Button9 />
      </div>
    </div>
  );
}

function Row2() {
  return (
    <div className="mb-[-1px] relative shrink-0 w-full" data-name="Row 3">
      <div aria-hidden="true" className="absolute border-[rgba(255,255,255,0.05)] border-solid border-t inset-0 pointer-events-none" />
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center pr-[32px] pt-px relative w-full">
          <Data14 />
          <Data15 />
          <Data16 />
          <Data17 />
          <Data18 />
          <Data19 />
          <Data20 />
        </div>
      </div>
    </div>
  );
}

function Data21() {
  return (
    <div className="relative shrink-0 w-[120.06px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pb-[51px] pt-[51.5px] px-[32px] relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[42px] justify-center leading-[0] relative shrink-0 text-[16px] text-white w-[38.03px]">
          <p className="leading-[normal] mb-0">#CB-</p>
          <p className="leading-[normal]">9418</p>
        </div>
      </div>
    </div>
  );
}

function Container46() {
  return (
    <div className="content-stretch flex flex-col items-start opacity-50 relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] w-full">
        <p className="leading-[16px]">13:12 PM</p>
      </div>
    </div>
  );
}

function Data22() {
  return (
    <div className="relative shrink-0 w-[126.61px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[0.5px] items-start px-[24px] py-[44px] relative w-full">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[40px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[14px] w-[48.16px]">
          <p className="leading-[20px] mb-0">Oct 24,</p>
          <p className="leading-[20px]">2023</p>
        </div>
        <Container46 />
      </div>
    </div>
  );
}

function Overlay5() {
  return (
    <div className="bg-[rgba(255,106,160,0.1)] content-stretch flex h-[32px] items-center justify-center pb-[8.5px] pt-[7.5px] relative rounded-[8px] shrink-0 w-[17.45px]" data-name="Overlay">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#ff6aa0] text-[12px] text-center w-[14.14px]">
        <p className="leading-[16px]">V1</p>
      </div>
    </div>
  );
}

function Container48() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[60px] justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-white w-[46.79px]">
        <p className="leading-[20px] mb-0">Private</p>
        <p className="leading-[20px] mb-0">Suite -</p>
        <p className="leading-[20px]">V01</p>
      </div>
    </div>
  );
}

function Container49() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[36px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[10px] w-[55.14px]">
        <p className="leading-[normal] mb-0">Guest:</p>
        <p className="leading-[normal] mb-0">Corporate -</p>
        <p className="leading-[normal]">NeoGen</p>
      </div>
    </div>
  );
}

function Container47() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-[55.14px]" data-name="Container">
      <Container48 />
      <Container49 />
    </div>
  );
}

function Data23() {
  return (
    <div className="relative shrink-0 w-[124.33px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12.01px] items-center pl-[24px] relative w-full">
        <Overlay5 />
        <Container47 />
      </div>
    </div>
  );
}

function Container50() {
  return (
    <div className="h-[12px] relative shrink-0 w-[15px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15 12">
        <g id="Container">
          <path d={svgPaths.p1db5c490} fill="var(--fill-0, white)" fillOpacity="0.7" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Container51() {
  return (
    <div className="content-stretch flex flex-col items-start pr-[5.25px] relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[32px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.7)] w-[34.27px]">
        <p className="leading-[16px] mb-0">Credit</p>
        <p className="leading-[16px]">Card</p>
      </div>
    </div>
  );
}

function Data24() {
  return (
    <div className="relative shrink-0 w-[113.52px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center pl-[48px] relative w-full">
        <Container50 />
        <Container51 />
      </div>
    </div>
  );
}

function OverlayShadow1() {
  return (
    <div className="bg-[rgba(89,238,80,0.1)] content-stretch flex gap-[6px] items-center px-[12px] py-[4px] relative rounded-[9999px] shadow-[0px_0px_15px_0px_rgba(89,238,80,0.2)] shrink-0" data-name="Overlay+Shadow">
      <div className="bg-[#59ee50] rounded-[9999px] shrink-0 size-[6px]" data-name="Background" />
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[12px] justify-center leading-[0] not-italic relative shrink-0 text-[#59ee50] text-[10px] tracking-[0.5px] uppercase w-[25.16px]">
        <p className="leading-[normal]">Paid</p>
      </div>
    </div>
  );
}

function Data25() {
  return (
    <div className="relative shrink-0 w-[165.98px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pb-[62px] pl-[48px] pr-[24px] pt-[62.5px] relative w-full">
        <OverlayShadow1 />
      </div>
    </div>
  );
}

function Data26() {
  return (
    <div className="relative shrink-0 w-[133.47px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-end pb-[58.5px] pt-[58px] px-[24px] relative w-full">
        <div className="flex flex-col font-['Space_Grotesk:Bold',sans-serif] font-bold h-[28px] justify-center leading-[0] relative shrink-0 text-[18px] text-right text-white w-[85.47px]">
          <p className="leading-[28px]">$2,140.00</p>
        </div>
      </div>
    </div>
  );
}

function Container52() {
  return (
    <div className="h-[8.75px] relative shrink-0 w-[12.833px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12.8333 8.75">
        <g id="Container">
          <path d={svgPaths.p1b1e2a00} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button10() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container52 />
    </div>
  );
}

function Container53() {
  return (
    <div className="relative shrink-0 size-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 11.6667">
        <g id="Container">
          <path d={svgPaths.p13fa9e80} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button11() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container53 />
    </div>
  );
}

function Container54() {
  return (
    <div className="h-[9.333px] relative shrink-0 w-[11.667px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.6667 9.33333">
        <g id="Container">
          <path d={svgPaths.p1c659f80} fill="var(--fill-0, white)" fillOpacity="0.5" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button12() {
  return (
    <div className="bg-[#262626] content-stretch flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <Container54 />
    </div>
  );
}

function Data27() {
  return (
    <div className="relative shrink-0 w-[144.03px]" data-name="Data">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center justify-end pl-[32px] relative w-full">
        <Button10 />
        <Button11 />
        <Button12 />
      </div>
    </div>
  );
}

function Row3() {
  return (
    <div className="mb-[-1px] relative shrink-0 w-full" data-name="Row 4">
      <div aria-hidden="true" className="absolute border-[rgba(255,255,255,0.05)] border-solid border-t inset-0 pointer-events-none" />
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center pr-[32px] pt-px relative w-full">
          <Data21 />
          <Data22 />
          <Data23 />
          <Data24 />
          <Data25 />
          <Data26 />
          <Data27 />
        </div>
      </div>
    </div>
  );
}

function Body() {
  return (
    <div className="content-stretch flex flex-col items-start pb-px relative shrink-0 w-full" data-name="Body">
      <Row />
      <Row1 />
      <Row2 />
      <Row3 />
    </div>
  );
}

function Table() {
  return (
    <div className="content-stretch flex flex-col items-start overflow-clip relative shrink-0 w-full" data-name="Table">
      <HeaderRow />
      <Body />
    </div>
  );
}

function Container55() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative">
        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[#adaaaa] text-[12px] w-[187.66px]">
          <p>
            <span className="leading-[16px]">{`Showing `}</span>
            <span className="font-['Inter:Bold',sans-serif] font-bold leading-[16px] not-italic text-white">1 - 4</span>
            <span className="leading-[16px]">{` of 152 transactions`}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Container57() {
  return (
    <div className="h-[7px] relative shrink-0 w-[4.317px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4.31667 7">
        <g id="Container">
          <path d={svgPaths.p10965ac0} fill="var(--fill-0, white)" fillOpacity="0.3" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button13() {
  return (
    <div className="bg-[#262626] content-stretch flex flex-col items-center justify-center p-[8px] relative rounded-[8px] shrink-0" data-name="Button">
      <Container57 />
    </div>
  );
}

function Button14() {
  return (
    <div className="bg-[#ff906d] content-stretch flex flex-col items-center justify-center pb-[8.5px] pt-[7.5px] relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-black text-center w-[5.19px]">
        <p className="leading-[16px]">1</p>
      </div>
    </div>
  );
}

function Button15() {
  return (
    <div className="bg-[#262626] content-stretch flex flex-col items-center justify-center pb-[8.5px] pt-[7.5px] relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.7)] text-center w-[7.56px]">
        <p className="leading-[16px]">2</p>
      </div>
    </div>
  );
}

function Button16() {
  return (
    <div className="bg-[#262626] content-stretch flex flex-col items-center justify-center pb-[8.5px] pt-[7.5px] relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.7)] text-center w-[7.75px]">
        <p className="leading-[16px]">3</p>
      </div>
    </div>
  );
}

function Container58() {
  return (
    <div className="content-stretch flex flex-col items-start px-[4px] relative shrink-0" data-name="Container">
      <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[24px] justify-center leading-[0] not-italic relative shrink-0 text-[16px] text-[rgba(255,255,255,0.3)] w-[13.83px]">
        <p className="leading-[24px]">...</p>
      </div>
    </div>
  );
}

function Button17() {
  return (
    <div className="bg-[#262626] content-stretch flex flex-col items-center justify-center pb-[8.5px] pt-[7.5px] relative rounded-[8px] shrink-0 size-[32px]" data-name="Button">
      <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold h-[16px] justify-center leading-[0] not-italic relative shrink-0 text-[12px] text-[rgba(255,255,255,0.7)] text-center w-[15.56px]">
        <p className="leading-[16px]">38</p>
      </div>
    </div>
  );
}

function Container59() {
  return (
    <div className="h-[7px] relative shrink-0 w-[4.317px]" data-name="Container">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4.31667 7">
        <g id="Container">
          <path d={svgPaths.p35022f90} fill="var(--fill-0, white)" fillOpacity="0.7" id="Icon" />
        </g>
      </svg>
    </div>
  );
}

function Button18() {
  return (
    <div className="bg-[#262626] content-stretch flex flex-col items-center justify-center p-[8px] relative rounded-[8px] shrink-0" data-name="Button">
      <Container59 />
    </div>
  );
}

function Container56() {
  return (
    <div className="relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center relative">
        <Button13 />
        <Button14 />
        <Button15 />
        <Button16 />
        <Container58 />
        <Button17 />
        <Button18 />
      </div>
    </div>
  );
}

function Pagination() {
  return (
    <div className="bg-[rgba(32,31,31,0.3)] relative shrink-0 w-full" data-name="Pagination">
      <div aria-hidden="true" className="absolute border-[rgba(255,255,255,0.05)] border-solid border-t inset-0 pointer-events-none" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between pb-[20px] pt-[21px] px-[32px] relative w-full">
          <Container55 />
          <Container56 />
        </div>
      </div>
    </div>
  );
}

function SectionTransactionsTable() {
  return (
    <div className="bg-[#131313] content-stretch flex flex-col items-start overflow-clip relative rounded-[32px] shrink-0 w-full" data-name="Section - Transactions Table">
      <Table />
      <Pagination />
    </div>
  );
}

export default function MainContentArea() {
  return (
    <div className="content-stretch flex flex-col gap-[32px] items-start p-[32px] relative size-full" data-name="Main Content Area">
      <SectionHeroStatsBento />
      <SectionFiltersBar />
      <SectionTransactionsTable />
    </div>
  );
}