# FIX — Gemini Task Never Starts in Trigger.dev

## Symptom

When a workflow run reaches a `GeminiModel` node, the `gemini-generate` Trigger.dev task **never appears at all** in the `npx trigger.dev@latest dev` terminal — no logs, no error, nothing. The Crop Image task may or may not be affected the same way; this doc assumes Crop works and Gemini specifically does not (adjust diagnosis order if both are broken).

This is different from a task that starts and then fails — "never appears" means the failure happens **before** Trigger.dev's runtime is ever reached. The bug is upstream of `geminiGenerate.ts` itself, so the task file's internal logic is not the first place to look.

---

## Diagnosis Order

Work through these in order — each one rules out a layer, fastest checks first.

### 1. Is the `trigger.dev dev` terminal actually running?

```bash
npx trigger.dev@latest dev
```

This terminal must stay open for the entire testing session. If it was closed (computer restart, accidental Ctrl+C, etc.), **no task of any kind will execute**, and you'd see exactly this symptom — total silence, no errors.

**Check:** does the terminal currently show `Waiting for tasks...`? Does its task list include `gemini-generate`?

```
Tasks:
  crop-image
  gemini-generate     ← must be listed here
```

If `gemini-generate` is **missing from this list** while `crop-image` is present, the problem is a build/registration failure specific to that file — go to step 2. If both are listed correctly, skip to step 3.

---

### 2. Does `geminiGenerate.ts` fail to build/register?

Trigger.dev must successfully build each task file before it can register it. A missing dependency or syntax error in `geminiGenerate.ts` can silently prevent registration while other task files build fine.

**Check the dependency is installed:**

```bash
npm ls @google/generative-ai
```

If missing:

```bash
npm install @google/generative-ai
```

**Check the `trigger.dev dev` terminal's startup output** for any red/error text related to `geminiGenerate.ts`, printed during its build step (before "Waiting for tasks..." appears). Restart the terminal and watch closely:

```bash
npx trigger.dev@latest dev
```

---

### 3. Is `triggerAndWait` throwing silently before reaching Trigger.dev?

If the task is correctly registered (confirmed in step 1) but still never fires, the call site in `nodeRunner.ts` may be throwing an exception **before** the request ever leaves your Next.js process — e.g. an auth/connectivity error with the Trigger.dev SDK itself.

This goes unnoticed if the surrounding DAG scheduler catches the error and marks the node `"Failed"` without logging it — which matches "no specific error shown, just doesn't work."

**Fix — add explicit logging around the call temporarily:**

```ts
// src/server/execution/nodeRunner.ts — inside the "GeminiModel" case
console.log("🔵 [nodeRunner] About to call triggerAndWait for gemini-generate...");

try {
  const result = await tasks.triggerAndWait<typeof geminiTask>("gemini-generate", {
    prompt: finalPrompt,
    systemPrompt: node.config.systemPrompt ?? node.config.system_prompt,
    imageBase64: imageBase64,
    nodeExecutionId: nodeExecution.id,
  });
  console.log("✅ [nodeRunner] triggerAndWait returned. ok =", result.ok);
} catch (err) {
  console.error("🔴 [nodeRunner] triggerAndWait THREW before reaching Trigger.dev:", err);
  throw err;
}
```

Run the workflow again and check your **Next.js terminal** (not the trigger.dev one) for the `🔴` log. If it appears, the task call is failing at the SDK level — go to step 4.

---

### 4. Check task ID consistency

Confirm the string used to trigger the task matches the task's own `id` field **exactly** — including hyphen vs. underscore.

```ts
// geminiGenerate.ts
export const geminiTask = task({
  id: "gemini-generate",   // ← source of truth
  // ...
});
```

```ts
// nodeRunner.ts
tasks.triggerAndWait<typeof geminiTask>("gemini-generate", { ... })
//                                       ^^^^^^^^^^^^^^^^^ must match exactly
```

A mismatch like `"gemini_generate"` vs `"gemini-generate"` means Trigger.dev has no matching task to dispatch to.

---

### 5. Check environment variables

```env
# .env.local
TRIGGER_SECRET_KEY=tr_dev_...
GEMINI_API_KEY=AIza...
```

Both must be present. **Restart `npm run dev` fully** after editing `.env.local` — Next.js only reads this file at boot, not on save.

---

## Root Cause Classification

| Where it broke | Symptom | Fix |
|---|---|---|
| `trigger.dev dev` not running | Nothing executes, ever, for any task | Start/restart the terminal |
| Build/registration failure | Task missing from registered task list | Install missing deps, check for syntax errors in that file |
| `triggerAndWait` throws pre-dispatch | Silent failure caught by scheduler's try/catch | Add explicit logging; fix underlying SDK/auth error revealed |
| Task ID mismatch | Trigger.dev has no matching task | Make `id` and call-site string identical |
| Missing env vars | Auth failure inside the SDK call | Add `TRIGGER_SECRET_KEY` / `GEMINI_API_KEY`, restart dev server |

---

## Why the Task File's Internal Logic Wasn't the First Suspect

`geminiGenerate.ts` itself (the Gemini API call, prompt handling, DB update) only matters **once the task actually starts running** inside Trigger.dev's runtime. "Never appears at all" rules out everything inside that file as a first cause — if the Gemini API key were wrong, or the prompt malformed, you would still see the task **start** in the `trigger.dev dev` terminal and then fail with a visible error. Total silence means the problem is somewhere between your Next.js scheduler and Trigger.dev's task registry, not inside the task's business logic.

---

## Verification Checklist

```
□ `npx trigger.dev@latest dev` terminal is open and shows "gemini-generate" in its task list
□ @google/generative-ai is installed (npm ls @google/generative-ai)
□ No build errors shown in the trigger.dev dev terminal on startup
□ Added try/catch logging around triggerAndWait — confirmed it does NOT throw
□ Task id string matches exactly between geminiGenerate.ts and nodeRunner.ts
□ TRIGGER_SECRET_KEY and GEMINI_API_KEY both present in .env.local
□ npm run dev was restarted after any .env.local change
□ Re-ran the workflow — gemini-generate now appears and executes in the trigger.dev dev terminal
```

---

## Next Step If Still Unresolved

If all five checks above pass and the task still never appears, paste the **exact output** of the `trigger.dev dev` terminal's startup log (the section before "Waiting for tasks...") — that will show whether `geminiGenerate.ts` is even being discovered as a file in the `trigger/` directory at all, which would point to a config issue in `trigger.config.ts` (e.g. wrong `dirs` path) rather than anything in the task file itself.