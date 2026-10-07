import {
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { MATCH_THRESHOLD } from "@/lib/highlight-match";
import { EXTRACTION_MODEL } from "@/lib/model";
import { MAX_FILE_MEGABYTES, PICKER_FORMAT_SENTENCE } from "@/lib/project-facts";
import classes from "./StepCards.module.css";

/**
 * What the app does to a receipt, in the order it does it.
 *
 * A visitor arriving from a portfolio card may never upload anything, so this is
 * where they learn what the app is for. Each card describes a step the code
 * actually takes, which is why the text names the model call, the word boxes, the
 * decimal comparison and the two export shapes rather than describing a generic
 * pipeline. The thresholds and the format list are interpolated from their own
 * constants, so a change to either moves this copy with it.
 *
 * A server component. It reads `lib/project-facts.ts`, which reaches
 * `lib/extract-receipt.ts` and the OpenAI SDK behind it, and there is nothing
 * here a visitor interacts with.
 */

type Step = {
  title: string;
  body: string;
};

const STEPS: readonly Step[] = [
  {
    title: "You hand it a file",
    body: `The picker takes ${PICKER_FORMAT_SENTENCE} up to ${MAX_FILE_MEGABYTES} MB. A PDF is rasterized in your browser at twice its page size, and a photograph too large for the request body is re-encoded and shrunk until it fits. What the document pane shows you is the image the model reads.`,
  },
  {
    title: "One model call reads it",
    body: `The image goes to ${EXTRACTION_MODEL} with Structured Outputs in strict mode, and the schema it has to satisfy is the field set itself. Zod validates the answer again on the server. No JSON is parsed out of prose, and nothing retries behind your back.`,
  },
  {
    title: "The app finds each value on the page",
    body: `Nothing asks the model where a value sits, because it would answer with numbers that look precise and are not. The browser reads word boxes off a PDF's text layer, or runs tesseract.js in a worker when the page has none, then scores runs of adjacent words against the characters each field was read from. Below a score of ${MATCH_THRESHOLD} it marks nothing rather than marking the wrong line.`,
  },
  {
    title: "The arithmetic is checked in code",
    body: "The line items have to sum to the printed subtotal, and the subtotal plus the taxes plus the tip has to equal the total. Both comparisons are exact decimal equality over scaled integers, with no cent of tolerance, so a receipt that rounds its own tax line says so. A mismatch raises a warning naming the difference on both fields it involves, and the app never rewrites a number to close a gap.",
  },
  {
    title: "You correct what it got wrong",
    body: "Every value is editable where it sits. Blur or Enter commits an edit, Escape puts back what the field held, and the field's own validator off the schema refuses a date written the wrong way round. A committed edit reruns both checks, clears the confidence on that field and marks the cell as something you typed.",
  },
  {
    title: "You take the data out",
    body: "The JSON download carries the receipt, the warnings and the list of fields you typed into, with every confidence and source text intact. The CSV carries one row per line item with the receipt's own fields repeated on each row, which is what lets a spreadsheet group or pivot on any of them. Nothing reaches a server, and the receipts this tab holds end when you close it.",
  },
];

export function StepCards() {
  return (
    <Container size="var(--content-max)" py="xl" component="section" className="reveal">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={2}>What happens to your receipt</Title>
          <Text c="dimmed" maw="var(--prose-measure)">
            Six steps, in order. One of them runs on a server. The other five run in
            your browser, which is why no receipt has to be stored anywhere to be read.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {STEPS.map((step, index) => (
            <Paper
              key={step.title}
              withBorder
              radius="md"
              p="md"
              className={classes.card}
            >
              <Stack gap="sm">
                <Group gap="sm" wrap="nowrap" align="center">
                  <span className={classes.number} aria-hidden="true">
                    {index + 1}
                  </span>
                  <Title order={3} size="h5">
                    <VisuallyHidden>Step {index + 1}. </VisuallyHidden>
                    {step.title}
                  </Title>
                </Group>
                <Text size="sm" c="dimmed">
                  {step.body}
                </Text>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
