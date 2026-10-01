"use client";

import { Badge, Group, Stack, Table, Text, Title } from "@mantine/core";
import { fieldRows, needsReview, type FieldRow } from "@/lib/receipt-fields";
import type { Receipt } from "@/lib/receipt-schema";

/**
 * Prints each value as the app holds it. A monetary string keeps its digits and
 * its decimal places, because nothing here reformats, rounds or localizes.
 */
function Value({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <Text component="span" c="dimmed" fs="italic" size="sm">
        absent
      </Text>
    );
  }

  return (
    <Text component="span" ff="monospace" size="sm">
      {value}
    </Text>
  );
}

function Confidence({ row }: { row: FieldRow }) {
  if (row.confidence === null) {
    return (
      <Text component="span" c="dimmed" size="xs">
        no confidence given
      </Text>
    );
  }

  return (
    <Group gap="xs" wrap="nowrap" justify="flex-end">
      <Text component="span" c="dimmed" size="xs" ff="monospace">
        {row.confidence.toFixed(2)}
      </Text>
      {needsReview(row) ? (
        <Badge color="yellow" variant="light" size="xs">
          check this
        </Badge>
      ) : null}
    </Group>
  );
}

export function FieldPanel({ receipt }: { receipt: Receipt }) {
  return (
    <Stack gap="md">
      <Title order={2} size="h5">
        What the model read
      </Title>
      <Table striped withRowBorders={false} verticalSpacing="xs">
        <Table.Tbody>
          {fieldRows(receipt).map((row, index) => (
            <Table.Tr key={`${row.label}-${index}`}>
              <Table.Th scope="row" style={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                {row.label}
              </Table.Th>
              <Table.Td>
                <Value value={row.value} />
              </Table.Td>
              <Table.Td style={{ textAlign: "right" }}>
                <Confidence row={row} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text c="dimmed" size="xs">
        Slice 1 reads these values out. Correcting one of them arrives with inline
        editing in a later slice, and the JSON download carries every confidence and
        source string the model gave.
      </Text>
    </Stack>
  );
}
