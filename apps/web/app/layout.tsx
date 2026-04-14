import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { MobileNav } from "@/components/shell/MobileNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "arb-finder",
  description: "Cross-book sportsbook arbitrage + boost finder",
};

// Loaded before hydration so the theme attribute is correct on first paint
// and we don't flash dark-then-light for users who picked light mode.
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('arb-finder:theme:v1');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <TopBar />
            <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
              {children}
            </main>
          </div>
        </div>
        <CommandPalette />
        <MobileNav />
      </body>
    </html>
  );
}
