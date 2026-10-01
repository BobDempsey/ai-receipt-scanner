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
import { FieldPanel } from "./FieldPanel";
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
  const [failure, setFailure] = useState<ExtractionErrorCode | null>(null);
  const inFlight = useRef(false);

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
      setPhase(body.isReceipt ? "result" : "not-a-receipt");
    } catch {
      setFailure("model_call_failed");
      setPhase("failed");
    } finally {
      inFlight.current = false;
    }
  }, [file]);

  const download = useCallback(() => {
    if (!receipt) {
      return;
    }

    const blob = new Blob([receiptToJson(receipt)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = RECEIPT_JSON_FILENAME;
    link.click();
    URL.revokeObjectURL(url);
  }, [receipt]);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={1} className={classes.headline}>
            Read a receipt into fields you can keep
          </Title>
          <Text c="dimmed" maw="65ch">
            Pick a photograph of a receipt. One model call reads it into typed
            fields, the app checks the answer against its own schema, and the JSON
            download carries what the model gave with the confidence it gave it.
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
                <FieldPanel receipt={receipt} />
                <Group>
                  <Button variant="light" onClick={download}>
                    Download the JSON
                  </Button>
                </Group>
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
