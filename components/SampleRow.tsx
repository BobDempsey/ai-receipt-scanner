"use client";

import { Button, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { SAMPLE_RECEIPTS, type SampleReceipt } from "@/lib/samples";

/**
 * The three sample receipts, under the picker.
 *
 * A visitor who arrives with no receipt to hand still has to see the app work,
 * which is what the portfolio baseline asks of a cold load. One press fetches the
 * file and hands it to the same submit an upload uses, so nothing below the
 * picker learns that a sample is different from a file the visitor chose.
 *
 * The row says the three are invented where the visitor reads them, beside the
 * footer each image already carries, because the baseline asks for fictional data
 * labelled as fictional on the page rather than inside the artwork alone.
 */
export type SampleRowProps = {
  /** Loads one sample, which is the same press an upload's extract control is. */
  onPick: (sample: SampleReceipt) => void;
  /** Which sample the app is fetching, so one control alone shows the spinner. */
  loadingId: string | null;
  /** True while an extraction is running, which is when no second press may land. */
  busy: boolean;
};

export function SampleRow({ onPick, loadingId, busy }: SampleRowProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Stack gap={4}>
          <Title order={2} size="h5">
            Or scan one of three samples
          </Title>
          <Text c="dimmed" size="sm" maw="65ch">
            All three receipts are fictional. The merchants, the addresses and the card
            digits belong to no real business and no real card. Press one and the app
            reads it the way it reads a file you pick yourself.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          {SAMPLE_RECEIPTS.map((sample) => (
            <Paper withBorder key={sample.id} p="sm" radius="sm">
              <Stack gap="xs" h="100%" justify="space-between">
                <Stack gap={4}>
                  <Text fw={600} size="sm">
                    {sample.name} (fictional)
                  </Text>
                  <Text c="dimmed" size="xs">
                    {sample.description}
                  </Text>
                </Stack>
                <Button
                  variant="light"
                  size="xs"
                  loading={loadingId === sample.id}
                  disabled={busy && loadingId !== sample.id}
                  onClick={() => onPick(sample)}
                >
                  Scan this sample
                </Button>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
