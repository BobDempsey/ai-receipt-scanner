"use client";

import { Alert, Badge, Group, Stack, Table, Text, Title } from "@mantine/core";
import { warningsForField, type ArithmeticWarning } from "@/lib/arithmetic";
import {
  fieldRows,
  itemNeedsReview,
  lineItemRows,
  needsReview,
  readNoLineItems,
  type FieldRow,
  type LineItemRow,
} from "@/lib/receipt-fields";
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
        {row.computed ? "computed" : "no confidence given"}
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

/**
 * The warnings against one row, printed under its value.
 *
 * The wording comes off the warning the arithmetic module composed, so the panel
 * and the JSON download say the same thing about the same gap.
 */
function RowWarnings({ warnings }: { warnings: ArithmeticWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <Stack gap={2} mt={4}>
      {warnings.map((warning) => (
        <Text key={warning.check} c="yellow.8" size="xs" role="status">
          {warning.message}
        </Text>
      ))}
    </Stack>
  );
}

function FlatFields({
  receipt,
  warnings,
}: {
  receipt: Receipt;
  warnings: ArithmeticWarning[];
}) {
  return (
    <Table striped withRowBorders={false} verticalSpacing="xs">
      <Table.Tbody>
        {fieldRows(receipt).map((row, index) => {
          const rowWarnings = row.field ? warningsForField(warnings, row.field) : [];

          return (
            <Table.Tr key={`${row.label}-${index}`}>
              <Table.Th scope="row" style={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                {row.label}
                {row.computed ? (
                  <Badge color="gray" variant="light" size="xs" ml="xs">
                    computed
                  </Badge>
                ) : null}
              </Table.Th>
              <Table.Td>
                <Value value={row.value} />
                {row.note ? (
                  <Text c="dimmed" size="xs" mt={2}>
                    {row.note}
                  </Text>
                ) : null}
                <RowWarnings warnings={rowWarnings} />
              </Table.Td>
              <Table.Td style={{ textAlign: "right" }}>
                <Confidence row={row} />
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

/** One line item, read-only. Correcting a value arrives with inline editing. */
function LineItemRowCells({ row }: { row: LineItemRow }) {
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Value value={row.description.value} />
          {itemNeedsReview(row) ? (
            <Badge color="yellow" variant="light" size="xs">
              check this
            </Badge>
          ) : null}
        </Group>
      </Table.Td>
      <Table.Td style={{ textAlign: "right" }}>
        <Value value={row.quantity.value} />
      </Table.Td>
      <Table.Td style={{ textAlign: "right" }}>
        <Value value={row.unitPrice.value} />
      </Table.Td>
      <Table.Td style={{ textAlign: "right" }}>
        <Value value={row.amount.value} />
      </Table.Td>
    </Table.Tr>
  );
}

function LineItems({ receipt }: { receipt: Receipt }) {
  if (readNoLineItems(receipt)) {
    return (
      <Stack gap="xs">
        <Title order={3} size="h6">
          Line items
        </Title>
        <Text c="dimmed" size="sm">
          The app read no line items off this receipt, so it shows no item total.
          Nothing here says the receipt printed none: a card slip prints a total
          alone, and a long receipt can lose a line to a crease or a fold.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Title order={3} size="h6">
        Line items
      </Title>
      <Table striped withRowBorders={false} verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Description</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Quantity</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Unit price</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Amount</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lineItemRows(receipt).map((row) => (
            <LineItemRowCells key={row.position} row={row} />
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export function FieldPanel({
  receipt,
  warnings,
}: {
  receipt: Receipt;
  warnings: ArithmeticWarning[];
}) {
  return (
    <Stack gap="md">
      <Title order={2} size="h5">
        What the model read
      </Title>

      {warnings.length > 0 ? (
        <Alert color="yellow" title="The arithmetic does not add up">
          <Stack gap="xs">
            {warnings.map((warning) => (
              <Text key={warning.check} size="sm">
                {warning.message}
              </Text>
            ))}
            <Text c="dimmed" size="xs">
              The app changed nothing to close the gap. Every value below is what
              the model read off the receipt.
            </Text>
          </Stack>
        </Alert>
      ) : null}

      <FlatFields receipt={receipt} warnings={warnings} />
      <LineItems receipt={receipt} />

      <Text c="dimmed" size="xs">
        These values are read-only. Correcting one of them arrives with inline
        editing in a later slice, and the JSON download carries every confidence,
        every source string and every warning the app raised.
      </Text>
    </Stack>
  );
}
