/**
 * The pinned model, kept in one module so slice 9 swaps it in one line.
 *
 * `gpt-6.1-sol` was read off OpenAI's published model list on 2026-10-01. That
 * page records `image_input` and `structured_outputs` among its supported
 * features, text and image input, a 1,050,000-token context window with 128,000
 * output tokens, and $2 per million input tokens against `gpt-6-astra` at $10.
 *
 * `gpt-6-luna` costs $0.10 per million input and stays the candidate to measure
 * against once slice 9 has the 40 labelled fixtures. Faded thermal paper is where
 * the cheapest model fails, and this slice has no accuracy numbers to judge it
 * by. Whoever swaps this id checks that the replacement accepts image input and
 * supports strict Structured Outputs, and reruns the accuracy figures in the same
 * change.
 */
export const EXTRACTION_MODEL = "gpt-6.1-sol";

/** The instruction that rides beside the schema. Slice 9 tunes it against the fixtures. */
export const EXTRACTION_PROMPT = [
  "Read this photograph of a receipt and fill in the fields of the schema.",
  "Copy every amount exactly as the receipt prints it, as a decimal string, and never round or convert it.",
  "Leave a field null when the receipt does not print it. Do not invent a value and do not fill a missing amount with zero.",
  "Set each field's confidence to how sure you are of that value, and each sourceText to the characters you read the value from.",
  "Infer currency from the printed symbol and the address. Leave it null when neither settles it, rather than guessing USD.",
  "Give date as the printed calendar date in ISO form, with no timezone applied, and time on a 24-hour clock.",
  "Fill lineItems with one entry per purchased line the receipt prints, in the printed order, each carrying its description, quantity, unit price and amount.",
  "Give each quantity as printed, so a weighed item reads \"0.734\" and a count of two reads \"2\", and leave quantity null when the line prints none rather than defaulting it to 1.",
  "Leave lineItems empty when the receipt itemizes nothing, such as a card slip printing a total alone, and never invent an entry to fill it.",
  "Set isReceipt to false with a short reason when the image is something other than a receipt, and leave every field null.",
].join(" ");
