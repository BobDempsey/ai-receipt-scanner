import { Container, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { ACCURACY_RUN, STAT_TILES } from "@/lib/project-facts";
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
 * The first three tiles are measured rather than read off a constant. The copy
 * above the grid names the run date, the model and the report, and each measured
 * tile says what the set was, because a percentage with no run behind it is what
 * the accuracy spec forbids. Six tiles sit as two rows of three; the figures that
 * came out of the row are still in the About page table and in the README.
 *
 * A server component, for the reason `lib/project-facts.ts` records.
 */
export function StatTiles() {
  return (
    <Container size="var(--content-max)" py="xl" component="section" className="reveal">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={2}>What the app reads, and how often it reads it right</Title>
          <Text c="dimmed" maw="var(--prose-measure)">
            The first three figures were measured on {ACCURACY_RUN.runDate} against{" "}
            {ACCURACY_RUN.model}, over {ACCURACY_RUN.fixtureCount} labelled fixtures, and the
            run is written down fixture by fixture in {ACCURACY_RUN.report}. Each tile says
            what the set was. The other three are read out of the code that enforces them, so
            a cap that changes changes this row with it.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing="md">
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
