import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ColorSchemeScript,
  MantineProvider,
  createTheme,
  mantineHtmlProps,
} from "@mantine/core";
import "@mantine/core/styles.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const theme = createTheme({
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), ui-monospace, monospace",
  primaryColor: "teal",
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
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
