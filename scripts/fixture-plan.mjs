/**
 * The plan behind the forty accuracy fixtures: what each receipt says, how it is
 * laid out, and which degradations it carries.
 *
 * Everything in this module is pure. It imports nothing, draws nothing and writes
 * nothing, which is what lets `lib/fixtures.test.ts` assert the matrix and the
 * variety without rendering a single image. `scripts/make-fixtures.mjs` turns a
 * plan into rows for the renderer and a label file, in one run from one set of
 * values, so no number on a fixture was typed twice.
 *
 * Every merchant, address, telephone number and card number below is invented.
 * None of them names a real business, and no card number is a real one.
 */

/* ------------------------------------------------------------------ *
 * The seeded generator
 * ------------------------------------------------------------------ */

/**
 * mulberry32, a 32-bit counter generator, is the whole source of chance here.
 *
 * A fixture set that shifts between runs makes a figure measured last month
 * incomparable to one measured today, so every quantity, card number and noise
 * sample comes from a stream seeded off the fixture's own index. Nothing in the
 * generator calls `Math.random`, and a reviewer can check that by grepping for it.
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed the whole set hangs off. Change it and every fixture changes. */
export const FIXTURE_SEED = 20261007;

/** How many fixtures the set holds. The spec asks for at least 40. */
export const FIXTURE_COUNT = 40;

/* ------------------------------------------------------------------ *
 * The degradation matrix
 * ------------------------------------------------------------------ */

/**
 * The degradations each fixture carries, one entry per fixture, written out
 * rather than drawn at random.
 *
 * A random smear would make two runs incomparable and would make a regression
 * look like noise, so the combinations are declared here and a test asserts the
 * generated set matches this list. The first four fixtures are clean renders and
 * the next seven carry one degradation each, one per step, which is eleven of
 * forty: that part of the set is what a scanned PDF or a careful photograph looks
 * like, and a single step on its own is what makes a failure attributable to that
 * step alone. The rest stacks from there, ending at a fixture carrying six at once.
 *
 * The listed order does not matter. `scripts/fixture-degrade.mjs` applies the
 * steps in its own fixed order, because fading paper that is already blurred is a
 * different image from blurring paper that is already faded, and the matrix
 * should not decide that by accident.
 */
export const DEGRADATION_MATRIX = [
  [],
  [],
  [],
  [],
  ["jpeg"],
  ["noise"],
  ["fade"],
  ["blur"],
  ["rotate"],
  ["perspective"],
  ["crop"],
  ["fade", "blur"],
  ["fade", "jpeg"],
  ["blur", "noise"],
  ["rotate", "jpeg"],
  ["rotate", "noise"],
  ["perspective", "blur"],
  ["crop", "jpeg"],
  ["crop", "noise"],
  ["fade", "noise"],
  ["blur", "jpeg"],
  ["perspective", "jpeg"],
  ["rotate", "crop"],
  ["fade", "perspective"],
  ["crop", "blur"],
  ["noise", "jpeg"],
  ["fade", "blur", "jpeg"],
  ["rotate", "perspective", "jpeg"],
  ["fade", "noise", "jpeg"],
  ["blur", "rotate", "noise"],
  ["crop", "perspective", "jpeg"],
  ["fade", "crop", "noise"],
  ["blur", "perspective", "noise"],
  ["rotate", "noise", "jpeg"],
  ["fade", "rotate", "crop"],
  ["perspective", "noise", "crop"],
  ["fade", "blur", "rotate", "jpeg"],
  ["perspective", "crop", "noise", "jpeg"],
  ["fade", "rotate", "crop", "noise", "jpeg"],
  ["fade", "blur", "rotate", "perspective", "noise", "jpeg"],
];

/* ------------------------------------------------------------------ *
 * The layouts
 * ------------------------------------------------------------------ */

