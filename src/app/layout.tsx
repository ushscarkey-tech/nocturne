import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Inter } from "next/font/google";
import { LocaleSync } from "@/components/shell/LocaleSync";
import { NativeBridge } from "@/components/shell/NativeBridge";
import { ServiceWorker } from "@/components/shell/ServiceWorker";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const fontVars = [inter, plexMono, instrument].map((f) => f.variable).join(" ");

// Korean body text uses Pretendard (drawn to sit beside Inter), served with
// the site in small subsets. The other CJK faces come from Google Fonts for
// the chosen language only, without holding up the first paint (LocaleSync).
const PRETENDARD = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fonts/pretendard/pretendardvariable-dynamic-subset.css`;

export const metadata: Metadata = {
  title: { default: "Nocturne", template: "%s · Nocturne" },
  description: "A planner that doesn't break when your plan does.",
  applicationName: "Nocturne",
  // On iPhone and iPad, "Add to Home Screen" opens it full screen.
  appleWebApp: { capable: true, title: "Nocturne", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#070a10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVars} antialiased`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={PRETENDARD} />
      </head>
      <body>
        <LocaleSync />
        <ServiceWorker />
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
