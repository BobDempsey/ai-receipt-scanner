"use client";

import type { ReactNode } from "react";
import { MantineProvider, createTheme } from "@mantine/core";

/**
 * The Mantine theme and the provider around it.
 *
 * It sits in a client module rather than in `app/layout.tsx` because the theme
 * carries a function, and a function cannot cross the server-to-client boundary
 * as a prop. The layout stays a server component and renders this one.
 *
 * The theme holds the measurements the whole site shares. The headline scale and
 * the content width are CSS custom properties declared in `globals.css`, read
 * from here so Mantine's own components use the same numbers a plain CSS module
 * does. Nothing restates a pixel value in two places.
 *
 * `primaryShade` moves off Mantine's default teal on both schemes because the
 * baseline asks for the accent to clear 4.5 to 1 against the surface behind it,
 * and the browser was asked rather than the palette guessed. Shade 6 measures
 * 2.55 to 1 against the white body and shade 8 measures 3.94 to 1 against the
 * #242424 dark body, so light takes shade 9 (5.00 to 1) and dark takes shade 5
 * (7.29 to 1).
 */
const theme = createTheme({
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), ui-monospace, monospace",
  primaryColor: "teal",
  primaryShade: { light: 9, dark: 5 },
  autoContrast: true,
  headings: {
    textWrap: "balance",
    sizes: {
      h1: { fontSize: "var(--headline-1)", lineHeight: "1.1" },
      h2: { fontSize: "var(--headline-2)", lineHeight: "1.2" },
    },
  },
  components: {
    Button: {
      vars: (_theme: unknown, props: FilledProps) => filledLabel(props, "--button-color"),
    },
    ActionIcon: {
      vars: (_theme: unknown, props: FilledProps) => filledLabel(props, "--ai-color"),
    },
  },
});

/** The two props that decide whether a control paints with the primary colour. */
type FilledProps = { color?: unknown; variant?: unknown };

/**
 * Hands a filled control the label colour its own scheme calls for.
 *
 * Mantine resolves `autoContrast` in JavaScript at render, where it cannot know
 * which scheme the browser will paint, so it reads the light entry of
 * `primaryShade` and writes white into an inline custom property no stylesheet
 * can outrank. `--mantine-primary-color-contrast` holds the right answer per
 * scheme, because Mantine computes that one in CSS where the scheme is known:
 * white on the dark light-mode teal at 5.00 to 1, black on the light dark-mode
 * teal at 9.86 to 1 where white would have measured 2.13.
 *
 * Only a filled control with no `color` of its own paints with the primary, so a
 * control that names a colour is left alone.
 */
function filledLabel(props: FilledProps, name: "--button-color" | "--ai-color") {
  const paintsPrimary = props.color === undefined && (props.variant ?? "filled") === "filled";
  return { root: paintsPrimary ? { [name]: "var(--mantine-primary-color-contrast)" } : {} };
}

export function SiteProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {children}
    </MantineProvider>
  );
}
