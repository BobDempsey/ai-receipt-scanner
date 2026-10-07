"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Anchor, Container, Text } from "@mantine/core";
import classes from "./SiteFooter.module.css";
import { AUTHOR_NAME, AUTHOR_URL, REPOSITORY_URL } from "@/components/site-links";

/**
 * The footer, on every page because `app/layout.tsx` renders it.
 *
 * The year is read at render rather than written into the build output, so a year
 * that turns over while the deployment sits untouched still reads correctly.
 * `useSyncExternalStore` is what does it: the server snapshot fills the first
 * paint, and React reads the client snapshot during hydration, so a stale
 * build-time year is replaced by the one the visitor's own clock says. The clock
 * never notifies anyone, so the subscription is a no-op.
 */
export function SiteFooter() {
  const year = useSyncExternalStore(subscribeToNothing, readYear, readYear);

  return (
    <footer className={classes.root}>
      <Container size="var(--content-max)" className={classes.inner}>
        <Text size="sm" c="dimmed" suppressHydrationWarning>
          © {year} -{" "}
          <Anchor
            href={AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            inherit
          >
            {AUTHOR_NAME}
          </Anchor>
        </Text>

        <div className={classes.links}>
          <Anchor component={Link} href="/about" size="sm">
            About
          </Anchor>
          <Anchor
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            GitHub
          </Anchor>
        </div>
      </Container>
    </footer>
  );
}

/** The clock the footer reads. A primitive, so the snapshot stays stable. */
function readYear() {
  return new Date().getFullYear();
}

/** The clock pushes no updates, so nothing ever calls back. */
function subscribeToNothing() {
  return () => {};
}