/**
 * Three layouts, because a till roll, a card slip and a billed invoice put the
 * same twelve fields in three different shapes.
 *
 * `datePrinted` is how the paper spells the date; the label always holds the ISO
 * form, so a fixture printing 04/01/2026 is also a check on whether the app reads
 * a day-first date as the day. `quantityColumn` says which lines print a quantity
 * and a unit price: an invoice heads its items with the column and prints the pair
 * on every line, a till roll prints the pair only where the count is more than one,
 * and a card slip prints no quantity column at all, so the plan forces every slip
 * line to a single unit. Where a line prints neither, the label holds null for the
 * quantity, the unit price and both their source texts, because the paper carries
 * no characters there to read. `printsQuantityLine` in `scripts/receipt-svg.mjs` is
 * the one function that answers the question for the drawing and the label alike.
 *
 * `paper` is the grey level the degradation steps fill with when they rotate or
 * warp the page, so the background they introduce matches the paper rather than
 * ringing it with black.
 */
export const LAYOUTS = {
  thermal: {
    width: 560,
    margin: 24,
    size: 18,
    lineHeight: 25,
    background: "#f4f2ec",
    ink: "#23201c",
    paper: 239,
    addressLines: 2,
    datePrinted: "us",
    totalWord: "TOTAL",
    quantityColumn: "when-not-one",
    tableHeader: false,
  },
  slip: {
    width: 520,
    margin: 22,
    size: 17,
    lineHeight: 24,
    background: "#faf9f5",
    ink: "#26231f",
    paper: 245,
    addressLines: 1,
    datePrinted: "eu",
    totalWord: "TOTAL",
    quantityColumn: "never",
    tableHeader: false,
  },
  invoice: {
    width: 760,
    margin: 40,
    size: 19,
    lineHeight: 27,
    background: "#fbfaf6",
    ink: "#201e1b",
    paper: 246,
    addressLines: 1,
    datePrinted: "iso",
    totalWord: "TOTAL DUE",
    quantityColumn: "always",
    tableHeader: true,
  },
};

/* ------------------------------------------------------------------ *
 * The merchants
 * ------------------------------------------------------------------ */

/**
 * Ten invented merchants, each with its own currency, tax lines, tipping habit,
 * payment methods and stock of twelve items.
 *
 * Ten merchants across four variants each is what gives the set forty receipts
 * that differ in more than their noise. Two merchants print no tax line at all (a
 * cafe whose prices include the VAT, and a taxi), six print one and two print two,
 * so the taxes array is exercised empty, singular and plural.
 */
