# Fix: Transloadit `INSUFFICIENT_AUTH_SCOPE` Error in Next.js + Uppy

## Error Details

| Field | Info |
|---|---|
| **Error Type** | Console Error |
| **Error Message** | `[Uppy] [01:13:45] "Transloadit: Could not create Assembly: INSUFFICIENT_AUTH_SCOPE"` |
| **Framework** | Next.js 16.2.9 (Turbopack) |
| **Trigger** | Clicking the Upload button |

---

## Why This Happens

Transloadit requires an **Auth Signature** to be generated on your **server (backend)**, not on the frontend. If you're generating it on the frontend or using a wrong/limited key, you get this error.

> ⚠️ Never generate or expose your Transloadit secret on the client side.

---

## Step-by-Step Fix

### Step 1 — Add Credentials to `.env.local`

```env
TRANSLOADIT_KEY=your_key_here
TRANSLOADIT_SECRET=your_secret_here
```

> Get these from your [Transloadit Dashboard → Credentials](https://transloadit.com/c/credentials).

---

### Step 2 — Create a Backend API Route (Signature Generator)

Create the file: `app/api/transloadit-signature/route.js`

```js
import crypto from "crypto";

export async function POST(req) {
  const secret = process.env.TRANSLOADIT_SECRET;
  const key = process.env.TRANSLOADIT_KEY;

  const params = {
    auth: {
      key: key,
      expires: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour
    },
    template_id: "your_template_id_here", // Replace with your Transloadit template ID
  };

  const paramsStr = JSON.stringify(params);

  const signature = crypto
    .createHmac("sha384", secret)
    .update(Buffer.from(paramsStr, "utf-8"))
    .digest("hex");

  return Response.json({
    params: paramsStr,
    signature: `sha384:${signature}`,
  });
}
```

---

### Step 3 — Use the Signature in Your Frontend (Uppy)

```js
import Uppy from "@uppy/core";
import Transloadit from "@uppy/transloadit";

const uppy = new Uppy();

// Fetch signature from YOUR backend before uploading
const res = await fetch("/api/transloadit-signature", {
  method: "POST",
});
const { params, signature } = await res.json();

uppy.use(Transloadit, {
  assemblyOptions: {
    params: JSON.parse(params),
    signature: signature,
  },
});
```

---

### Step 4 — Verify on Transloadit Dashboard

1. Go to [transloadit.com](https://transloadit.com) → **Credentials**
2. Make sure your API key is **active**
3. Confirm your key has permission to **create assemblies**

---

## Common Mistakes & Fixes

| ❌ Mistake | ✅ Fix |
|---|---|
| Signing on frontend | Always sign on backend |
| Expired auth token | Set `expires` to a future time |
| Wrong secret key | Double-check `.env.local` values |
| Missing `sha384:` prefix | Add it before the hex signature string |

---

## How It Works (Flow)

```
User clicks Upload
      ↓
Frontend calls /api/transloadit-signature  (your Next.js backend)
      ↓
Backend signs the params with TRANSLOADIT_SECRET
      ↓
Frontend receives { params, signature }
      ↓
Uppy sends signed request to Transloadit ✅
      ↓
Assembly created successfully
```

---

## References

- [Transloadit Auth Docs](https://transloadit.com/docs/api/auth/)
- [Uppy Transloadit Plugin](https://uppy.io/docs/transloadit/)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)