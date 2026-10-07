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
import { fitForUpload } from "@/lib/downscale";
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
import { receiptsToCsv } from "@/lib/receipt-csv";
import {
  RECEIPT_CSV_FILENAME,
  RECEIPT_JSON_FILENAME,
  SESSION_CSV_FILENAME,
  SESSION_JSON_FILENAME,
  receiptToJson,
  receiptsToJson,
} from "@/lib/receipt-json";
import {
  isExtractionError,
  type ExtractionErrorCode,
  type ExtractionResponse,
  type Receipt,
} from "@/lib/receipt-schema";
import { SAMPLES_PATH_PREFIX, type SampleReceipt } from "@/lib/samples";
import {
  SESSION_EXTRACTION_CAP,
  countExtraction,
  sessionCapReached,
} from "@/lib/session-count";
import {
  listSessionReceipts,
  newStoredReceipt,
  putReceipt,
  type StoredReceipt,
} from "@/lib/session-store";
import { createOcrPass, type Measurement, type OcrPass } from "@/lib/word-boxes";
import { SampleRow } from "./SampleRow";
import { SessionTable, type CopyNote } from "./SessionTable";
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

/**
 * What the document pane says for a receipt reopened from the session table.
 *
 * The app stores no upload, so there is no picture to show and nothing to
 * measure. The wording stays apart from `NO_REGION_COPY.unmatched`, because a
 * missing picture is a different fact from text the pass could not find on one.
 */
const NO_IMAGE_COPY =
  "The app kept no picture of this receipt, because it stores no upload. The fields, the arithmetic and the exports all work on it, and nothing marks a region, because there is no image to mark.";

/**
 * Which set of controls a clipboard answer belongs to.
 *
 * The receipt on screen and the whole session each carry their own copy
 * controls, so the confirmation prints beside the control the visitor pressed
 * rather than once for both.
 */
type CopyPlace = "receipt" | "session";

/**
 * The hourly allowance, written here rather than imported.
 *
 * `lib/rate-limit.ts` holds `IP_HOURLY_LIMIT` and imports the Upstash client, so
 * a client component importing it would pull that SDK into the browser bundle.
 * The same reasoning keeps `PICKER_ACCEPT` written out above. The two numbers
 * have to be changed together.
 */
const IP_HOURLY_LIMIT = 20;

/**
 * What a visitor reads when the app will not run an extraction.
 *
 * `retry` says whether the alert offers the control that sends the same file
 * again. A refusal that would only be refused again offers none, which is why
 * both caps carry false: pressing a dead control teaches a visitor nothing.
 */
type Refusal = { title: string; body: string; retry: boolean };

/** The copy a visitor reads for each code the app can refuse an upload with. */
const FAILURE_COPY: Record<ExtractionErrorCode, Refusal> = {
  unsupported_type: {
    title: "The app does not read that file type",
    body: "Pick a JPEG, PNG or WebP image, or a PDF receipt.",
    retry: true,
  },
  too_large: {
    title: "That file is too large",
    body: "The app reads files up to 8 MB. Try a smaller photograph of the same receipt.",
    retry: true,
  },
  model_call_failed: {
    title: "The extraction did not finish",
    body: "The model did not answer. Try the same file again.",
    retry: true,
  },
  validation_failed: {
    title: "The answer did not match the shape the app expects",
    body: "The model's answer did not match the shape the app expects. Try the same file again, or a clearer photograph of the receipt.",
    retry: true,
  },
  rate_limited: {
    title: `This address has used its ${IP_HOURLY_LIMIT} extractions for the hour`,
    body: `The app runs ${IP_HOURLY_LIMIT} extractions an hour for each network address, and everyone behind this address shares that allowance. The app checked the limit before it called the model, so this upload reached no model and cost you nothing.`,
    retry: false,
  },
  session_cap_reached: {
    title: `This session has used its ${SESSION_EXTRACTION_CAP} extractions`,
    body: `The app runs ${SESSION_EXTRACTION_CAP} extractions per browser session, and this session has spent all ${SESSION_EXTRACTION_CAP}. Open the app in a new tab to start a new session. The receipts below stay readable, correctable and exportable either way.`,
    retry: false,
  },
};

