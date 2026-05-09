import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
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
      className={`${ibmPlexMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-mono selection:bg-primary selection:text-primary-foreground">
        {children}
      </body>
    </html>
  );
}
