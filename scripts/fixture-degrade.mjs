/**
 * The seven degradations a fixture can carry, as named steps over one image.
 *
 * A clean render measures the schema and the parsing rather than the reading, so
 * the fixture set damages most of its receipts on purpose. Each step here takes a
 * greyscale raw image and returns one, which is what makes them composable in any
 * combination the matrix asks for, and none of them touches a label: the label is
 * written from the plan, so damaging the pixels cannot change what the receipt is
 * supposed to say.
 *
 * Every step is deterministic. The ones that need chance take a seeded stream from
 * `scripts/fixture-plan.mjs` rather than calling `Math.random`, so two runs of the
 * generator produce the same bytes.
 *
 * Greyscale throughout, for two reasons: thermal paper and a flatbed scan are both
 * near enough to grey already, and one channel keeps the forty committed files
 * small enough to live in git.
 */

import sharp from "sharp";

/**
 * The step names, in the order they are applied.
 *
 * The order is fixed here rather than taken from the matrix, because fading paper
 * that is already blurred is a different image from blurring paper that is already
 * faded, and a reader of the matrix should not have to know which listing order
 * meant what. It runs the way a real photograph happens: the paper ages, the lens
 * misses focus, the camera is held at an angle, the frame clips the edges, the
 * sensor adds grain, and the file is compressed last.
 */
export const DEGRADATION_STEPS = [
  "fade",
  "blur",
  "rotate",
  "perspective",
  "crop",
  "noise",
  "jpeg",
];

/** The quality the generator writes a fixture at when it carries no `jpeg` step. */
export const BASELINE_QUALITY = 78;

/** The quality the `jpeg` step re-encodes through, which is where the artifacts come from. */
export const HEAVY_QUALITY = 30;

/**
 * Rasterizes an SVG string into the one-channel raw image every step works on.
 *
 * `removeAlpha` is the line that matters. An SVG renders to RGBA, and `greyscale`
 * leaves the alpha channel attached, so the raw buffer arrives two bytes per pixel
 * and every step that walks it one byte at a time reads every second pixel as the
 * opaque 255. The first fixtures drawn without it came out as pale horizontal
 * smears, which is why the check below throws rather than trusting the pipeline.
 */
export async function rasterize(svg) {
  const { data, info } = await sharp(Buffer.from(svg))
    .flatten({ background: "#ffffff" })
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`expected one channel, got ${info.channels}`);
  return { data, width: info.width, height: info.height };
}

/** Wraps a raw image back into a sharp pipeline, so a step can borrow libvips. */
function pipeline(image) {
  return sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 1 },
  });
}

/**
 * Takes a sharp pipeline back to the one-channel raw image the steps pass around.
 *
 * `toColourspace` is what keeps it one channel. libvips hands blur, rotate and
 * extract back in sRGB even when it was given a single band, so without this line
 * the buffer arrives three bytes per pixel while the width and height say one, and
 * every later step reads the receipt three times as wide as it is. That is exactly
 * how the first damaged fixtures came out, and the throw below is what stops it
 * happening again silently.
 */
async function toRaw(instance) {
  const { data, info } = await instance
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`expected one channel, got ${info.channels}`);
  return { data, width: info.width, height: info.height };
}

/* ------------------------------------------------------------------ *
 * The steps
 * ------------------------------------------------------------------ */

/**
 * Thermal paper loses its ink from the bottom of the roll up, because that end sat
 * in the wallet against the light, so the fade is a gradient rather than one
 * multiplier. The ink is pulled toward the paper value: at the top it keeps 80
 * percent of its contrast and at the bottom 52 percent, which leaves a receipt a
 * person can still read and a model has to work at. The first pass at 62 and 34
 * stacked with the blur into a page nobody could read, which is what looking at
 * the fixtures caught.
 */
async function fade(image, { paper }) {
  const data = Buffer.from(image.data);
  for (let y = 0; y < image.height; y += 1) {
    const keep = 0.8 - 0.28 * (y / Math.max(1, image.height - 1));
    const row = y * image.width;
    for (let x = 0; x < image.width; x += 1) {
      const at = row + x;
      data[at] = Math.round(paper - (paper - data[at]) * keep);
    }
  }
  return { ...image, data };
}

/** A hand-held camera misses focus by about a pixel, which is what a 1.0 sigma blur is. */
async function blur(image) {
  return toRaw(pipeline(image).blur(1.0));
}