export const MERCHANTS = [
  {
    slug: "mossgate-grocers",
    name: "MOSSGATE GROCERS",
    address: ["318 Harrowdene Way", "Fairhaven Bay, OR 97000"],
    phone: "(000) 555-0188",
    currency: "USD",
    symbol: "$",
    layout: "thermal",
    taxes: [{ label: "SALES TAX 5.25%", rate: 0.0525 }],
    tipRate: null,
    payments: ["VISA DEBIT", "MASTERCARD", "MOBILE WALLET", "CASH"],
    footer: ["FICTIONAL RECEIPT - TEST FIXTURE", "NOT A REAL STORE OR CARD"],
    items: [
      ["WHOLEMEAL LOAF", "3.95"],
      ["SEMI SKIMMED MILK 2L", "2.40"],
      ["SALTED BUTTER 250G", "4.10"],
      ["BANANAS LOOSE", "1.75"],
      ["PLUM TOMATOES TIN", "1.15"],
      ["BASMATI RICE 1KG", "5.30"],
      ["FROZEN PEAS 900G", "2.85"],
      ["ORANGE JUICE 1L", "3.20"],
      ["CHEDDAR BLOCK 400G", "6.45"],
      ["DISH SOAP 500ML", "2.60"],
      ["GROUND COFFEE 227G", "7.90"],
      ["DARK CHOCOLATE 100G", "2.25"],
    ],
  },
  {
    slug: "brass-spoon-diner",
    name: "THE BRASS SPOON DINER",
    address: ["64 Kettleby Street", "Fairhaven Bay, OR 97000"],
    phone: "(000) 555-0231",
    currency: "USD",
    symbol: "$",
    layout: "thermal",
    taxes: [
      { label: "STATE SALES TAX 6.25%", rate: 0.0625 },
      { label: "CITY MEALS TAX 1.50%", rate: 0.015 },
    ],
    tipRate: 0.2,
    payments: ["MASTERCARD", "VISA CREDIT", "AMERICAN EXPRESS", "CASH"],
    footer: ["FICTIONAL RECEIPT - TEST FIXTURE", "NOT A REAL RESTAURANT"],
    items: [
      ["BUTTERMILK PANCAKES", "11.50"],
      ["THREE EGG OMELETTE", "13.25"],
      ["HASH BROWN SIDE", "4.75"],
      ["FILTER COFFEE", "3.10"],
      ["FRESH ORANGE JUICE", "4.60"],
      ["CLUB SANDWICH", "14.95"],
      ["TOMATO SOUP BOWL", "7.40"],
      ["CHEESEBURGER PLATE", "16.80"],
      ["SWEET POTATO FRIES", "5.95"],
      ["APPLE PIE SLICE", "6.50"],
      ["ICED TEA REFILL", "3.45"],
      ["SIDE SALAD", "5.20"],
    ],
  },
  {
    slug: "quayside-cafe",
    name: "QUAYSIDE CAFE",
    address: ["11 Netherwharf Lane, Portmere PM1 4RG"],
    phone: "01000 960144",
    currency: "GBP",
    symbol: "£",
    layout: "slip",
    taxes: [],
    tipRate: 0.1,
    payments: ["CONTACTLESS CARD", "CASH", "MOBILE WALLET", "VISA DEBIT"],
    footer: ["FICTIONAL RECEIPT - TEST FIXTURE", "VAT INCLUDED IN PRICES"],
    items: [
      ["FLAT WHITE", "3.40"],
      ["ESPRESSO DOUBLE", "2.70"],
      ["ALMOND CROISSANT", "3.15"],
      ["POT OF BREAKFAST TEA", "2.60"],
      ["TOASTED TEACAKE", "2.95"],
      ["SAUSAGE ROLL", "3.80"],
      ["ICED LATTE", "3.60"],
      ["CARROT CAKE SLICE", "4.25"],
      ["HOT CHOCOLATE", "3.50"],
      ["BACON BAP", "5.10"],
      ["SPARKLING WATER 330ML", "1.95"],
      ["SHORTBREAD FINGER", "1.60"],
    ],
  },
  {
    slug: "northwind-fuel",
    name: "NORTHWIND FUEL AND GO",
    address: ["Junction 7, Carterhill Road, OR 97000"],
    phone: "(000) 555-0307",
    currency: "USD",
    symbol: "$",
    layout: "slip",
    taxes: [{ label: "STATE FUEL TAX 4.00%", rate: 0.04 }],
    tipRate: null,
    payments: ["VISA DEBIT", "FLEET CARD", "CASH", "MASTERCARD"],
    footer: ["FICTIONAL RECEIPT - TEST FIXTURE", "PUMP RECEIPT COPY"],
    items: [
      ["UNLEADED PUMP 3", "48.60"],
      ["SCREENWASH 2L", "6.95"],
      ["ENGINE OIL 1L", "11.40"],
      ["BOTTLED WATER", "2.10"],
      ["CAR WASH TOKEN", "9.00"],
      ["AIR FRESHENER", "4.25"],
      ["WIPER BLADE", "14.80"],
      ["CHOCOLATE BAR", "1.85"],
      ["COFFEE TO GO", "2.75"],
      ["TYRE GAUGE", "7.60"],
      ["MICROFIBRE CLOTH", "5.45"],
      ["DE-ICER SPRAY", "6.30"],
    ],
  },
  {
    slug: "elderfield-pharmacy",
    name: "ELDERFIELD PHARMACY",
    address: ["5 Prentice Arcade", "Portmere PM2 8TD"],
    phone: "01000 960577",
    currency: "GBP",
    symbol: "£",
    layout: "thermal",
    taxes: [{ label: "VAT 20.00%", rate: 0.2 }],
    tipRate: null,
    payments: ["VISA DEBIT", "CASH", "CONTACTLESS CARD", "MASTERCARD"],
    footer: ["FICTIONAL RECEIPT - TEST FIXTURE", "NOT A REAL PHARMACY"],
    items: [
      ["PARACETAMOL 500MG 16", "1.40"],
      ["PLASTERS ASSORTED 40", "3.25"],
      ["VITAMIN D 1000IU 90", "6.80"],
      ["HAND CREAM 75ML", "4.95"],
      ["THROAT LOZENGES", "2.70"],
      ["DIGITAL THERMOMETER", "12.50"],
      ["SUNSCREEN SPF50 200ML", "9.40"],
      ["COTTON WOOL PADS", "2.15"],
      ["ANTISEPTIC WIPES 20", "3.60"],
      ["EYE DROPS 10ML", "5.85"],
      ["SUPPORT BANDAGE", "4.30"],
      ["LIP BALM", "2.45"],
    ],
  },
  {
    slug: "timbergate-hardware",
    name: "TIMBERGATE HARDWARE",
    address: ["902 Sawyers Bend", "Fairhaven Bay, OR 97000"],
    phone: "(000) 555-0419",
    currency: "USD",
    symbol: "$",
    layout: "thermal",
    taxes: [{ label: "SALES TAX 7.00%", rate: 0.07 }],
    tipRate: null,
    payments: ["MASTERCARD", "TRADE ACCOUNT", "CASH", "VISA CREDIT"],
    footer: ["FICTIONAL RECEIPT - TEST FIXTURE", "RETURNS WITHIN 30 DAYS"],
    items: [
      ["PINE BATTEN 2.4M", "8.75"],
      ["WOOD SCREWS 100PK", "6.40"],
      ["MASKING TAPE 50M", "3.90"],
      ["EMULSION PAINT 2.5L", "24.50"],
      ["PAINT ROLLER SET", "11.20"],
      ["SANDPAPER PACK", "4.60"],
      ["SILICONE SEALANT", "7.35"],
      ["ADJUSTABLE WRENCH", "16.90"],
      ["WORK GLOVES LARGE", "9.80"],
      ["TARPAULIN 3X4M", "18.45"],
      ["CABLE TIES 200PK", "5.25"],
      ["LED BULB E27", "6.15"],
    ],
  },
  {
    slug: "canalside-books",
    name: "CANALSIDE BOOKS",
    address: ["Keizersgracht 118, 1015 Amsterdam"],
    phone: "020 000 4471",
    currency: "EUR",
    symbol: "€",
    layout: "slip",
    taxes: [{ label: "BTW 9.00%", rate: 0.09 }],
    tipRate: null,
    payments: ["MAESTRO", "CASH", "CONTACTLESS CARD", "VISA DEBIT"],
    footer: ["FICTIONAL RECEIPT - TEST FIXTURE", "NOT A REAL SHOP"],
    items: [
      ["ATLAS OF RIVERS", "28.50"],
      ["POCKET DICTIONARY", "12.95"],
      ["NOTEBOOK A5 LINED", "6.40"],
      ["CITY WALKING GUIDE", "17.80"],
      ["POSTCARD SET OF 8", "5.60"],
      ["FOUNTAIN PEN INK", "9.25"],
      ["NOVEL PAPERBACK", "14.50"],
      ["PICTURE BOOK, CHILD", "11.70"],
      ["BOOKMARK LEATHER", "4.85"],
      ["COOKERY HARDBACK", "32.00"],
      ["POETRY ANTHOLOGY", "19.40"],
      ["GIFT WRAP SHEET", "2.35"],
    ],
  },
  {
    slug: "hotel-verdant-court",
    name: "HOTEL VERDANT COURT",
    address: ["Rue des Tanneurs 42, 1000 Brussels"],
    phone: "02 000 7719",
    currency: "EUR",
    symbol: "€",
    layout: "invoice",
    taxes: [
      { label: "VAT 21.00%", rate: 0.21 },
      { label: "CITY TAX 3.00%", rate: 0.03 },
    ],
    tipRate: 0.05,
    payments: ["ACCOUNT TRANSFER", "AMERICAN EXPRESS", "MASTERCARD", "VISA CREDIT"],
    footer: ["FICTIONAL INVOICE - TEST FIXTURE", "NOT A REAL HOTEL"],
    items: [
      ["ROOM NIGHT, DOUBLE", "148.00"],
      ["BREAKFAST BUFFET", "22.50"],
      ["LAUNDRY SERVICE", "31.40"],
      ["MEETING ROOM HALF DAY", "95.00"],
      ["MINIBAR CONSUMPTION", "18.60"],
      ["AIRPORT TRANSFER", "54.00"],
      ["DINNER, RESTAURANT", "67.80"],
      ["PARKING, PER NIGHT", "24.00"],
      ["LATE CHECKOUT FEE", "35.00"],
      ["BAR TAB", "41.25"],
      ["SPA ENTRY", "29.00"],
      ["PRINTING AND COPIES", "7.90"],
    ],
  },
  {
    slug: "riverbend-taxi",
    name: "RIVERBEND TAXI CO",
    address: ["Dispatch 70 Ferryman Road, OR 97000"],
    phone: "(000) 555-0666",
    currency: "USD",
    symbol: "$",
    layout: "slip",
    taxes: [],
    tipRate: 0.15,
    payments: ["VISA DEBIT", "CASH", "MOBILE WALLET", "MASTERCARD"],
    footer: ["FICTIONAL RECEIPT - TEST FIXTURE", "DRIVER COPY"],
    items: [
      ["FARE, METERED", "23.40"],
      ["AIRPORT SURCHARGE", "5.00"],
      ["WAITING TIME", "4.80"],
      ["LUGGAGE HANDLING", "3.00"],
      ["NIGHT RATE SUPPLEMENT", "6.25"],
      ["TOLL BRIDGE", "2.75"],
      ["BOOKING FEE", "2.50"],
      ["EXTRA PASSENGER", "3.50"],
      ["CLEANING CHARGE", "15.00"],
      ["CARD HANDLING", "1.20"],
      ["CITY CENTRE ENTRY", "4.00"],
      ["RETURN LEG", "21.60"],
    ],
  },
  {
    slug: "aldergrove-supply",
    name: "ALDERGROVE SUPPLY WORKS",
    address: ["Unit 3 Faldon Estate, Portmere PM5 2QN"],
    phone: "01000 960902",
    currency: "GBP",
    symbol: "£",
    layout: "invoice",
    taxes: [{ label: "VAT 20.00%", rate: 0.2 }],
    tipRate: null,
    payments: ["ACCOUNT TRANSFER", "TRADE ACCOUNT", "MASTERCARD", "DIRECT DEBIT"],
    footer: ["FICTIONAL INVOICE - TEST FIXTURE", "NOT A REAL SUPPLIER"],
    items: [
      ["A4 COPY PAPER, BOX OF 5", "21.80"],
      ["TONER CARTRIDGE, BLACK", "64.50"],
      ["LEVER ARCH FILE", "3.25"],
      ["WHITEBOARD MARKER", "1.90"],
      ["DESK LAMP, LED", "28.40"],
      ["STAPLER, HEAVY DUTY", "14.75"],
      ["ENVELOPES C5, BOX 500", "19.60"],
      ["ARCHIVE BOX", "4.40"],
      ["KEYBOARD, WIRED", "22.95"],
      ["MOUSE MAT", "5.80"],
      ["FIRST AID KIT", "33.20"],
      ["DELIVERY, NEXT DAY", "11.00"],
    ],
  },
];

