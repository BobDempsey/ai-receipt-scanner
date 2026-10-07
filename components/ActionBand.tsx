import { Button, Container, Group, Stack, Text, Title } from "@mantine/core";
import { REPOSITORY_URL } from "./site-links";
import classes from "./ActionBand.module.css";

/**
 * The last section before the footer, carrying the two actions that follow.
 *
 * A visitor who has read the whole page has done one of two things: they came to
 * use the app, or they came to see how it was built. So the band offers exactly
 * those two. The first sends them back up to the hero, where the three samples
 * mean they need no receipt of their own, and the second opens the repository,
 * which is the thing a page about a portfolio project cannot answer by itself.
 *
 * The About page is deliberately not a third control here. The footer already
 * links it on every page, and a band with three equal buttons stops saying which
 * one matters.
 *
 * `#scan` is the id `app/page.tsx` puts on the hero section, and the repository
 * URL comes from `components/site-links.ts`, the one copy the nav and the footer
 * also read.
 */

export function ActionBand() {
  return (
    <section className={`reveal ${classes.band}`}>
      <Container size="var(--content-max)" py="xl">
        <Stack gap="md" align="flex-start">
          <Stack gap="xs">
            <Title order={2}>Try it on a receipt</Title>
            <Text maw="var(--prose-measure)">
              Three fictional receipts sit under the picker, so you can watch the
              arithmetic warning appear without hunting for a flawed receipt of your
              own. Nothing you upload is stored, and no account is asked for.
            </Text>
          </Stack>

          <Group gap="sm">
            <Button component="a" href="#scan" size="md">
              Scan a sample receipt
            </Button>
            <Button
              component="a"
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer noopener"
              variant="default"
              size="md"
            >
              Read the code on GitHub
            </Button>
          </Group>
        </Stack>
      </Container>
    </section>
  );
}