/**
 * The store-outage wording, which arrives as `rate_limited` with no reset time.
 *
 * A refusal carrying a reset time means the address spent its allowance. A
 * refusal carrying none means the counter the app keeps that allowance in did
 * not answer, so the app refused rather than running the extraction uncounted.
 * Trying again in a minute is honest advice for an outage and would be a lie for
 * a spent allowance, which is why the two are worded apart and only this one
 * offers the control.
 */
const LIMITER_OUTAGE_COPY: Refusal = {
  title: "The app could not check its own hourly limit",
  body: "The counter the app keeps its hourly limit in did not answer, so it refused this upload rather than running an extraction it could not count. Nothing reached the model. Try again in a minute.",
  retry: true,
};

/** Refusals the browser makes on its own, which no route code names. */
type LocalRefusalCode = "body_too_large" | "sample_unavailable";

const LOCAL_REFUSAL_COPY: Record<LocalRefusalCode, Refusal> = {
  /**
   * Worded apart from the 8 MB `too_large` above, because the cap it failed is a
   * different one: this file is inside the 8 MB the app accepts and outside the
   * request body the host will carry, even after the browser reduced it.
   */
  body_too_large: {
    title: "That image is too large to send, even reduced",
    body: "The app reduced the image as far as it will go and the request is still larger than the host carries. Try a photograph cropped to the receipt itself, or one your camera took at a lower resolution.",
    retry: false,
  },
  sample_unavailable: {
    title: "The app could not load that sample",
    body: "The sample file did not arrive, so nothing was sent. Press it again, or pick a receipt of your own.",
    retry: false,
  },
};

/**
 * The reset time in the visitor's own zone.
 *
 * The route sends epoch milliseconds rather than a sentence, so the time reads
 * as the clock on the visitor's wall. The zone name is printed with it, because
 * a bare "3:00" from a server in another zone is the thing that would confuse.
 */
