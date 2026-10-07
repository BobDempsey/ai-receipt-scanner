"use client";

import type { KeyboardEvent } from "react";
import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import type { StoredReceipt } from "@/lib/session-store";
import classes from "./SessionTable.module.css";

/**
 * Reports which stored receipt the visitor picked.
 *
 * The table reports an id and nothing else, the way `FieldPanel` reports a
 * focused field: the workspace holds which record is open and feeds the panes
 * from it, so a reopened receipt and a just-extracted one are the same state.
 */
export type SelectReceipt = (id: string) => void;

/** What the visitor pressed, so the workspace can say which copy it answered. */
export type CopyNote = { ok: boolean; message: string } | null;

type SessionTableProps = {
  /** Newest first, which is the order `listSessionReceipts` already answers in. */
  records: readonly StoredReceipt[];
  /** The record on screen, so its row reads as the open one. */
  openId: string | null;
  onSelect: SelectReceipt;
  onDownloadJson: () => void;
  onCopyJson: () => void;
  onDownloadCsv: () => void;
  onCopyCsv: () => void;
  copyNote: CopyNote;
};

/** A row's date and total read as the receipt holds them, or as a dash when absent. */
function cell(value: string | null): string {
  return value ?? "—";
}

export function SessionTable({
  records,
  openId,
  onSelect,
  onDownloadJson,
  onCopyJson,
  onDownloadCsv,
  onCopyCsv,
  copyNote,
}: SessionTableProps) {
  // A table of no rows tells a visitor nothing, so an empty session shows no
  // list at all rather than a header over empty space.
  if (records.length === 0) {
    return null;
  }

  const count = records.length;
  /** How many receipts the batch controls carry, named on every one of them. */
  const naming = count === 1 ? "1 receipt" : `all ${count} receipts`;

  const open = (id: string) => () => onSelect(id);

  const openOnEnter = (id: string) => (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Stack gap="xs">
          <Title order={2} size="h5">
            This session&apos;s receipts
          </Title>
          <Text c="dimmed" size="sm" maw="65ch">
            This browser holds {count === 1 ? "1 receipt" : `${count} receipts`} from this session.
            They survive a reload and end when you close the tab, and nothing about them reaches the
            server. Pick a row to open that receipt in the panes above.
          </Text>
        </Stack>

        <Table.ScrollContainer minWidth={480}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Merchant</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th>Arithmetic</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {records.map((record) => {
                const warned = record.warnings.length > 0;
                const isOpen = record.id === openId;

                return (
                  <Table.Tr
                    key={record.id}
                    // The row itself takes focus, so a click and a keyboard tab
                    // reach the same target and Enter opens what the ring marks.
                    tabIndex={0}
                    aria-current={isOpen ? "true" : undefined}
                    aria-label={`Open the receipt from ${cell(record.receipt.merchant)} dated ${cell(
                      record.receipt.date,
                    )}${warned ? ", which carries an arithmetic warning" : ""}`}
                    className={isOpen ? `${classes.row} ${classes.openRow}` : classes.row}
                    onClick={open(record.id)}
                    onKeyDown={openOnEnter(record.id)}
                  >
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm">{cell(record.receipt.merchant)}</Text>
                        {isOpen ? (
                          <Badge size="xs" variant="light">
                            open
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>{cell(record.receipt.date)}</Table.Td>
                    <Table.Td ta="right">
                      {cell(record.receipt.total)}
                      {record.receipt.currency ? ` ${record.receipt.currency}` : ""}
                    </Table.Td>
                    <Table.Td>
                      {warned ? (
                        <Badge
                          color="yellow"
                          variant="light"
                          size="sm"
                          classNames={{
                            root: classes.warningBadge,
                            label: classes.warningBadgeLabel,
                          }}
                        >
                          {record.warnings.length === 1
                            ? "1 warning, still wants checking"
                            : `${record.warnings.length} warnings, still wants checking`}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          checks passed
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        <Stack gap="xs">
          <Group gap="sm" wrap="wrap">
            <Button variant="light" onClick={onDownloadJson}>
              Download {naming} as JSON
            </Button>
            <Button variant="subtle" onClick={onCopyJson}>
              Copy {naming} as JSON
            </Button>
            <Button variant="light" onClick={onDownloadCsv}>
              Download {naming} as CSV
            </Button>
            <Button variant="subtle" onClick={onCopyCsv}>
              Copy {naming} as CSV
            </Button>
          </Group>
          {copyNote ? (
            <Text role="status" size="xs" c={copyNote.ok ? "teal" : "red"} maw="65ch">
              {copyNote.message}
            </Text>
          ) : null}
          <Text c="dimmed" size="xs" maw="65ch">
            The batch files carry every receipt above, in this order. The CSV gives one row per line
            item with the receipt fields repeated, and its tax columns are sized to the widest
            receipt in the file. The JSON is the one place each field&apos;s confidence and the text
            the model read it from survive.
          </Text>
        </Stack>
      </Stack>
    </Paper>
  );
}
