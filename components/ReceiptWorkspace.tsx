"use client";

import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Button,
  Container,
  FileInput,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { FieldPanel, type CommitEdit, type Rejections } from "./FieldPanel";
import { arithmeticWarnings, type ArithmeticWarning } from "@/lib/arithmetic";
import {
  addLineItem,
  addressKey,
  applyEdit,
  recordEdited,
  remapAddressOnRemove,
  removeLineItem,
  type EditedFields,
} from "@/lib/field-edit";
import { RECEIPT_JSON_FILENAME, receiptToJson } from "@/lib/receipt-json";
import {
  isExtractionError,
  type ExtractionErrorCode,
  type ExtractionResponse,
  type Receipt,
} from "@/lib/receipt-schema";
import classes from "./ReceiptWorkspace.module.css";

/** Which step the workspace is on. The panel on the right renders one of these. */
type Phase = "waiting" | "working" | "result" | "not-a-receipt" | "failed";

/** The copy a visitor reads for each error the route can answer with. */
const FAILURE_COPY: Record<ExtractionErrorCode, { title: string; body: string }> = {
  not_jpeg: {
    title: "This slice reads JPEG photographs",
    body: "Pick a JPEG. PNG, WebP and PDF arrive in a later slice.",
  },
  too_large: {
    title: "That file is too large",
    body: "The app reads files up to 8 MB. Try a smaller photograph of the same receipt.",
  },
  model_call_failed: {
    title: "The extraction did not finish",
    body: "The model did not answer. Try the same file again.",
  },
  validation_failed: {
    title: "The answer did not match the shape the app expects",
    body: "The model's answer did not match the shape the app expects. Try the same file again, or a clearer photograph of the receipt.",
  },
};

