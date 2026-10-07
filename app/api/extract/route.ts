import { NextResponse } from "next/server";
import { extractReceipt } from "@/lib/extract-receipt";

/**
 * The Node runtime rather than the Edge runtime, because the OpenAI SDK and
 * base64 handling are both more predictable there.
 */
export const runtime = "nodejs";

/**
 * The route hands over the whole request rather than a parsed form.
 *
 * `extractReceipt` checks the hourly allowance off the headers before it parses
 * the body, so a refused request never reads the uploaded bytes. Parsing the
 * form here would spend that cost before the limiter ever ran.
 */
export async function POST(request: Request) {
  const { status, body } = await extractReceipt(request);

  return NextResponse.json(body, { status });
}
