// app/api/transloadit-signature/route.ts

import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST() {
  const key        = process.env.TRANSLOADIT_KEY;
  const secret     = process.env.TRANSLOADIT_SECRET;
  const templateId = process.env.TRANSLOADIT_TEMPLATE_ID;

  if (!key || !secret || !templateId) {
    return NextResponse.json(
      { error: "Transloadit env vars not configured." },
      { status: 500 }
    );
  }

  const expires = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace(/-/g, "/")
    .replace("T", " ")
    .replace(/\.\d+Z$/, "+00:00");

  const params = {
    auth: { key, expires },
    template_id: templateId,
  };

  // ✅ Sign the stringified version
  const paramsStr = JSON.stringify(params);

  const signature =
    "sha384:" +
    crypto
      .createHmac("sha384", secret)
      .update(Buffer.from(paramsStr, "utf-8"))
      .digest("hex");

  // ✅ Return params as plain OBJECT (not string)
  return NextResponse.json({ params, signature });
}