/** Nobody holds a receipt square to the lens. The direction comes off the seeded stream. */
async function rotate(image, { paper, random }) {
  const degrees = (random() < 0.5 ? -1 : 1) * (1.8 + random() * 1.6);
  return toRaw(pipeline(image).rotate(degrees, { background: { r: paper, g: paper, b: paper } }));
}

/**
 * The keystone a camera leaves when it looks down at a receipt on a table.
 *
 * Each output row is sampled from a source row scaled about the centre, narrowing
 * the far end of the page by 11 percent, with bilinear sampling so the strokes
 * stay smooth. It is a trapezoid rather than a full homography: the vertical
 * foreshortening a real lens adds is left out, because what matters for reading is
 * that the columns of figures no longer line up under each other.
 */
async function perspective(image, { paper, random }) {
  const { width, height } = image;
  const narrow = 0.11;
  const atTop = random() < 0.5;
  const data = Buffer.alloc(width * height, paper);
  const centre = (width - 1) / 2;

  for (let y = 0; y < height; y += 1) {
    const along = atTop ? 1 - y / Math.max(1, height - 1) : y / Math.max(1, height - 1);
    const scale = 1 - narrow * along;
    for (let x = 0; x < width; x += 1) {
      const sourceX = (x - centre) / scale + centre;
      if (sourceX < 0 || sourceX > width - 1) continue;
      const left = Math.floor(sourceX);
      const right = Math.min(width - 1, left + 1);
      const mix = sourceX - left;
      const row = y * width;
      data[row + x] = Math.round(
        image.data[row + left] * (1 - mix) + image.data[row + right] * mix,
      );
    }
  }
  return { ...image, data };
}

/**
 * A photograph clips the edges of the paper.
 *
 * The slice taken is smaller than the layout's margin, so the crop eats white
 * paper and never a printed character. That is a deliberate limit: a crop that cut
 * into the print would make the label unreachable, and the whole point of the
 * matrix is that no degradation changes what the receipt says.
 */
async function crop(image) {
  const left = Math.round(image.width * 0.025);
  const top = Math.round(image.height * 0.012);
  return toRaw(
    pipeline(image).extract({
      left,
      top,
      width: image.width - left * 2,
      height: image.height - top * 2,
    }),
  );
}

/**
 * Sensor grain, from the seeded stream, as the sum of two draws so the
 * distribution has a middle rather than being flat.
 */
async function noise(image, { random }) {
  const data = Buffer.from(image.data);
  for (let at = 0; at < data.length; at += 1) {
    const offset = Math.round((random() + random() - 1) * 26);
    data[at] = Math.min(255, Math.max(0, data[at] + offset));
  }
  return { ...image, data };
}

/**
 * A messaging app has already recompressed this photograph once.
 *
 * The step encodes at quality 30 and decodes straight back, so the ringing around
 * every stroke is baked into the pixels and the generator can still write every
 * fixture at one quality. Doing it this way keeps `jpeg` a step like the other six
 * rather than a flag on the final write.
 */
async function jpeg(image) {
  const encoded = await pipeline(image)
    .jpeg({ quality: HEAVY_QUALITY, chromaSubsampling: "4:2:0" })
    .toBuffer();
  return toRaw(sharp(encoded).greyscale());
}

/** Every step by name. The test asserts this covers exactly `DEGRADATION_STEPS`. */
export const STEPS = { fade, blur, rotate, perspective, crop, noise, jpeg };

/* ------------------------------------------------------------------ *
 * Applying a combination
 * ------------------------------------------------------------------ */

/**
 * Applies the named degradations in `DEGRADATION_STEPS` order and returns the
 * damaged image.
 *
 * An unknown name throws rather than being skipped, because a typo in the matrix
 * that silently produced a clean fixture would raise the published figure for no
 * reason anybody could see.
 */
export async function applyDegradations(image, names, { paper, random }) {
  for (const name of names) {
    if (!STEPS[name]) throw new Error(`unknown degradation: ${name}`);
  }
  let current = image;
  for (const name of DEGRADATION_STEPS) {
    if (!names.includes(name)) continue;
    current = await STEPS[name](current, { paper, random });
  }
  return current;
}

/** Encodes the finished image as the JPEG a fixture is committed as. */
export async function encodeJpeg(image) {
  return pipeline(image)
    .toColourspace("b-w")
    .jpeg({ quality: BASELINE_QUALITY, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
