import { ActionBand } from "@/components/ActionBand";
import { ReceiptWorkspace } from "@/components/ReceiptWorkspace";
import { Screenshots } from "@/components/Screenshots";
import { StatTiles } from "@/components/StatTiles";
import { StepCards } from "@/components/StepCards";

/**
 * The landing page is the app page.
 *
 * The portfolio baseline asks for the product in the hero, usable without
 * scrolling, which here is the drop zone and the three samples. Splitting a
 * marketing page off would put a click between a visitor and the only thing worth
 * seeing, so the workspace sits at the top and the sections that explain it follow
 * underneath, in the order a visitor needs them: what the app does, what it reads,
 * what that looks like, and where to go next.
 *
 * `#scan` is what the closing band and the nav's main action both point at, so a
 * visitor at the bottom of the page is one press from the samples.
 */
export default function Home() {
  return (
    <main>
      {/* The nav is fixed, so the anchor reserves its height rather than landing
          the picker underneath it. The value matches the `:target` rule in
          `app/globals.css`, because an inline style outranks that rule and the two
          landing the heading in different places would be a difference nobody
          could see the cause of. The extra spacing keeps the heading off the bar
          rather than flush against it. */}
      <div
        id="scan"
        style={{
          scrollMarginTop: "calc(var(--nav-height) + var(--mantine-spacing-md))",
        }}
      >
        <ReceiptWorkspace />
      </div>
      <StepCards />
      <StatTiles />
      <Screenshots />
      <ActionBand />
    </main>
  );
}