export function ReceiptWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  /**
   * The arithmetic warnings, held beside the receipt rather than folded into it,
   * because they are derived in the browser and the Zod schema governs the object
   * they would otherwise sit inside.
   */
  const [warnings, setWarnings] = useState<ArithmeticWarning[]>([]);
  /**
   * Which fields the visitor has typed into, held beside the receipt the way the
   * warnings are, because the Zod schema governs what sits inside the receipt
   * object and a marker about this browser tab is not a fact about the receipt.
   */
  const [edited, setEdited] = useState<EditedFields>([]);
  /** The refusal standing against each field that refused a committed edit. */
  const [rejections, setRejections] = useState<Rejections>({});
  /**
   * One key per line item, used as the React key alone.
   *
   * Keying an item row off its index hands the removed row's draft text to the
   * row that took its place. The key never reaches the receipt and never reaches
   * the download, because it describes this tab rather than the receipt.
   */
  const [itemKeys, setItemKeys] = useState<string[]>([]);
  const [failure, setFailure] = useState<ExtractionErrorCode | null>(null);
  const inFlight = useRef(false);
  const keyCount = useRef(0);

  const freshKeys = useCallback((count: number) => {
    const keys: string[] = [];
    for (let made = 0; made < count; made += 1) {
      keyCount.current += 1;
      keys.push(`item-${keyCount.current}`);
    }
    return keys;
  }, []);

  /**
   * Picking a file replaces the one already chosen rather than queuing a second,
   * and the preview is an object URL over the file the browser already holds. The
   * previous URL is revoked as the new one is made, so nothing accumulates.
   */
  const choose = useCallback((next: File | null) => {
    setPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
    setReceipt(null);
    setWarnings([]);
    setEdited([]);
    setRejections({});
    setItemKeys([]);
    setFailure(null);
    setPhase("waiting");
  }, []);

  /**
   * Sends the chosen file once per press. Nothing here retries on its own: a
   * failure waits for the visitor to press the control again.
   */
  const extract = useCallback(async () => {
    if (!file || inFlight.current) {
      return;
    }

    inFlight.current = true;
    setPhase("working");
    setReceipt(null);
    setWarnings([]);
    setEdited([]);
    setRejections({});
    setItemKeys([]);
    setFailure(null);

    try {
      const form = new FormData();
      form.set("file", file);

      const response = await fetch("/api/extract", { method: "POST", body: form });
      const body = (await response.json()) as ExtractionResponse;

      if (isExtractionError(body)) {
        setFailure(body.error.code);
        setPhase("failed");
        return;
      }

      setReceipt(body);
      // The checks run here, on what the browser already holds. No second request
      // leaves the page to produce a warning.
      setWarnings(body.isReceipt ? arithmeticWarnings(body) : []);
      setItemKeys(freshKeys((body.lineItems ?? []).length));
      setPhase(body.isReceipt ? "result" : "not-a-receipt");
    } catch {
      setFailure("model_call_failed");
      setPhase("failed");
    } finally {
      inFlight.current = false;
    }
  }, [file, freshKeys]);

  /**
   * Takes one committed edit, or refuses it.
   *
   * An accepted edit sets the receipt, the edited list and the warnings together
   * in one pass, so no render shows a receipt beside warnings computed from an
   * earlier one. A refused edit records the refusal and touches nothing else,
   * which is what leaves every warning as it was. Both paths compute every
   * warning from state the browser already holds and send no request.
   */
  const commit = useCallback<CommitEdit>(
    (address, text) => {
      if (!receipt) {
        return false;
      }

      const key = addressKey(address);
      const result = applyEdit(receipt, address, text);

      if (!result.accepted) {
        setRejections((standing) => ({
          ...standing,
          [key]: `The app did not take "${text}". ${result.rejection.message}`,
        }));
        return false;
      }

      setReceipt(result.receipt);
      setEdited((recorded) => recordEdited(recorded, address));
      setWarnings(arithmeticWarnings(result.receipt));
      setRejections((standing) => {
        if (!(key in standing)) {
          return standing;
        }
        const next = { ...standing };
        delete next[key];
        return next;
      });

      return true;
    },
    [receipt],
  );

  /** Adds an empty item, then runs the same recheck a committed edit runs. */
  const addItem = useCallback(() => {
    if (!receipt) {
      return;
    }

    const change = addLineItem(receipt, edited);
    setReceipt(change.receipt);
    setEdited(change.edited);
    setWarnings(arithmeticWarnings(change.receipt));
    setItemKeys((keys) => [...keys, ...freshKeys(1)]);
  }, [receipt, edited, freshKeys]);

  /**
   * Removes one item, follows the recorded edits and the standing refusals
   * through the index shift, and runs the same recheck.
   */
  const removeItem = useCallback(
    (index: number) => {
      if (!receipt) {
        return;
      }

      const change = removeLineItem(receipt, index, edited);
      setReceipt(change.receipt);
      setEdited(change.edited);
      setWarnings(arithmeticWarnings(change.receipt));
      setItemKeys((keys) => keys.filter((_, position) => position !== index));
      setRejections((standing) => {
        const next: Rejections = {};
        for (const [key, message] of Object.entries(standing)) {
          const moved = remapAddressOnRemove(key, index);
          if (moved !== null) {
            next[moved] = message;
          }
        }
        return next;
      });
    },
    [receipt, edited],
  );

  const download = useCallback(() => {
    if (!receipt) {
      return;
    }

    const blob = new Blob([receiptToJson(receipt, warnings, edited)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = RECEIPT_JSON_FILENAME;
    link.click();
    URL.revokeObjectURL(url);
  }, [receipt, warnings, edited]);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={1} className={classes.headline}>
            Read a receipt into fields you can keep
          </Title>
          <Text c="dimmed" maw="65ch">
            Pick a photograph of a receipt. One model call reads it into typed
            fields and its line items, the app checks the answer against its own
            schema and its own arithmetic, and you correct any value in place.
            The app rechecks the arithmetic on every correction, and the JSON
            download carries the values you have, the warnings and the fields you
            typed.
          </Text>
        </Stack>

        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group align="flex-end" gap="sm" wrap="wrap">
              <FileInput
                accept="image/jpeg"
                label="Receipt photograph"
                placeholder="Choose a JPEG"
                value={file}
                onChange={choose}
                clearable
                className={classes.picker}
              />
              <Button onClick={extract} disabled={!file || phase === "working"}>
                Extract the fields
              </Button>
            </Group>
            <Text c="dimmed" size="sm" maw="65ch">
              The app keeps nothing. Your upload lives in memory for the length of
              the request and reaches no disk and no database, and the result lives
              in this browser tab until you close it.
            </Text>
          </Stack>
        </Paper>

        <div className={classes.panes}>
          <Paper withBorder radius="md" p="md" className={classes.documentPane}>
            <Stack gap="sm" h="100%">
              <Title order={2} size="h5">
                The receipt
              </Title>
              {previewUrl ? (
                // The file never leaves the browser until the visitor asks for an
                // extraction, so a plain img over the object URL is the whole job.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="The receipt photograph you chose"
                  className={classes.preview}
                />
              ) : (
                <Text c="dimmed" size="sm">
                  Nothing chosen yet. The photograph you pick appears here.
                </Text>
              )}
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md" className={classes.fieldPane}>
            {phase === "waiting" ? (
              <Stack gap="xs">
                <Title order={2} size="h5">
                  Waiting for a receipt
                </Title>
                <Text c="dimmed" size="sm">
                  Pick a JPEG and press extract. The fields appear here.
                </Text>
              </Stack>
            ) : null}

            {phase === "working" ? (
              <Group gap="sm">
                <Loader size="sm" />
                <Text size="sm">Reading the receipt. One model call, no retries.</Text>
              </Group>
            ) : null}

            {phase === "result" && receipt ? (
              <Stack gap="md">
                <FieldPanel
                  receipt={receipt}
                  warnings={warnings}
                  edited={edited}
                  rejections={rejections}
                  onCommit={commit}
                  onAddItem={addItem}
                  onRemoveItem={removeItem}
                  itemKeys={itemKeys}
                />
                <Stack gap="xs">
                  <Group>
                    <Button variant="light" onClick={download}>
                      Download the JSON
                    </Button>
                  </Group>
                  <Text c="dimmed" size="xs" maw="65ch">
                    Your corrections live in this browser tab and the app stores
                    nothing, so a reload loses the receipt and its edits together.
                    The download is how you keep a corrected receipt.
                  </Text>
                </Stack>
              </Stack>
            ) : null}

            {phase === "not-a-receipt" && receipt ? (
              <Alert color="yellow" title="This does not look like a receipt">
                <Stack gap="xs">
                  <Text size="sm">{receipt.reason ?? "The model gave no reason."}</Text>
                  <Text c="dimmed" size="sm">
                    No fields were read, so there is nothing to show or export.
                  </Text>
                </Stack>
              </Alert>
            ) : null}

            {phase === "failed" && failure ? (
              <Alert color="red" title={FAILURE_COPY[failure].title}>
                <Stack align="flex-start" gap="sm">
                  <Text size="sm">{FAILURE_COPY[failure].body}</Text>
                  <Button variant="light" color="red" onClick={extract} disabled={!file}>
                    Try the same file again
                  </Button>
                </Stack>
              </Alert>
            ) : null}
          </Paper>
        </div>
      </Stack>
    </Container>
  );
}
