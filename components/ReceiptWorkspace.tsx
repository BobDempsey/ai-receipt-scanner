"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type FieldAddress,
} from "@/lib/field-edit";
import { sourceTextFor } from "@/lib/field-source";
import { buildRegionMap, regionFor } from "@/lib/highlight-match";
import { PdfPageError, readFirstPage, type PdfFailureReason } from "@/lib/pdf-page";
import { RECEIPT_JSON_FILENAME, receiptToJson } from "@/lib/receipt-json";
import {
  isExtractionError,
  type ExtractionErrorCode,
  type ExtractionResponse,
  type Receipt,
} from "@/lib/receipt-schema";
import { createOcrPass, type Measurement, type OcrPass } from "@/lib/word-boxes";
import classes from "./ReceiptWorkspace.module.css";

/** Which step the workspace is on. The panel on the right renders one of these. */
type Phase = "waiting" | "working" | "result" | "not-a-receipt" | "failed";

/**
 * Which step the measuring pass is on, held apart from `Phase`.
 *
 * The two passes run from one press and finish in either order, so a single union
 * would need a state per pair. The fields never wait on this one: `measuring`
 * says the regions are not ready yet and nothing else on screen changes.
 */
type OcrPhase = "idle" | "measuring" | "ready" | "failed";

/**
 * Which step the rasterize is on, held apart from `Phase` the way `OcrPhase` is.
 *
 * A PDF takes one step the image path does not: the first page becomes a bitmap
 * before the extraction request leaves and before the measuring pass starts,
 * because both of them read that bitmap. The visitor reads that step by name
 * rather than watching the extraction's working message sit there longer.
 */
type PdfPhase = "idle" | "reading" | "ready" | "failed";

/** The MIME type of a PDF, which the page accepts and the route does not. */
const PDF_TYPE = "application/pdf";

/**
 * What the file dialog offers.
 *
 * The four types are written out here rather than imported from
 * `lib/extract-receipt.ts`, because that module imports the OpenAI SDK and a
 * client component importing it would pull the SDK into the browser bundle. The
 * route's own list is the three image types; this one adds the PDF the page
 * rasterizes before it posts.
 */
const PICKER_ACCEPT = `image/jpeg,image/png,image/webp,${PDF_TYPE}`;

/**
 * The copy a visitor reads for each way reading a page out of a PDF can fail.
 *
 * The three are worded apart because the visitor's next move differs: a damaged
 * file is worth picking again, a file whose first page holds nothing readable
 * wants a different page or a photograph, and a locked file wants the password
 * taken off first. All three say the app could not read a page from that file,
 * and all three sit beside the control that tries the same file again.
 */
const PDF_FAILURE_COPY: Record<PdfFailureReason, { title: string; body: string }> = {
  unreadable: {
    title: "The app could not read a page from that file",
    body: "The PDF library could not open it, which usually means the file is damaged or only part of it arrived. Try the same file again, or pick a photograph of the receipt.",
  },
  no_page: {
    title: "The app could not read a page from that file",
    body: "That PDF opened, and its first page carries nothing the app can read. Pick a PDF whose first page holds the receipt, or a photograph of it.",
  },
  protected: {
    title: "That PDF is password-protected",
    body: "The app could not read a page from that file, because a password locks it. Take the password off and pick the file again, or upload a photograph of the receipt.",
  },
};

/** The two sentences the panel prints when the selected field has no region. */
const NO_REGION_COPY = {
  /** The receipt printed nothing to find, so no match was ever attempted. */
  absent: "The receipt printed no value here, so there is nothing on the image to mark.",
  /** The model quoted text the pass could not find, which is the honest failure. */
  unmatched: "The app could not find this text on the image, so it marked no region.",
} as const;

