import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * Returns signed Transloadit assembly options for the Uppy client.
 * The auth secret never leaves this route — the client only receives
 * the pre-signed params + HMAC signature.
 */
export async function GET() {
  const authKey    = process.env.TRANSLOADIT_AUTH_KEY;
  const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
  const templateId = process.env.TRANSLOADIT_TEMPLATE_ID;

  if (!authKey || !authSecret || !templateId) {
    return NextResponse.json(
      { error: "Transloadit env vars not configured. Add TRANSLOADIT_AUTH_KEY, TRANSLOADIT_AUTH_SECRET, TRANSLOADIT_TEMPLATE_ID to .env" },
      { status: 500 }
    );
  }

  const params = {
    auth: { key: authKey, expires: getExpiryString() },
    template_id: templateId,
  };

  const paramsStr = JSON.stringify(params);
  const signature = crypto
    .createHmac("sha384", authSecret)
    .update(Buffer.from(paramsStr, "utf-8"))
    .digest("hex");

  return NextResponse.json({
    params: paramsStr,
    signature: `sha384:${signature}`,
  });
}

/** Assembly expiry — 1 hour from now in Transloadit's expected format */
function getExpiryString(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return date
    .toISOString()
    .replace(/-/g, "/")
    .replace("T", " ")
    .replace(/\.\d+Z$/, "+00:00");
}
