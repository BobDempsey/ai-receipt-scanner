"use client";

import Link from "next/link";
import { ActionIcon, Button, Container, Group, useMantineColorScheme } from "@mantine/core";
import classes from "./SiteNav.module.css";
import { REPOSITORY_URL } from "@/components/site-links";

/**
 * The nav, fixed to the top of the viewport for the whole scroll.
 *
 * It carries the four controls the portfolio baseline names: the project name
 * linking home, the main action, the repository opening in a new tab, and the
 * theme toggle. Both icon-only controls carry an accessible name that says what
 * they do rather than what they look like.
 *
 * The toggle calls Mantine's `useMantineColorScheme`, which writes the same
 * storage key `ColorSchemeScript` reads before the first paint. There is no
 * second theme store, so there is no second source of truth to flash from.
 *
 * It is two controls rather than one, each hidden in the scheme it does not
 * apply to. Reading the current scheme during the first client render disagrees
 * with what the server wrote and costs a hydration mismatch, so the direction is
 * decided by the CSS `ColorSchemeScript` has already settled, and `display: none`
 * keeps the hidden one out of the accessibility tree.
 */
export function SiteNav() {
  const { setColorScheme } = useMantineColorScheme();

  return (
    <header className={classes.root}>
      <Container size="var(--content-max)" className={classes.inner}>
        <Link href="/" className={classes.brand}>
          AI Receipt Scanner
        </Link>

        <Group gap="xs" wrap="nowrap">
          <Button
            component={Link}
            href="/#scan"
            size="xs"
            className={classes.action}
          >
            Scan a receipt
          </Button>

          <ActionIcon
            component="a"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            variant="default"
            size="lg"
            aria-label="View the source on GitHub, opens in a new tab"
          >
            <GitHubMark />
          </ActionIcon>

          <ActionIcon
            darkHidden
            onClick={() => setColorScheme("dark")}
            variant="default"
            size="lg"
            aria-label="Switch to the dark theme"
          >
            <MoonGlyph />
          </ActionIcon>

          <ActionIcon
            lightHidden
            onClick={() => setColorScheme("light")}
            variant="default"
            size="lg"
            aria-label="Switch to the light theme"
          >
            <SunGlyph />
          </ActionIcon>
        </Group>
      </Container>
    </header>
  );
}

/* The three glyphs are inline so the bar costs no icon dependency and no network
   request. Each is hidden from the accessibility tree, because the control around
   it already carries the name. */

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-2.92-.88-2.92-2.9 0-.82.29-1.49.77-2.01-.08-.2-.34-.98.07-2.03 0 0 .62-.2 2.04.77a7.1 7.1 0 0 1 1.85-.25c.63 0 1.26.08 1.85.25 1.41-.97 2.04-.77 2.04-.77.41 1.05.15 1.83.07 2.03.48.52.77 1.18.77 2.01 0 2.03-1.15 2.7-2.93 2.9.3.26.56.76.56 1.54 0 1.11-.01 2-.01 2.27 0 .21.15.46.55.38A7.99 7.99 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function SunGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 14.3A8.8 8.8 0 0 1 9.7 3.5a8.8 8.8 0 1 0 10.8 10.8Z" />
    </svg>
  );
}
