import { Container, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { STAT_TILES } from "@/lib/project-facts";
import classes from "./StatTiles.module.css";

/**
 * The figures the app can state today, one per tile.
 *
 * Every figure comes from `lib/project-facts.ts`, which derives each one from the
 * constant the app enforces, so nothing here is typed a second time and
 * `lib/project-facts.test.ts` is what proves the tiles and the code agree. The
 * About page quotes the same list, which is what the baseline means by holding
 * the figures equal across the page, the About page and the README.
 *
 * No accuracy percentage sits here. Measuring the extraction against labelled
 * fixtures is the next slice, and that slice writes the result into all three
 * places in one change.
 *
 * A server component, for the reason `lib/project-facts.ts` records.
 */
export function StatTiles() {
  return (
    <Container size="var(--content-max)" py="xl" component="section" className="reveal">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={2}>What the app reads, and how much of it</Title>
          <Text c="dimmed" maw="var(--prose-measure)">
            Each figure below is read out of the code that enforces it, so a cap that
            changes changes this row with it. Accuracy is not among them yet, because
            nothing has measured it against labelled receipts.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
          {STAT_TILES.map((tile) => (
            <Paper key={tile.id} withBorder radius="md" p="md" className={classes.tile}>
              <Stack gap={4}>
                <Text component="p" className={classes.figure}>
                  {tile.figure}
                </Text>
                <Text fw={600}>{tile.label}</Text>
                <Text size="sm" c="dimmed">
                  {tile.detail}
                </Text>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
