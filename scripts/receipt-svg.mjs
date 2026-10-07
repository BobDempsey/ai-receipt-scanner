/**
 * The SVG receipt renderer, shared by the two generators that draw a receipt.
 *
 * `scripts/make-sample-receipts.mjs` drew the three committed samples from these
 * functions before they moved here, and `scripts/make-fixtures.mjs` draws the
 * forty accuracy fixtures from them now. One renderer means a fixture and a
 * sample print on the same grid, so a figure measured on the fixtures describes
 * the receipts a visitor meets on the landing page.
 *
 * Nothing here touches the filesystem and nothing here imports `sharp`. The
 * caller rasterizes the string this module returns.
 */

/**
 * Courier New is the typeface, because a thermal till and a dot matrix invoice
 * both print on a fixed grid, and a proportional face gives away that the column
 * of amounts was laid out by hand. Its advance width is 0.6 of the point size,
 * which is what lets a dashed rule be sized by character count.
 */
export const FONT = "Courier New, Courier, monospace";
export const ADVANCE = 0.6;

export function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Lays rows out top to bottom and returns the SVG with the height it needed.
 *
 * A row is one of: `center` text, `left` text, a `split` of a label and an amount
 * at the two ends of the line, a `rule` of dashes, or a `gap` of blank lines. A
 * receipt prints a label and its amount at the two ends of one line, so `split` is
 * a row of its own rather than two rows the caller has to align.
 */
export function renderSvg({ width, margin, size, lineHeight, background, ink, rows }) {
  const columns = Math.floor((width - margin * 2) / (size * ADVANCE));
  const parts = [];
  let y = margin + size;

  const text = (value, x, anchor, weight) =>
    `<text x="${x}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${
      weight === "bold" ? size + 1 : size
    }" font-weight="${weight ?? "normal"}" fill="${ink}" text-anchor="${anchor}" xml:space="preserve">${escapeText(
      value,
    )}</text>`;

  for (const row of rows) {
    if (row.gap) {
      y += lineHeight * row.gap;
      continue;
    }
    if (row.rule) {
      parts.push(text("-".repeat(columns), margin, "start"));
    } else if (row.center) {
      parts.push(text(row.center, width / 2, "middle", row.weight));
    } else if (row.split) {
      parts.push(text(row.split[0], margin, "start", row.weight));
      parts.push(text(row.split[1], width - margin, "end", row.weight));
    } else {
      parts.push(text(row.left ?? "", margin, "start", row.weight));
    }
    y += lineHeight;
  }

  const height = Math.round(y + margin);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/>${parts.join(
    "",
  )}</svg>`;
}

/**
 * Whether a given line prints a quantity and a unit price of its own.
 *
 * This one predicate is the whole truth about it, and both the drawing and the
 * labelling read it here. A layout that heads its items with a quantity column
 * prints the line for every item; elsewhere a line of a single unit prints its
 * description and its amount alone, because that is what a till roll does. The
 * first version of the fixture generator asked this question in the renderer and
 * answered it again in the label builder, the two answers disagreed on 374 cells,
 * and the published figure was twenty points low as a result.
 */
export function printsQuantityLine(item, { alwaysQuantity = false } = {}) {
  return alwaysQuantity || item.quantity !== "1";
}

/** The characters that line prints, where it prints one. */
export function quantityLineText(item, money) {
  return `   ${item.quantity} @ ${money(item.unitPrice)}`;
}

/**
 * Turns line items into the rows a till prints, with the quantity line only where
 * there is one.
 *
 * `money` writes the amount the way the receipt prints it, so a caller working in
 * euros passes a formatter that puts the euro symbol there. The three samples pass
 * nothing and get the dollar formatting they were committed with.
 */
export function itemRows(items, { alwaysQuantity = false, money = (value) => `$${value}` } = {}) {
  return items.flatMap((item) =>
    printsQuantityLine(item, { alwaysQuantity })
      ? [
          { split: [item.description, money(item.amount)] },
          { left: quantityLineText(item, money) },
        ]
      : [{ split: [item.description, money(item.amount)] }],
  );
}

/** Adds item amounts in whole cents, so the gap a sample prints is a stated figure. */
export function sumAmounts(items) {
  const cents = items.reduce((total, item) => total + Math.round(Number(item.amount) * 100), 0);
  return (cents / 100).toFixed(2);
}
