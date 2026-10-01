import { NextResponse } from "next/server";
import { extractReceipt } from "@/lib/extract-receipt";

/**
 * The Node runtime rather than the Edge runtime, because the OpenAI SDK and
 * base64 handling are both more predictable there. The per-IP limiter in slice 7
 * sits in front of this route rather than inside it.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const { status, body } = await extractReceipt(form);

  return NextResponse.json(body, { status });
}