/** Four item counts, one per variant, so the set holds short and long receipts. */
export const ITEM_COUNTS = [3, 6, 9, 12];

/** Payment methods that print no card number, so the label leaves `cardLast4` null. */
export const CARDLESS_PAYMENTS = ["CASH", "ACCOUNT TRANSFER", "TRADE ACCOUNT", "DIRECT DEBIT"];

/* ------------------------------------------------------------------ *
 * Money, dates and quantities
 * ------------------------------------------------------------------ */

/** Whole cents in, a decimal string out, because the app holds money as a string. */
export function centsToDecimal(cents) {
  const sign = cents < 0 ? "-" : "";
  const value = Math.abs(cents);
  return `${sign}${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

/** A decimal string in, whole cents out. */
export function decimalToCents(value) {
  return Math.round(Number(value) * 100);
}

/** Adds days to an ISO date without touching a timezone. */
export function addDays(iso, days) {
  const at = new Date(`${iso}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * Spells an ISO date the way a given layout's paper prints it.
 *
 * The label always holds the ISO form, so a fixture printing 04/01/2026 in the
 * day-first spelling also asks whether the app reads the day as the day.
 */
export function printDate(iso, style) {
  const [year, month, day] = iso.split("-");
  if (style === "iso") return iso;
  if (style === "eu") return `${day}/${month}/${year}`;
  return `${month}/${day}/${year}`;
}

/* ------------------------------------------------------------------ *
 * One fixture's plan
 * ------------------------------------------------------------------ */

/**
 * Builds the plan for fixture `index`, holding every value the image and the
 * label both come from.
 *
 * The merchant cycles every ten and the variant changes every ten, so each
 * merchant appears four times with a different item count, a different payment
 * method, a tip present or absent, and a time printed or absent. The arithmetic
 * closes in whole cents: the items sum to the subtotal, each tax line is the
 * rounded percentage of it, and the total is the subtotal plus every tax plus the
 * tip. A fixture whose maths did not close would measure the arithmetic checker
 * rather than the reading, and slice 7's grocery sample already covers that case.
 */
export function planFixture(index) {
  const merchant = MERCHANTS[index % MERCHANTS.length];
  const variant = Math.floor(index / MERCHANTS.length);
  const layout = LAYOUTS[merchant.layout];
  const random = mulberry32(FIXTURE_SEED + index * 7919);

  const itemCount = ITEM_COUNTS[variant];
  const items = merchant.items.slice(0, itemCount).map(([description, unitPrice]) => {
    const unitCents = decimalToCents(unitPrice);
    // A slip prints no quantity column, so every slip line is a single unit and
    // its amount is its unit price. Elsewhere a roll of the stream decides between
    // one, a small count and a weighed quantity, which is what puts a
    // three-decimal quantity such as 0.734 into the set. The quantity here is what
    // the plan drew; whether the paper prints it is the renderer's question, and
    // the label follows the renderer.
    const draw = layout.quantityColumn === "never" ? 0 : random();
    let quantity = "1";
    if (draw > 0.82) quantity = (0.5 + Math.floor(random() * 500) / 1000).toFixed(3);
    else if (draw > 0.55) quantity = String(2 + Math.floor(random() * 3));
    const amountCents = Math.round(unitCents * Number(quantity));
    return {
      description,
      quantity,
      unitPrice,
      amount: centsToDecimal(amountCents),
      amountCents,
    };
  });

  const subtotalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const taxes = merchant.taxes.map((tax) => ({
    label: tax.label,
    amountCents: Math.round(subtotalCents * tax.rate),
  }));
  // Variants 0 and 2 of a merchant that takes tips print one; variants 1 and 3 do
  // not, so the set carries both and `tip` is exercised as an absent field rather
  // than as a zero.
  const tipCents =
    merchant.tipRate !== null && variant % 2 === 0
      ? Math.round(subtotalCents * merchant.tipRate)
      : null;
  const totalCents =
    subtotalCents + taxes.reduce((sum, tax) => sum + tax.amountCents, 0) + (tipCents ?? 0);

  const payment = merchant.payments[variant % merchant.payments.length];
  const cardLast4 = CARDLESS_PAYMENTS.includes(payment)
    ? null
    : String(1000 + Math.floor(random() * 9000));

  const date = addDays("2026-01-06", index * 9);
  // Variant 3 prints no time at all, so ten of the forty ask whether the app
  // leaves `time` null instead of inventing midnight.
  const time =
    variant === 3
      ? null
      : `${String(8 + Math.floor(random() * 13)).padStart(2, "0")}:${String(
          Math.floor(random() * 60),
        ).padStart(2, "0")}`;

  return {
    index,
    id: `f${String(index + 1).padStart(2, "0")}`,
    slug: merchant.slug,
    merchant,
    variant,
    layoutName: merchant.layout,
    layout,
    degradations: DEGRADATION_MATRIX[index],
    items: items.map(({ description, quantity, unitPrice, amount }) => ({
      description,
      quantity,
      unitPrice,
      amount,
    })),
    subtotal: centsToDecimal(subtotalCents),
    taxes: taxes.map((tax) => ({ label: tax.label, amount: centsToDecimal(tax.amountCents) })),
    tip: tipCents === null ? null : centsToDecimal(tipCents),
    total: centsToDecimal(totalCents),
    payment,
    cardLast4,
    date,
    time,
    reference: `FIX-${String(index + 1).padStart(2, "0")}`,
  };
}

/** The whole set, in order. */
export function planFixtures() {
  return Array.from({ length: FIXTURE_COUNT }, (_, index) => planFixture(index));
}
