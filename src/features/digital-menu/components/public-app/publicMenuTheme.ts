/**
 * CyberBistro Design System Tokens for the Public Digital Menu.
 * Palette:
 * - Canvas: #0e0e0e
 * - Deep outer background: #0a0a0a
 * - Surfaces: #131313, elevated: #1a1a1a
 * - Borders: #262626, divider: #1c1c1c, inactive track: #3a3a3a
 * - Cards: rounded-[20px] (18px-22px range)
 * - Text: primary #fafafa, muted #adaaaa
 * - Accent: Coral #ff906d (hover #ffb59c), text ON coral #5b1600
 * - Soft accent chip: bg #2b160d, border #5b2a17, text #ffb59c
 * - Success/open: #59ee50
 * - Primary buttons: Coral #ff906d with #5b1600 text, rounded-full
 * - Secondary buttons: bg #1a1a1a border #262626 text #fafafa, rounded-full
 * - Headings: Space Grotesk (500/700/800), body: Inter
 */

export const PUBLIC_MENU_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export const PUBLIC_MENU_HEADING_FONT_FAMILY =
  '"Space Grotesk", Inter, ui-sans-serif, system-ui, sans-serif';

export const publicMenuTheme = {
  // Scoped font families (Space Grotesk for headings, Inter for body)
  fontFamily: PUBLIC_MENU_FONT_FAMILY,
  headingFontFamily: PUBLIC_MENU_HEADING_FONT_FAMILY,
  fontClass: "[font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]",
  headingFontClass: "[font-family:'Space_Grotesk',sans-serif]",
  rootStyle: {
    fontFamily: PUBLIC_MENU_FONT_FAMILY,
  },

  // Colors dictionary for inline/canvas usage
  colors: {
    canvas: "#0e0e0e",
    deep: "#0a0a0a",
    surface: "#131313",
    elevated: "#1a1a1a",
    border: "#262626",
    divider: "#1c1c1c",
    inactiveTrack: "#3a3a3a",
    textPrimary: "#fafafa",
    textMuted: "#adaaaa",
    accent: "#ff906d",
    accentHover: "#ffb59c",
    textOnAccent: "#5b1600",
    softAccentBg: "#2b160d",
    softAccentBorder: "#5b2a17",
    softAccentText: "#ffb59c",
    success: "#59ee50",
  },

  // Screen and canvas wrapper
  canvas:
    "min-h-dvh w-full bg-[#0a0a0a] text-[#fafafa] antialiased flex justify-center [font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]",

  // Single phone-style device column (max 480px)
  deviceColumn:
    "relative w-full max-w-[480px] min-h-dvh bg-[#0e0e0e] sm:border-x sm:border-[#262626] shadow-2xl flex flex-col overflow-x-hidden [font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]",

  // Same column on phones; from lg it fills the space next to the docked cart instead of staying 480px wide.
  orderColumn:
    "relative w-full max-w-[480px] min-h-dvh bg-[#0e0e0e] sm:border-x sm:border-[#262626] shadow-2xl flex flex-col overflow-x-hidden lg:max-w-none lg:flex-1 lg:min-w-0 lg:border-x-0 lg:shadow-none [font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]",

  // Scroll padding for bottom tab bar and floating cart summary bar with safe area
  scrollPaddingCart: "pb-[calc(10.5rem+env(safe-area-inset-bottom,0px))]",
  scrollPaddingNoCart: "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",

  // Surface containers
  surfaceBase: "bg-[#131313] border border-[#262626]",
  surfaceElevated: "bg-[#1a1a1a] border border-[#262626]",
  divider: "border-[#1c1c1c]",
  inactiveTrack: "bg-[#3a3a3a]",
  card: "rounded-[20px]",

  // Typography
  heading: "font-bold tracking-tight text-[#fafafa] [font-family:'Space_Grotesk',sans-serif]",
  subheading: "text-xs text-[#adaaaa]",
  microLabel: "text-[10px] uppercase tracking-wider font-semibold text-[#adaaaa]",

  // Coral Accent
  accentText: "text-[#ff906d]",
  accentChip: "bg-[#2b160d] border border-[#5b2a17] text-[#ffb59c]",
  accentIconChip:
    "size-10 rounded-full bg-[#2b160d] border border-[#5b2a17] text-[#ff906d] flex items-center justify-center shrink-0",

  // Success / Open green
  successText: "text-[#59ee50]",
  successChip: "bg-[#59ee50]/10 border border-[#59ee50]/20 text-[#59ee50]",
  successDot: "size-2 rounded-full bg-[#59ee50]",

  // Buttons
  buttonPrimary:
    "bg-[#ff906d] text-[#5b1600] font-bold rounded-full hover:bg-[#ffb59c] active:scale-98 transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  buttonSecondary:
    "bg-[#1a1a1a] border border-[#262626] text-[#fafafa] hover:bg-[#262626] rounded-full transition cursor-pointer active:scale-98 disabled:opacity-50",
  buttonGhost:
    "text-[#adaaaa] hover:text-[#fafafa] transition cursor-pointer hover:bg-[#1a1a1a] rounded-full",

  // Inputs
  input:
    "w-full rounded-full border border-[#262626] bg-[#1a1a1a] px-4 py-3 text-sm text-[#fafafa] placeholder:text-[#adaaaa] outline-none focus:border-[#ff906d]/50 transition",

  // Drawer & Modals
  drawerBackdrop: "bg-black/60 backdrop-blur-sm",
  drawerPanel: "bg-[#131313] border-l border-[#262626]",
} as const;