/** The copy a visitor reads for each error the route can answer with. */
const FAILURE_COPY: Record<ExtractionErrorCode, { title: string; body: string }> = {
  unsupported_type: {
    title: "The app does not read that file type",
    body: "Pick a JPEG, PNG or WebP image, or a PDF receipt.",
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
  /**
   * Which field the visitor has reached, which is what asks for a region.
   *
   * One address at a time, so nothing on the image claims two fields were read
   * from the same words. The computed line item total carries no address, so
   * reaching it selects nothing.
   */
  const [selected, setSelected] = useState<FieldAddress | null>(null);
  const [ocrPhase, setOcrPhase] = useState<OcrPhase>("idle");
  const [pdfPhase, setPdfPhase] = useState<PdfPhase>("idle");
  /** Why the app could not read a page out of the chosen PDF. */
  const [pdfFailure, setPdfFailure] = useState<PdfFailureReason | null>(null);
  /**
   * How many pages the chosen PDF holds, so the pane can say it read one of four.
   *
   * Null for an image and for a PDF nobody has read yet. A single-page PDF sets
   * it to 1 and the notice stays off, because the app left nothing out.
   */
  const [pageCount, setPageCount] = useState<number | null>(null);
  /** What the pass measured: the text lines and the image's natural pixel size. */
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const inFlight = useRef(false);
  const keyCount = useRef(0);
  /**
   * The first page of the chosen PDF, held so nothing rasterizes it twice.
   *
   * One press reads the page once and three consumers read the result: the
   * preview, the posted file and the measuring pass. Pressing the control again
   * after a failed extraction reuses the same page rather than parsing the bytes
   * a second time. The entry names the file it came from, so picking another PDF
   * cannot be answered with the previous one's page.
   */
  const rasterized = useRef<{
    readonly source: File;
    readonly page: File;
    readonly pageCount: number;
    readonly measurement: Measurement | null;
  } | null>(null);
  const pass = useRef<OcrPass | null>(null);
  /**
   * Which measuring run the workspace is still listening to.
   *
   * A visitor who picks a second file while the first is measuring gets the
   * second file's regions or none, never the first file's. The count rises on
   * every file change and every press, and a run whose token has moved on writes
   * nothing.
   */
  const measureRun = useRef(0);

  /** Ends the running pass, so no second worker survives a file change. */
  const stopPass = useCallback(() => {
    const running = pass.current;
    pass.current = null;
    if (running) {
      void running.terminate();
    }
  }, []);

  // The worker outlives a render but not the workspace, so leaving the page ends it.
  useEffect(() => stopPass, [stopPass]);

  /**
   * The region of every field, derived from the receipt and the measured lines.
   *
   * Derived rather than held in state, so a line item add or remove rebuilds the
   * map from the receipt that now exists. Storing it would make it a third thing
   * to follow through the index shift, beside the edited list and the standing
   * refusals that `remapAddressOnRemove` follows.
   */
  const regions = useMemo(
    () => (receipt && measurement ? buildRegionMap(receipt, measurement.lines) : null),
    [receipt, measurement],
  );

  const selectedRegion = selected && regions ? regionFor(regions, selected) : null;

  /**
   * The sentence under the selected field, on the two absent cases.
   *
   * A field with a region gets none, because the mark on the image already says
   * where the value came from. The two absent cases are worded apart so an
   * absent mark reads as an answer rather than as a pane that failed to draw.
   * Neither sentence appears while the pass is still running or after it failed:
   * the document pane says so once for the whole image instead.
   */
  const selectionNote = useMemo(() => {
    if (!receipt || !selected || ocrPhase !== "ready" || !regions) {
      return null;
    }
    if (regionFor(regions, selected) !== null) {
      return null;
    }

    return {
      key: addressKey(selected),
      message:
        sourceTextFor(receipt, selected) === null
          ? NO_REGION_COPY.absent
          : NO_REGION_COPY.unmatched,
    };
  }, [receipt, selected, ocrPhase, regions]);

  const freshKeys = useCallback((count: number) => {
    const keys: string[] = [];
    for (let made = 0; made < count; made += 1) {
      keyCount.current += 1;
      keys.push(`item-${keyCount.current}`);
    }
    return keys;
  }, []);

  /**
   * Replaces the preview with an object URL over `next`, or clears it.
   *
   * The previous URL is revoked as the new one is made, so a visitor who picks
   * six files in a row leaves one URL alive rather than six. A PDF reaches this
   * as its rasterized page, never as the PDF itself, because a plain `img` over
   * a PDF renders a broken image.
   */
  const showPreview = useCallback((next: Blob | null) => {
    setPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return next ? URL.createObjectURL(next) : null;
    });
  }, []);

  /**
   * Picking a file replaces the one already chosen rather than queuing a second,
   * and the preview is an object URL over the file the browser already holds. A
   * PDF gets no preview yet: its first page becomes an image on submit, and the
   * pane says so in the meantime.
   */
  const choose = useCallback(
    (next: File | null) => {
      stopPass();
      measureRun.current += 1;
      rasterized.current = null;
      showPreview(next && next.type !== PDF_TYPE ? next : null);
      setFile(next);
      setPdfPhase("idle");
      setPdfFailure(null);
      setPageCount(null);
      setReceipt(null);
      setWarnings([]);
      setEdited([]);
      setRejections({});
      setItemKeys([]);
      setFailure(null);
      setPhase("waiting");
      setSelected(null);
      setMeasurement(null);
      setOcrPhase("idle");
    },
    [stopPass, showPreview],
  );

  /**
   * Measures the chosen image beside the model call.
   *
   * The pass runs from the same press rather than before it, so the slower of the
   * two sets the wait instead of their sum, and it writes nothing the fields wait
   * on. The worker ends as soon as the run finishes, which is what keeps one
   * worker alive at a time.
   */
  const measure = useCallback(
    (image: File) => {
      stopPass();
      measureRun.current += 1;
      const run = measureRun.current;

      setMeasurement(null);
      setOcrPhase("measuring");

      const running = createOcrPass();
      pass.current = running;

      running
        .measure(image)
        .then((measured) => {
          if (measureRun.current !== run) {
            return;
          }
          setMeasurement(measured);
          setOcrPhase("ready");
        })
        .catch(() => {
          if (measureRun.current !== run) {
            return;
          }
          setOcrPhase("failed");
        })
        .finally(() => {
          if (pass.current === running) {
            pass.current = null;
            void running.terminate();
          }
        });
    },
    [stopPass],
  );

  /**
   * Takes word boxes the app already has, which is the PDF text layer path.
   *
   * A page that carried its own text has exact coordinates in the rasterized
   * page's pixels, so no OCR pass runs and the regions are ready as soon as the
   * page is. The run token still moves, so a pass left over from an earlier file
   * cannot write over this measurement.
   */
  const holdMeasurement = useCallback(
    (measured: Measurement) => {
      stopPass();
      measureRun.current += 1;
      setMeasurement(measured);
      setOcrPhase("ready");
    },
    [stopPass],
  );

  /**
   * Reads the first page of a PDF into an image, once per chosen file.
   *
   * Both the extraction request and the word boxes read that image, so the step
   * runs before either of them and its result is held for the rest of the file's
   * life. A `PdfPageError` comes back as the reason rather than as a throw, and
   * the caller turns it into the failure the visitor reads.
   */
  const readPdfPage = useCallback(
    async (source: File) => {
      const held = rasterized.current;

      if (held && held.source === source) {
        setPdfPhase("ready");
        return held;
      }

      setPdfPhase("reading");
      setPdfFailure(null);

      try {
        const page = await readFirstPage(source);
        const entry = {
          source,
          page: new File([page.image], `${source.name.replace(/\.pdf$/i, "")}-page-1.png`, {
            type: "image/png",
          }),
          pageCount: page.pageCount,
          measurement: page.measurement,
        };

        rasterized.current = entry;
        setPageCount(page.pageCount);
        showPreview(entry.page);
        setPdfPhase("ready");

        return entry;
      } catch (cause) {
        setPdfFailure(cause instanceof PdfPageError ? cause.reason : "unreadable");
        setPdfPhase("failed");

        return null;
      }
    },
    [showPreview],
  );

  /**
   * Sends the chosen file once per press. Nothing here retries on its own: a
   * failure waits for the visitor to press the control again.
   *
   * A PDF takes one step first: its first page is rasterized, and the image that
   * comes back is what the request carries, what the pane shows and what the word
   * boxes describe. A page the app cannot read ends the press there, with no
   * request sent. An image goes straight to the two passes the way it always has.
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
    setSelected(null);

    try {
      /** The image every later step reads: the file itself, or the page read out of it. */
      let image = file;

      if (file.type === PDF_TYPE) {
        const read = await readPdfPage(file);

        if (!read) {
          setPhase("failed");
          return;
        }

        image = read.page;

        // The text layer, when the page carried one, is already in this page's
        // pixels, so the OCR pass runs only on a page that yielded no words.
        if (read.measurement) {
          holdMeasurement(read.measurement);
        } else {
          measure(image);
        }
      } else {
        // Both passes start from this one press. The measuring runs beside the
        // request rather than after it, and the fields land whenever they land.
        measure(image);
      }

      const form = new FormData();
      form.set("file", image);

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
  }, [file, freshKeys, measure, readPdfPage, holdMeasurement]);

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
      // An item address names a position rather than a row, so the selection a
      // visitor made before the shift would mark another row's words. The region
      // map needs no such follow: it is derived from the receipt that now exists.
      if (selected?.kind === "item") {
        setSelected(null);
      }
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
    [receipt, edited, selected],
  );

  const mark = useRef<HTMLDivElement | null>(null);

  /**
   * Brings a marked region into view when it sits outside the scrolled pane.
   *
   * `block: "nearest"` scrolls only as far as it has to, so a region already on
   * screen moves nothing. The mark itself is the thing scrolled to, which is why
   * this reads a ref rather than measuring the image.
   */
  useEffect(() => {
    if (selectedRegion && mark.current) {
      mark.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selectedRegion]);

  /**
   * The failure the alert prints, from whichever step failed.
   *
   * A PDF whose first page the app could not read failed before the request went
   * out, so it carries a reason rather than one of the route's error codes. Both
   * end in the same alert beside the same try-again control.
   */
  const failureCopy = pdfFailure
    ? PDF_FAILURE_COPY[pdfFailure]
    : failure
      ? FAILURE_COPY[failure]
      : null;

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
            Pick a photograph of a receipt, or a PDF of one. One model call reads it into typed
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
                accept={PICKER_ACCEPT}
                label="Receipt photograph or PDF"
                placeholder="Choose a JPEG, PNG, WebP or PDF"
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
              {pdfPhase === "reading" ? (
                <Group gap="sm" wrap="nowrap">
                  <Loader size="xs" />
                  <Text size="sm">
                    Reading the first page of that PDF into an image. The extraction starts once
                    that page is an image, because the model and the measuring pass both read it.
                  </Text>
                </Group>
              ) : null}

              {pageCount !== null && pageCount > 1 ? (
                <Text size="sm" c="dimmed">
                  The app read the first page of {pageCount}. Nothing printed on the other pages
                  reached the fields.
                </Text>
              ) : null}

              {ocrPhase === "measuring" ? (
                <Group gap="sm" wrap="nowrap">
                  <Loader size="xs" />
                  <Text size="sm">
                    Measuring the image so a field can point at the words it was read from. The
                    fields arrive and take corrections while this runs.
                  </Text>
                </Group>
              ) : null}

              {ocrPhase === "failed" ? (
                <Text size="sm" c="dimmed">
                  The app could not measure this image, so it marks no regions on the photograph.
                  The fields, the arithmetic and the download all still work.
                </Text>
              ) : null}

              {previewUrl ? (
                <div className={classes.scroller}>
                  <div className={classes.document}>
                    {/* The file never leaves the browser until the visitor asks for
                        an extraction, so a plain img over the object URL is the
                        whole job. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={
                        file?.type === PDF_TYPE
                          ? "The first page of the PDF you chose"
                          : "The receipt photograph you chose"
                      }
                      className={classes.preview}
                    />
                    {selectedRegion && measurement ? (
                      // The four positions are percentages of the measured natural
                      // size, so the browser rescales the mark with the image and
                      // the app needs no resize listener and no second pass. The
                      // mark is aria-hidden because the panel says in words what it
                      // shows.
                      <div
                        aria-hidden
                        className={classes.mark}
                        style={{
                          left: `${(selectedRegion.left / measurement.naturalWidth) * 100}%`,
                          top: `${(selectedRegion.top / measurement.naturalHeight) * 100}%`,
                          width: `${(selectedRegion.width / measurement.naturalWidth) * 100}%`,
                          height: `${(selectedRegion.height / measurement.naturalHeight) * 100}%`,
                        }}
                        ref={mark}
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <Text c="dimmed" size="sm">
                  {file?.type === PDF_TYPE
                    ? "The first page of that PDF appears here once the extraction starts, because the app reads it into an image first."
                    : "Nothing chosen yet. The photograph you pick appears here."}
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
                  Pick a receipt file and press extract. The fields appear here.
                </Text>
              </Stack>
            ) : null}

            {phase === "working" ? (
              <Group gap="sm">
                <Loader size="sm" />
                <Text size="sm">
                  {pdfPhase === "reading"
                    ? "Reading the first page of the PDF. The model call goes out once that page is an image."
                    : "Reading the receipt. One model call, no retries."}
                </Text>
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
                  onSelect={setSelected}
                  selectionNote={selectionNote}
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

            {phase === "failed" && failureCopy ? (
              <Alert color="red" title={failureCopy.title}>
                <Stack align="flex-start" gap="sm">
                  <Text size="sm">{failureCopy.body}</Text>
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
