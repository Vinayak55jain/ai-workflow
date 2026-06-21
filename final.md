# Transloadit Integration — Request-Inputs Image Upload

## Scope

Per the updated submission requirements:
> "Image upload via Transloadit (inside a Request-Inputs `image_field`)"

This replaces the current `FileReader` + base64 approach in `RequestInputsNode.tsx` with a real upload pipeline. **This does NOT change the Crop Image node's FFmpeg logic** — that task still runs as specified in the original assignment doc. Transloadit's only job here is: user picks a file → Uppy uploads it through Transloadit → Transloadit returns a public URL → that URL becomes `image_field`'s value.

```
Before:  <input type="file"> → FileReader → giant base64 string stored in node config
After:   Uppy Dashboard → Transloadit → real hosted URL stored in node config
```

This also fixes a latent problem: your Crop task's `fetch(payload.imageUrl)` expects a real URL — a base64 string was never going to work cleanly there long-term.

---

## Step 1 — Account Setup (you do this manually)

1. Sign up at [transloadit.com/c/signup](https://transloadit.com/c/signup/) — free Community Plan, 5 GB included, no credit card required.
2. In the Transloadit dashboard, create a **Template** with one Step: `:original` import → `/image/resize` (or just store-as-is if you don't need resizing). At minimum, you need a Template that accepts an image upload and stores it (Transloadit's default S3-backed storage works fine for this).
3. Copy your **Auth Key** and the new **Template ID** — you'll need both.

```env
# .env.local
TRANSLOADIT_AUTH_KEY=your_auth_key_here
TRANSLOADIT_AUTH_SECRET=your_auth_secret_here
TRANSLOADIT_TEMPLATE_ID=your_template_id_here
```

> ⚠️ **Security note, confirmed by Transloadit's own docs:** the Auth *Secret* must never reach the browser. Assembly options (which include the signed request) must be generated **server-side** and fetched by the client — never hardcode keys directly into Uppy's client config.

---

## Step 2 — Install Dependencies

```bash
npm install @uppy/core @uppy/react @uppy/transloadit @uppy/dashboard
```

These are Transloadit's own officially maintained packages — not a third-party wrapper.

---

## Step 3 — Backend Route to Generate Signed Assembly Options

**[NEW] `src/app/api/transloadit-params/route.ts`**

This is the server-side piece Uppy's client calls to get its (secret-signed) upload configuration — the secret itself never leaves this route.

```ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const authKey = process.env.TRANSLOADIT_AUTH_KEY!;
  const authSecret = process.env.TRANSLOADIT_AUTH_SECRET!;
  const templateId = process.env.TRANSLOADIT_TEMPLATE_ID!;

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

function getExpiryString(): string {
  // Assembly must be used within this window — 1 hour is generous for a single upload
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return date
    .toISOString()
    .replace(/-/g, "/")
    .replace("T", " ")
    .replace(/\.\d+Z$/, "+00:00");
}
```

> Note: Uppy's `@uppy/transloadit` plugin expects `assemblyOptions()` to return `{ params, signature }` shaped like Transloadit's signed-request format — this matches their documented pattern.

---

## Step 4 — Replace the Upload UI in `RequestInputsNode.tsx`

**[MODIFY] `src/components/nodes/RequestInputsNode.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import Uppy from "@uppy/core";
import { Dashboard } from "@uppy/react";
import Transloadit from "@uppy/transloadit";
import "@uppy/core/css/style.css";
import "@uppy/dashboard/css/style.css";
import { useWorkflowStore } from "@/store/workflowStore";

type RequestInputsData = {
  config: {
    text_field?: string;
    image_field?: string; // now stores a real Transloadit-hosted URL
  };
};

export function RequestInputsNode({ id, data }: NodeProps<RequestInputsData>) {
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const textValue = data.config?.text_field ?? "";
  const imageValue = data.config?.image_field ?? "";

  const [showUploader, setShowUploader] = useState(false);

  const [uppy] = useState(() => {
    const instance = new Uppy({
      restrictions: { maxNumberOfFiles: 1, allowedFileTypes: ["image/*"] },
    });

    instance.use(Transloadit, {
      async assemblyOptions() {
        const res = await fetch("/api/transloadit-params");
        return res.json();
      },
      waitForEncoding: true, // wait for the file to finish processing before "complete" fires
    });

    instance.on("complete", (result) => {
      const uploadedFile = result.successful?.[0];
      const hostedUrl =
        uploadedFile?.transloadit?.results?.[":original"]?.[0]?.ssl_url ??
        uploadedFile?.uploadURL;

      if (hostedUrl) {
        updateNodeConfig(id, "image_field", hostedUrl);
        setShowUploader(false);
      }
    });

    return instance;
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-72 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">Request-Inputs</span>
      </div>

      {/* TEXT FIELD */}
      <div className="relative mb-3">
        <label className="text-xs text-gray-500 mb-1 block">text_field</label>
        <textarea
          value={textValue}
          onChange={(e) => updateNodeConfig(id, "text_field", e.target.value)}
          className="w-full text-xs border rounded p-2 resize-none"
          rows={3}
        />
        <Handle
          type="source"
          id="text_field"
          position={Position.Right}
          style={{ background: "#f97316", width: 10, height: 10, top: "50%" }}
        />
      </div>

      {/* IMAGE FIELD — now via Transloadit */}
      <div className="relative">
        <label className="text-xs text-gray-500 mb-1 block">image_field</label>

        {imageValue ? (
          <div className="relative">
            <img
              src={imageValue}
              alt="Uploaded"
              className="w-full h-24 object-cover rounded border"
            />
            <button
              onClick={() => setShowUploader(true)}
              className="absolute top-1 right-1 bg-white/90 text-xs px-2 py-0.5 rounded shadow"
            >
              Replace
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowUploader(true)}
            className="w-full text-xs border rounded p-2 flex items-center justify-center gap-1 bg-gray-50 hover:bg-gray-100"
          >
            📤 Upload Image
          </button>
        )}

        {showUploader && (
          <div className="absolute z-50 top-full left-0 mt-1 shadow-xl">
            <Dashboard uppy={uppy} height={300} width={350} />
          </div>
        )}

        <Handle
          type="source"
          id="image_field"
          position={Position.Right}
          style={{ background: "#3b82f6", width: 10, height: 10, top: "50%" }}
        />
      </div>
    </div>
  );
}
```

---

## Step 5 — Confirm Downstream Tasks Still Work Unchanged

Since `image_field` now holds a **real URL** instead of base64, your existing `nodeRunner.ts` logic actually gets *simpler and more reliable* — no changes needed to `cropImage.ts` or `geminiGenerate.ts`, since both already expect `imageUrl`/`imageBase64` resolved from a string. Just confirm this fallback chain in `nodeRunner.ts`'s `CropImage` case correctly picks up the new URL shape:

```ts
const imageUrl =
  imageRaw?.croppedImageUrl ??
  imageRaw?.image_field ??
  (typeof imageRaw === "string" ? imageRaw : undefined);
```

This already handles it correctly — `imageRaw?.image_field` will now resolve to a real Transloadit URL instead of a base64 blob. No change required here.

---

## Verification Checklist

```
□ Transloadit account created, Template configured, Auth Key + Secret + Template ID in .env.local
□ npm install @uppy/core @uppy/react @uppy/transloadit @uppy/dashboard completed
□ /api/transloadit-params route returns valid { params, signature } JSON
□ Clicking "Upload Image" in Request-Inputs opens the Uppy Dashboard
□ Uploading a file shows progress, then completes
□ image_field config value is now a real https:// URL, not base64
□ Crop Image node downstream still receives and processes this URL correctly
□ Confirm TRANSLOADIT_AUTH_SECRET never appears in browser network tab / client bundle
```

---

## Files Summary

```
[NEW]    src/app/api/transloadit-params/route.ts
[MODIFY] src/components/nodes/RequestInputsNode.tsx
[MODIFY] .env.local — add TRANSLOADIT_AUTH_KEY, TRANSLOADIT_AUTH_SECRET, TRANSLOADIT_TEMPLATE_ID
[NO CHANGE] src/trigger/cropImage.ts — already handles imageUrl as a string correctly
[NO CHANGE] src/trigger/geminiGenerate.ts — unaffected
```