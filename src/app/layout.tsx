import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Inter } from "next/font/google";
import { LocaleSync } from "@/components/shell/LocaleSync";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const fontVars = [inter, plexMono, instrument].map((f) => f.variable).join(" ");

// Korean, Japanese and Chinese faces come from Google Fonts at runtime; the
// browser downloads only the glyph ranges a page actually uses. Korean body
// text uses Pretendard (drawn to sit beside Inter), served with the site in
// the same small subsets.
const CJK_FONTS =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500&family=Noto+Serif+KR:wght@300;400&family=IBM+Plex+Sans+JP:wght@400;500&family=Shippori+Mincho:wght@400;500&family=Noto+Sans+SC:wght@400;500&family=Noto+Serif+SC:wght@400;500&display=swap";
const PRETENDARD = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fonts/pretendard/pretendardvariable-dynamic-subset.css`;

export const metadata: Metadata = {
  title: { default: "Nocturne", template: "%s · Nocturne" },
  description: "A planner that doesn't break when your plan does.",
  applicationName: "Nocturne",
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
        <link rel="stylesheet" href={CJK_FONTS} />
        <link rel="stylesheet" href={PRETENDARD} />
      </head>
      <body>
        <LocaleSync />
        {children}
      </body>
    </html>
  );
}
