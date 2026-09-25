import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Nocturne", template: "%s · Nocturne" },
  description: "A planner that doesn't break when your plan does.",
  applicationName: "Nocturne",
};

export const viewport: Viewport = {
  themeColor: "#090d18",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable} ${instrument.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
