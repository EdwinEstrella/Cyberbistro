/**
 * LicenHub-inspired Design System Tokens for the Public Digital Menu.
 * Palette:
 * - Canvas: #09090b
 * - Device frame column: #0b0b0d with #27272a border
 * - Surfaces: #111113, #18181b with 1px border #27272a
 * - Cards: rounded-2xl
 * - Text: white, zinc-300, zinc-500
 * - Accent: Emerald #34d399, bg-emerald-400/10 border-emerald-400/20
 * - Primary buttons: White with near-black text
 * - Secondary buttons: bg-zinc-900 border border-zinc-800
 */

export const PUBLIC_MENU_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export const publicMenuTheme = {
  // Scoped sans font family (LicenHub clean sans style, avoiding app-wide IBM Plex Mono)
  fontFamily: PUBLIC_MENU_FONT_FAMILY,
  fontClass: "[font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]",
  rootStyle: {
    fontFamily: PUBLIC_MENU_FONT_FAMILY,
  },

  // Screen and canvas wrapper
  canvas:
    "min-h-dvh w-full bg-[#09090b] text-zinc-100 antialiased flex justify-center [font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]",
  
  // Single phone-style device column (max 480px)
  deviceColumn:
    "relative w-full max-w-[480px] min-h-dvh bg-[#0b0b0d] sm:border-x sm:border-[#27272a] shadow-2xl flex flex-col overflow-x-hidden [font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]",

  // Same column on phones; from lg it fills the space next to the docked cart instead of staying 480px wide.
  orderColumn:
    "relative w-full max-w-[480px] min-h-dvh bg-[#0b0b0d] sm:border-x sm:border-[#27272a] shadow-2xl flex flex-col overflow-x-hidden lg:max-w-none lg:flex-1 lg:min-w-0 lg:border-x-0 lg:shadow-none [font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe_UI',sans-serif]",

  // Scroll padding for bottom tab bar and floating cart summary bar with safe area
  scrollPaddingCart: "pb-[calc(10.5rem+env(safe-area-inset-bottom,0px))]",
  scrollPaddingNoCart: "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",

  // Surface containers
  surfaceBase: "bg-[#111113] border border-[#27272a]",
  surfaceElevated: "bg-[#18181b] border border-[#27272a]",
  card: "rounded-2xl",

  // Typography
  heading: "font-bold tracking-tight text-white",
  subheading: "text-xs text-zinc-400",
  microLabel: "text-[10px] uppercase tracking-wider font-semibold text-zinc-500",

  // Emerald Accent
  emeraldText: "text-emerald-400",
  emeraldChip: "bg-emerald-400/10 border border-emerald-400/20 text-emerald-400",
  emeraldIconChip:
    "size-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 flex items-center justify-center shrink-0",

  // Buttons
  buttonPrimary:
    "bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-100 active:scale-98 transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  buttonSecondary:
    "bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 rounded-xl transition cursor-pointer active:scale-98 disabled:opacity-50",
  buttonGhost:
    "text-zinc-400 hover:text-white transition cursor-pointer hover:bg-zinc-800/50 rounded-xl",

  // Inputs
  input:
    "w-full rounded-xl border border-[#27272a] bg-[#18181b] px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/50 transition",

  // Drawer & Modals
  drawerBackdrop: "bg-black/60 backdrop-blur-sm",
  drawerPanel: "bg-[#111113] border-l border-[#27272a]",
} as const;
