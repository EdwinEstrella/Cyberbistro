import type { Metadata } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  weight: ["400", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--next-font-display",
  display: "swap",
  preload: true,
});

const dmSans = DM_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--next-font-body",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Cloudix — El Sistema Operativo para tu Restaurante",
  description: "Facturación fiscal (NCF), control de mesas, comandas en tiempo real y cierres operativos. Todo en un solo lugar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${outfit.variable} ${dmSans.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-body selection:bg-primary/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
