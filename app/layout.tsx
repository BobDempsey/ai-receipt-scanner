import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { Analytics } from "@vercel/analytics/next";
import "@mantine/core/styles.css";
import "./globals.css";
import { SiteProviders } from "@/components/SiteProviders";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Receipt Scanner",
  description:
    "Turn a photo of a receipt into typed fields you can check and export as JSON.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      {...mantineHtmlProps}
    >
      <head>
        {/* Mantine's own script, and the only thing applying the stored theme
            before the first paint. The nav's toggle writes the key it reads. */}
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <SiteProviders>
          {/* The chrome lives here rather than in each page, so a page added
              later cannot forget the nav or the footer. This layout stays a
              server component; the toggle, the year and the theme are client
              leaves beneath it. */}
          <SiteNav />
          {/* The page grows to fill the viewport so the footer sits at the
              bottom of a short page rather than leaving a gap below it. */}
          <main className="pageMain">{children}</main>
          <SiteFooter />
        </SiteProviders>
        {/* Page views count on the production deployment alone. Vercel builds
            a preview with NODE_ENV set to production too, so the component's
            own default would count every preview; VERCEL_ENV is the variable
            that tells the two apart, and a local build never sets it. */}
        {process.env.VERCEL_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
