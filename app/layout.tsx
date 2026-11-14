import type { Metadata, Viewport } from "next";
import { Anton, Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const barlow = Barlow_Condensed({ subsets: ["latin"], variable: "--font-barlow", weight: ["500", "600", "700"] });
const anton = Anton({ subsets: ["latin"], variable: "--font-anton", weight: "400" });

export const metadata: Metadata = {
  title: "Undisputed Manager",
  description: "Boxing management sim: manage and promote your way to undisputed champions.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0a0c11" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${barlow.variable} ${anton.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
