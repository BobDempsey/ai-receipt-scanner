"use client";

import { useState } from "react";
import {
  Container,
  Image,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import classes from "./Screenshots.module.css";

/**
 * Two real captures of the running app, side by side on a wide screen.
 *
 * The portfolio baseline rules out illustrations, so these are screenshots of the
 * deployed pipeline reading one of the fictional sample receipts.
 * `scripts/capture-screenshots.mjs` beside them records the viewport and the steps
 * that produced each one, so a later change retakes them rather than cropping by
 * hand.
 *
 * Each `alt` says what the capture shows, because a visitor who cannot see the
 * image needs the content of the screenshot and not its filename. Clicking one
 * opens it at its own pixel size in Mantine's modal, which is why this is the one
 * client component in the sections below the hero. It imports no figures, so the
 * OpenAI SDK that `lib/project-facts.ts` reaches stays out of the browser bundle.
 */

type Shot = {
  /** The committed file under `public/screenshots/`. */
  src: string;
  /** The capture's own pixel size, so the modal can show it unscaled. */
  width: number;
  height: number;
  /** What the capture shows, for a visitor who cannot see it. */
  alt: string;
  /** The line printed under the image, for a visitor who can. */
  caption: string;
};

const SHOTS: readonly Shot[] = [
  {
    src: "/screenshots/extraction.png",
    width: 1440,
    height: 900,
    alt: "The app after reading a grocery till receipt. The left pane shows the photographed receipt with a teal rectangle drawn over the printed total. The right pane lists the extracted fields, each with the model's confidence beside it, and a warning saying the line items fall 0.90 short of the printed subtotal.",
    caption:
      "A sample receipt read, with the printed total marked on the image and the arithmetic warning naming the 0.90 gap.",
  },
  {
    src: "/screenshots/line-items-and-export.png",
    width: 1440,
    height: 900,
    alt: "The field panel scrolled to the line items table, showing eleven grocery items with their descriptions, quantities, unit prices and amounts in editable cells. Items the receipt priced only as a total read absent rather than zero. Below the table sit a control that adds a row and the download and copy controls for JSON and CSV.",
    caption:
      "Every line item as an editable cell, with the control that adds a row the model missed and the JSON and CSV exports under it.",
  },
];

export function Screenshots() {
  const [open, setOpen] = useState<Shot | null>(null);

  return (
    <Container size="var(--content-max)" py="xl" component="section" className="reveal">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={2}>The app reading a receipt</Title>
          <Text c="dimmed" maw="var(--prose-measure)">
            Both captures are of the running app on one of the sample receipts. Click
            either one to open it at full size.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {SHOTS.map((shot) => (
            <Stack key={shot.src} gap="xs">
              {/* The image's own alt describes the capture in full, which is far
                  too long to announce as a control's name, so the control carries a
                  short label of its own saying what pressing it does. */}
              <button
                type="button"
                className={classes.trigger}
                aria-label={`Open full size: ${shot.caption}`}
                onClick={() => setOpen(shot)}
              >
                {/* The intrinsic size goes on as plain HTML attributes rather than
                    Mantine's `w` and `h` style props, which would write an inline
                    width the stylesheet cannot scale down. The browser reserves the
                    right box from the ratio, so nothing jumps as the image lands. */}
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  width={shot.width}
                  height={shot.height}
                  className={classes.shot}
                />
              </button>
              <Text size="sm" c="dimmed">
                {shot.caption}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Stack>

      <Modal
        opened={open !== null}
        onClose={() => setOpen(null)}
        size="auto"
        centered
        title={open?.caption}
        /* Mantine's close button ships no name of its own and its glyph is an
           unlabelled image, so the accessibility tree announced a button with
           nothing in it. The name says what closing it gets you back to. */
        closeButtonProps={{ "aria-label": "Close the full size screenshot" }}
      >
        {open ? (
          <Image
            src={open.src}
            alt={open.alt}
            width={open.width}
            height={open.height}
            className={classes.full}
          />
        ) : null}
      </Modal>
    </Container>
  );
}
