import type { Metadata } from "next";
import {
  Anchor,
  Container,
  List,
  ListItem,
  Paper,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import { FAILURE_CASES, SITE_FIGURES } from "@/lib/project-facts";
import { AUTHOR_URL, REPOSITORY_URL } from "@/components/site-links";

/**
 * What the app does, what it is built on, and where it fails.
 *
 * The limits and the figures are rendered from `lib/project-facts.ts` rather than
 * written here, because the README quotes the same two lists and a visitor who
 * reads one and then the other must not find two answers. The prose around them
 * is short enough that a reviewer can read both documents in a minute.
 *
 * The failure cases are the point of the page. A portfolio project that only
 * claims what it does well tells a reader nothing they can check, so each entry
 * names a case, says which part of the pipeline it breaks, and can be reproduced
 * against the deployed app.
 *
 * A server component, which is what lets it read `lib/project-facts.ts`. The nav
 * and the footer come from the root layout, and the content width is the
 * `--content-max` token every other section uses.
 *
 * The tables import `TableThead` and its siblings as their own names rather than
 * reaching for `Table.Thead`. A client component crosses the boundary as a
 * reference, not as the function object, so the static properties Mantine hangs
 * off `Table` and `List` are undefined in a server component and the page renders
 * nothing.
 */

export const metadata: Metadata = {
  title: "About the AI Receipt Scanner",
  description:
    "How the receipt scanner reads a receipt, what it is built on, and the cases it reads badly.",
};

/** The stack, in the order a request moves through it. */
const STACK_ROWS: readonly [string, string][] = [
  ["Framework", "Next.js 16 on the App Router, React 19, TypeScript"],
  ["Interface", "Mantine, with its PostCSS preset. No Tailwind sits beside it."],
  ["Model", "The OpenAI API, a vision model, Structured Outputs in strict mode"],
  ["Validation", "Zod, the same schema on the server and in the browser"],
  ["Word boxes", "pdf.js for a PDF's text layer, tesseract.js in a web worker otherwise"],
  ["Money", "Decimal strings compared over scaled integers, written in this repo"],
  ["Session", "IndexedDB keyed to the browser tab. No database, nothing on a server."],
  ["Rate limiting", "A fixed hourly window per address, counted in Upstash Redis"],
  ["Host", "Vercel, with production deploying from the main branch"],
  ["Tests", "Vitest over the schema, the arithmetic, the matcher and the exports"],
];

export default function AboutPage() {
  return (
    <Container size="var(--content-max)" py="xl" component="main">
      <Stack gap="xl">
        <Stack gap="sm">
          <Title order={1}>About this project</Title>
          <Text maw="var(--prose-measure)">
            This is a demo of one narrow job done carefully: turning a photograph or a
            PDF of a receipt into typed fields a person can check, correct and export.
            It has no chat box. You give it a receipt, it gives you data, and it shows
            its working at every step so you can tell a reading from a guess.
          </Text>
        </Stack>

        <Stack gap="sm">
          <Title order={2}>What it does to a receipt</Title>
          <Text maw="var(--prose-measure)">
            Your browser prepares the file first. A PDF is rasterized at twice its page
            size and only the first page is kept, and a photograph too large for the
            request body is re-encoded and shrunk until it fits. The image you then see
            in the document pane is the image the model reads, which is why a highlight
            drawn over it can be trusted to sit where it claims.
          </Text>
          <Text maw="var(--prose-measure)">
            One request goes to the model, with the field set as the schema it has to
            satisfy. The answer comes back already shaped, so nothing hunts for JSON
            inside prose, and Zod checks it again on the server before it is sent to
            your browser. A file that is not a receipt is a first-class answer: the app
            says so, repeats the reason the model gave, and stops.
          </Text>
          <Text maw="var(--prose-measure)">
            The highlight is matched rather than generated. The app never asks the model
            for coordinates, because a model will happily answer with numbers that look
            precise and are wrong. Instead the browser reads the words off the document
            with their rectangles, then scores runs of adjacent words against the
            characters each field was read from. Nothing below the match score draws a
            mark at all.
          </Text>
          <Text maw="var(--prose-measure)">
            The arithmetic then runs in decimal code written for this repo. Line items have to sum to
            the printed subtotal, and the subtotal plus the taxes plus the tip has to
            equal the total. A mismatch becomes a warning naming the difference on both
            fields involved. The app never edits a number to make a sum close, because a
            figure that disagrees with its neighbours is the most useful thing on the
            page.
          </Text>
          <Text maw="var(--prose-measure)">
            Everything is editable where it sits, and every edit reruns both checks. A
            field you typed into keeps the characters the model originally read it from,
            so the highlight still works, and it carries no confidence at all, because
            the app will not claim a certainty on your behalf.
          </Text>
        </Stack>

        <Stack gap="sm">
          <Title order={2}>The figures on this site</Title>
          <Text maw="var(--prose-measure)">
            Each one is read out of the constant the app enforces, so a cap that changes
            changes this table, the tiles on the front page and the README together. No
            accuracy percentage appears yet. Measuring the extraction against labelled
            receipts is the next piece of work, and it will land that number in all three
            places at once rather than in one of them.
          </Text>
          <TableScrollContainer minWidth={420}>
            <Table striped withTableBorder verticalSpacing="sm">
              <TableThead>
                <TableTr>
                  <TableTh w={100}>Figure</TableTh>
                  <TableTh>What it counts</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {SITE_FIGURES.map((figure) => (
                  <TableTr key={figure.id}>
                    <TableTd fw={700}>{figure.figure}</TableTd>
                    <TableTd>
                      <Text fw={600} size="sm">
                        {figure.label}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {figure.detail}
                      </Text>
                    </TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        </Stack>

        <Stack gap="sm">
          <Title order={2}>What it is built on</Title>
          <TableScrollContainer minWidth={420}>
            <Table withTableBorder verticalSpacing="sm">
              <TableTbody>
                {STACK_ROWS.map(([layer, choice]) => (
                  <TableTr key={layer}>
                    <TableTh w={160} scope="row">
                      {layer}
                    </TableTh>
                    <TableTd>{choice}</TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        </Stack>

        <Stack gap="sm">
          <Title order={2}>What it keeps</Title>
          <Text maw="var(--prose-measure)">
            Your upload lives in memory for the length of one request and is never
            written to disk. The extracted receipts live in your own browser, keyed to
            this tab, so a reload keeps them and closing the tab ends them. The only
            state on a server is a counter of how many scans an address has spent this
            hour, which holds no receipt and no image.
          </Text>
          <Text maw="var(--prose-measure)">
            The three sample receipts are invented. The merchants, the addresses and the
            card digits belong to no real business and no real card, and each image says
            so in its own footer as well as on the page beside it.
          </Text>
        </Stack>

        <Stack gap="sm">
          <Title order={2}>Where it fails</Title>
          <Text maw="var(--prose-measure)">
            Every case below is one you can reproduce. They are listed because a demo
            that only shows its good path tells you nothing you can check.
          </Text>
          <Stack gap="sm">
            {FAILURE_CASES.map((failure) => (
              <Paper key={failure.id} withBorder radius="md" p="md">
                <Title order={3} size="h5">
                  {failure.title}
                </Title>
                <Text size="sm" c="dimmed" mt={6}>
                  {failure.detail}
                </Text>
              </Paper>
            ))}
          </Stack>
        </Stack>

        <Stack gap="sm">
          <Title order={2}>Who built it</Title>
          <Text maw="var(--prose-measure)">
            Bob Dempsey, as the fourth AI project on{" "}
            <Anchor href={AUTHOR_URL} target="_blank" rel="noreferrer noopener">
              bobdempsey83.com
            </Anchor>
            . The source, including the spec each slice was built against, is on{" "}
            <Anchor
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              GitHub
            </Anchor>
            .
          </Text>
          <List size="sm" spacing={4} c="dimmed">
            <ListItem>No account, no key and no sign-up is needed to use the demo.</ListItem>
            <ListItem>Nothing one visitor does changes what the next one sees.</ListItem>
          </List>
        </Stack>
      </Stack>
    </Container>
  );
}