function resetTimeText(resetAt: number): string {
  return new Date(resetAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** A byte count as megabytes to one decimal place, which is how a visitor reads a file size. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * What a `rate_limited` refusal reads as, which depends on whether it names a time.
 *
 * A refusal carrying a reset time means the address spent its allowance, and the
 * sentence ends with the clock time it returns. A refusal carrying none means the
 * counter store did not answer, so there is no window to name and the outage
 * wording stands in its place.
 */
function hourlyRefusal(resetAt?: number): Refusal {
  if (resetAt === undefined) {
    return LIMITER_OUTAGE_COPY;
  }

  const standing = FAILURE_COPY.rate_limited;

  return {
    ...standing,
    body: `${standing.body} The allowance returns at ${resetTimeText(resetAt)}.`,
  };
}

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
   * A refusal that stopped an upload rather than spoiling an extraction.
   *
   * The two caps and the two local refusals all sit beside the picker rather than
   * in the field pane, because they are answers about the upload the visitor just
   * tried, not about a receipt. Keeping them out of `Phase` is what leaves the
   * receipt the visitor was already working on where it was, and the wording is
   * resolved at the moment of the refusal, because the hourly one names a clock
   * time the route sent.
   */
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /**
   * The byte counts of a reduction, when the browser made one.
   *
   * Null says nothing was reduced, which is why the notice is absent rather than
   * saying the app left the file alone.
   */
  const [reduction, setReduction] = useState<{ from: number; to: number } | null>(null);
  /** Which sample the app is fetching, so one control alone shows the spinner. */
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
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
  /**
   * The session's stored receipts, newest first, as the table lists them.
   *
   * The list mirrors what IndexedDB holds: the mount read fills it, every write
   * updates both, and a write the store refused leaves the receipt on screen
   * working with the row it already shows.
   */
  const [records, setRecords] = useState<StoredReceipt[]>([]);
  /** Which stored record the panes are showing, so an edit writes over that one. */
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * True when the receipt on screen came back from the table rather than from an
   * upload, which is the one case the document pane has no image for.
   */
  const [reopened, setReopened] = useState(false);
  /** The last clipboard answer, and which set of controls asked for it. */
  const [copied, setCopied] = useState<{ place: CopyPlace; note: CopyNote } | null>(null);
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
   * Reads the session's table once, on mount.
   *
   * A store the browser will not open answers with an empty list rather than
   * throwing, so a private window shows no list and the rest of the page works
   * exactly as it did before this slice.
   */
  useEffect(() => {
    let listening = true;

    void listSessionReceipts().then((held) => {
      if (listening) {
        setRecords(held);
      }
    });

    return () => {
      listening = false;
    };
  }, []);

  /** The stored record the panes are showing, or null before the first extraction. */
  const openRecord = useMemo(
    () => (openId ? (records.find((record) => record.id === openId) ?? null) : null),
    [openId, records],
  );

  /**
   * Writes one record to the table and to the list beside it.
   *
   * Every path that changes the receipt goes through here, so the stored record
   * is true at all times rather than true at scan time. The write is
   * fire-and-forget against the render: a store that refused it logs once and
   * leaves the receipt on screen working, because losing the table is worse than
   * losing the receipt and neither should blank the panel.
   */
  const remember = useCallback((next: StoredReceipt) => {
    setRecords((held) =>
      held.some((record) => record.id === next.id)
        ? held.map((record) => (record.id === next.id ? next : record))
        : [next, ...held],
    );

    void putReceipt(next).then((written) => {
      if (!written) {
        console.warn(
          "The session table would not take this receipt, so a reload will not list it.",
        );
      }
    });
  }, []);

  /**
   * Writes the receipt on screen over the record it came from.
   *
   * `savedAt` stays what it was, so correcting the oldest receipt leaves it where
   * the visitor found it in the list rather than moving it to the top.
   */
  const rememberOpen = useCallback(
    (next: Receipt, nextWarnings: ArithmeticWarning[], nextEdited: EditedFields) => {
      if (!openRecord) {
        return;
      }

      remember({
        ...openRecord,
        receipt: next,
        warnings: [...nextWarnings],
        edited: [...nextEdited],
      });
    },
    [openRecord, remember],
  );

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
      setRefusal(null);
      setReduction(null);
      setPhase("waiting");
      setSelected(null);
      setMeasurement(null);
      setOcrPhase("idle");
      setOpenId(null);
      setReopened(false);
      setCopied(null);
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
  const extract = useCallback(
    async (source?: File) => {
      /**
       * The file this press sends.
       *
       * A sample passes its file in, because the press that fetched it also
       * calls `choose`, and the state that call sets has not landed yet.
       * Everything below reads this one value, so the sample path and the picker
       * path are the same path.
       */
      const chosen = source ?? file;

      if (!chosen || inFlight.current) {
        return;
      }

      /*
       * The one cap the app enforces without a request. Asking spends nothing,
       * so the visitor reads the refusal before anything leaves the browser.
       */
      if (sessionCapReached()) {
        setRefusal(FAILURE_COPY.session_cap_reached);
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
      setRefusal(null);
      setReduction(null);
      setSelected(null);
      setOpenId(null);
      setReopened(false);
      setCopied(null);

      try {
        /** The image every later step reads: the file itself, or the page read out of it. */
        let image = chosen;

        if (chosen.type === PDF_TYPE) {
          const read = await readPdfPage(chosen);

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

        /*
         * The host carries a smaller request body than the 8 MB file the app
         * accepts, so the browser re-encodes an image that will not fit and
         * sends that. A rasterized PDF page reaches this as an image like any
         * other. The measuring pass above ran on the larger copy on purpose: it
         * reads the print better there, and the mark is positioned in
         * percentages of whatever was measured, so one rectangle serves both
         * copies whichever the pane shows.
         */
        const fit = await fitForUpload(image);

        if (fit.status === "too_large") {
          setRefusal(LOCAL_REFUSAL_COPY.body_too_large);
          setPhase("waiting");
          return;
        }

        if (fit.status === "reduced") {
          image = fit.file;
          setReduction({ from: fit.from, to: fit.to });
          // The pane shows the image the model read, so a visitor checking a
          // field against the picture checks it against the right picture.
          showPreview(fit.file);
        }

        const form = new FormData();
        form.set("file", image);

        const response = await fetch("/api/extract", { method: "POST", body: form });
        const body = (await response.json()) as ExtractionResponse;

        if (isExtractionError(body)) {
          // The hourly limit refuses an upload rather than spoiling an
          // extraction, so it reads beside the picker and offers no retry. It
          // spends no session count either: the route checks the allowance
          // before it reads the body, so no model call was made.
          if (body.error.code === "rate_limited") {
            setRefusal(hourlyRefusal(body.error.resetAt));
            setPhase("waiting");
            return;
          }

          /*
           * The counted unit is one model call. A refusal the route made before
           * it called the model costs nothing, so a wrong type and an oversized
           * file spend no count; a call that was made and then failed does spend
           * one, because the cost was already incurred.
           */
          if (body.error.code === "model_call_failed" || body.error.code === "validation_failed") {
            countExtraction();
          }

          setFailure(body.error.code);
          setPhase("failed");
          return;
        }

        // The model answered, so the call was made and the session spends one,
        // whether or not the answer turned out to be a receipt.
        countExtraction();

        setReceipt(body);
        // The checks run here, on what the browser already holds. No second
        // request leaves the page to produce a warning.
        const found = body.isReceipt ? arithmeticWarnings(body) : [];
        setWarnings(found);
        setItemKeys(freshKeys((body.lineItems ?? []).length));
        setPhase(body.isReceipt ? "result" : "not-a-receipt");

        // A refused upload holds no value in any column the table lists, so the
        // session keeps the receipts the model read and nothing else.
        if (body.isReceipt) {
          const record = newStoredReceipt(body, found);
          setOpenId(record.id);
          remember(record);
        }
      } catch {
        setFailure("model_call_failed");
        setPhase("failed");
      } finally {
        inFlight.current = false;
      }
    },
    [file, freshKeys, measure, readPdfPage, holdMeasurement, remember, showPreview],
  );

  /**
   * Fetches a sample and sends it through the same submit an upload uses.
   *
   * `choose` clears the workspace exactly as picking a file does, so the sample
   * becomes the chosen file and the preview, the try-again control and the
   * session record all behave as they would for an upload. The file reaches
   * `extract` as an argument, because the state `choose` set has not landed yet.
   */
  const loadSample = useCallback(
    async (sample: SampleReceipt) => {
      if (inFlight.current || loadingSample !== null) {
        return;
      }

      setLoadingSample(sample.id);

      try {
        const response = await fetch(sample.path);

        if (!response.ok) {
          throw new Error(`the sample answered ${response.status}`);
        }

        const bytes = await response.blob();
        const picked = new File([bytes], sample.path.slice(SAMPLES_PATH_PREFIX.length), {
          type: sample.mediaType,
        });

        choose(picked);
        await extract(picked);
      } catch {
        setRefusal(LOCAL_REFUSAL_COPY.sample_unavailable);
      } finally {
        setLoadingSample(null);
      }
    },
    [choose, extract, loadingSample],
  );

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

      const nextEdited = recordEdited(edited, address);
      const nextWarnings = arithmeticWarnings(result.receipt);

      setReceipt(result.receipt);
      setEdited(nextEdited);
      setWarnings(nextWarnings);
      // The stored record follows the edit, so a later reload shows the
      // correction and the row in the list follows it too.
      rememberOpen(result.receipt, nextWarnings, nextEdited);
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
    [receipt, edited, rememberOpen],
  );

  /** Adds an empty item, then runs the same recheck a committed edit runs. */
  const addItem = useCallback(() => {
    if (!receipt) {
      return;
    }

    const change = addLineItem(receipt, edited);
    const found = arithmeticWarnings(change.receipt);
    setReceipt(change.receipt);
    setEdited(change.edited);
    setWarnings(found);
    setItemKeys((keys) => [...keys, ...freshKeys(1)]);
    rememberOpen(change.receipt, found, change.edited);
  }, [receipt, edited, freshKeys, rememberOpen]);

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
      const found = arithmeticWarnings(change.receipt);
      // An item address names a position rather than a row, so the selection a
      // visitor made before the shift would mark another row's words. The region
      // map needs no such follow: it is derived from the receipt that now exists.
      if (selected?.kind === "item") {
        setSelected(null);
      }
      setReceipt(change.receipt);
      setEdited(change.edited);
      setWarnings(found);
      setItemKeys((keys) => keys.filter((_, position) => position !== index));
      rememberOpen(change.receipt, found, change.edited);
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
    [receipt, edited, selected, rememberOpen],
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
  const failureCopy: Refusal | null = pdfFailure
    ? { ...PDF_FAILURE_COPY[pdfFailure], retry: true }
    : failure
      ? FAILURE_COPY[failure]
      : null;

  /**
   * Puts a stored receipt back in the panes, as the state an extraction leaves.
   *
   * There is one receipt on screen and one set of controls acting on it, so a
   * reopen writes the same state the extraction writes rather than a second path
   * beside it. The image is the one thing it cannot bring back: the app stores no
   * upload, so the preview, the measurement and the regions all go, and the pane
   * says why.
   */
  const reopen = useCallback(
    (id: string) => {
      const record = records.find((held) => held.id === id);
      if (!record) {
        return;
      }

      stopPass();
      measureRun.current += 1;
      rasterized.current = null;
      showPreview(null);
      setFile(null);
      setPdfPhase("idle");
      setPdfFailure(null);
      setPageCount(null);
      setMeasurement(null);
      setOcrPhase("idle");
      setSelected(null);
      setRejections({});
      setFailure(null);
      setRefusal(null);
      setReduction(null);
      setCopied(null);
      setOpenId(record.id);
      setReceipt(record.receipt);
      setWarnings(record.warnings);
      setEdited(record.edited);
      // The row keys describe this tab rather than the receipt, so a reopened
      // receipt gets fresh ones instead of any the earlier render used.
      setItemKeys(freshKeys((record.receipt.lineItems ?? []).length));
      setPhase("result");
      setReopened(true);
    },
    [records, stopPass, showPreview, freshKeys],
  );

  /** Hands the browser one file to save, which is the path no permission gates. */
  const save = useCallback((text: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Writes one export to the clipboard from the press itself.
   *
   * `navigator.clipboard.writeText` wants a user gesture and a secure context,
   * so the call runs inside the handler rather than after an await the browser
   * stops trusting. A refusal says the copy did not happen and leaves the
   * download as the way out, rather than reporting a success the app did not get.
   */
  const copy = useCallback((place: CopyPlace, what: string, text: string) => {
    const clipboard = navigator.clipboard;

    if (!clipboard) {
      setCopied({
        place,
        note: {
          ok: false,
          message: `This browser gave the app no clipboard, so it copied nothing. Download ${what} instead.`,
        },
      });
      return;
    }

    void clipboard.writeText(text).then(
      () => {
        setCopied({ place, note: { ok: true, message: `The app copied ${what} to your clipboard.` } });
      },
      () => {
        setCopied({
          place,
          note: {
            ok: false,
            message: `Your browser refused the clipboard write, so the app copied nothing. Download ${what} instead.`,
          },
        });
      },
    );
  }, []);

  /** The receipt on screen as each format writes it, built on the press. */
  const receiptJson = useCallback(
    () => (receipt ? receiptToJson(receipt, warnings, edited) : ""),
    [receipt, warnings, edited],
  );
  const receiptCsv = useCallback(() => (receipt ? receiptsToCsv([receipt]) : ""), [receipt]);

  /**
   * The whole session as each format writes it.
   *
   * Both read `records`, which every write keeps current, so the batch carries
   * the correction the visitor made a moment ago rather than the values the
   * extraction returned.
   */
  const sessionJson = useCallback(
    () =>
      receiptsToJson(
        records.map(({ receipt: held, warnings: found, edited: typed }) => ({
          receipt: held,
          warnings: found,
          edited: typed,
        })),
      ),
    [records],
  );
  const sessionCsv = useCallback(
    () => receiptsToCsv(records.map((record) => record.receipt)),
    [records],
  );

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
              <Button
                onClick={() => void extract()}
                disabled={!file || phase === "working" || loadingSample !== null}
              >
                Extract the fields
              </Button>
            </Group>
            <Text c="dimmed" size="sm" maw="65ch">
              The app keeps nothing on the server. Your upload lives in memory for
              the length of the request and reaches no disk and no database. This
              session&apos;s receipts live in this browser, survive a reload and end
              when you close the tab.
            </Text>

            {/* A refused upload is answered where the visitor pressed, and the
                receipts below stay readable, correctable and exportable. */}
            {refusal ? (
              <Alert role="status" color="yellow" title={refusal.title}>
                <Stack align="flex-start" gap="sm">
                  <Text size="sm">{refusal.body}</Text>
                  {refusal.retry ? (
                    <Button
                      variant="light"
                      color="yellow"
                      onClick={() => void extract()}
                      disabled={!file}
                    >
                      Try the same file again
                    </Button>
                  ) : null}
                </Stack>
              </Alert>
            ) : null}
          </Stack>
        </Paper>

        <SampleRow
          onPick={(sample) => void loadSample(sample)}
          loadingId={loadingSample}
          busy={phase === "working" || loadingSample !== null}
        />

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

              {reduction ? (
                <Text size="sm" c="dimmed">
                  The app reduced this image to send it, from {megabytes(reduction.from)} to{" "}
                  {megabytes(reduction.to)}, because the host carries a smaller request than
                  the 8 MB file the app accepts. The pane below shows the smaller copy the
                  model read.
                </Text>
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
                  {reopened
                    ? NO_IMAGE_COPY
                    : file?.type === PDF_TYPE
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
                  <Group gap="sm" wrap="wrap">
                    <Button
                      variant="light"
                      onClick={() =>
                        save(receiptJson(), RECEIPT_JSON_FILENAME, "application/json")
                      }
                    >
                      Download this receipt as JSON
                    </Button>
                    <Button
                      variant="subtle"
                      onClick={() => copy("receipt", "this receipt's JSON", receiptJson())}
                    >
                      Copy this receipt as JSON
                    </Button>
                    <Button
                      variant="light"
                      onClick={() => save(receiptCsv(), RECEIPT_CSV_FILENAME, "text/csv")}
                    >
                      Download this receipt as CSV
                    </Button>
                    <Button
                      variant="subtle"
                      onClick={() => copy("receipt", "this receipt's CSV", receiptCsv())}
                    >
                      Copy this receipt as CSV
                    </Button>
                  </Group>
                  {copied?.place === "receipt" && copied.note ? (
                    <Text
                      role="status"
                      size="xs"
                      c={copied.note.ok ? "teal" : "red"}
                      maw="65ch"
                    >
                      {copied.note.message}
                    </Text>
                  ) : null}
                  <Text c="dimmed" size="xs" maw="65ch">
                    This session&apos;s receipts live in this browser, survive a
                    reload and end when you close the tab, and nothing about them
                    reaches the server. A download or a copy is how a corrected
                    receipt leaves this browser. The CSV gives one row per line
                    item; the JSON is the one that carries each field&apos;s
                    confidence and the text the model read it from.
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
                  {failureCopy.retry ? (
                    <Button
                      variant="light"
                      color="red"
                      onClick={() => void extract()}
                      disabled={!file}
                    >
                      Try the same file again
                    </Button>
                  ) : null}
                </Stack>
              </Alert>
            ) : null}
          </Paper>
        </div>

        <SessionTable
          records={records}
          openId={openId}
          onSelect={reopen}
          onDownloadJson={() => save(sessionJson(), SESSION_JSON_FILENAME, "application/json")}
          onCopyJson={() => copy("session", "every receipt as JSON", sessionJson())}
          onDownloadCsv={() => save(sessionCsv(), SESSION_CSV_FILENAME, "text/csv")}
          onCopyCsv={() => copy("session", "every receipt as CSV", sessionCsv())}
          copyNote={copied?.place === "session" ? copied.note : null}
        />
      </Stack>
    </Container>
  );
}
