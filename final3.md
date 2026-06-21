# FIX — Null Handle IDs Breaking Input Resolution

## Summary

Workflow execution was silently passing `undefined` inputs to Gemini and Crop Image nodes. Root cause: edges were being saved to the database with `sourceHandle: null` / `targetHandle: null`, which broke `resolveInputs()`'s ability to map a parent's output to the correct named input on a child node.

This was **not fixed** by removing the sample workflow — that would only have hidden the symptom. The actual fix is a validation gate that stops handle-less connections from ever being created, in the UI, before they reach the database.

---

## Root Cause

Two independent sources fed the same bug:

### Source 1 — Seeded sample workflow had no handle data

`createWorkflow()` inserted the sample workflow's 8 edges without `sourceHandle` / `targetHandle` values at all — hardcoded as missing/null from the start.

### Source 2 — Hand-drawn connections could also produce null handles

When a user drags a connection in React Flow, `targetHandle` is only populated if the drop lands precisely on a **named** `<Handle>` element. If the drop lands on the generic node body instead, React Flow completes the connection anyway — but with `targetHandle: null`.

This second source is the more serious one: it means **any user, on the finished product, can still create a broken edge by hand** — independent of whether the sample workflow exists.

### Why it broke execution

```ts
// resolveInputs.ts
const handleKey = edge.targetHandle ?? "default";
inputs[handleKey] = parentOutput;
```

Every null-handle edge collapsed into the same `"default"` key. Meanwhile, `nodeRunner.ts` was looking up specific keys:

```ts
const promptInput = inputs["prompt"];  // undefined — actual key was "default"
const imageInput  = inputs["image"];   // undefined — actual key was "default"
```

Result: Gemini fired with an empty prompt, Crop Image threw because it had no image URL — both silently, with no validation error anywhere in the chain.

---

## The Fix (Three Layers)

### ✅ Layer 1 — Prevention: reject handle-less connections in `isValidConnection`

This is the **actual fix**. It stops the bad data from ever being created, instead of working around it after the fact.

**File:** `src/app/workflow/[workflowId]/WorkflowCanvas.tsx`

```ts
const isValidConnection = useCallback((connection: Connection) => {
  // Reject immediately if either handle is missing — this is the core fix
  if (!connection.sourceHandle || !connection.targetHandle) {
    return false;
  }

  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  if (!sourceNode || !targetNode) return false;

  const sourceType = HANDLE_TYPES[sourceNode.type!]?.[connection.sourceHandle];
  const targetType = HANDLE_TYPES[targetNode.type!]?.[connection.targetHandle];
  if (!sourceType || !targetType) return false;

  if (sourceType !== targetType) return false;
  if (targetNode.type === "requestInputs") return false; // pure source, never a target
  if (sourceNode.type === "response") return false;       // pure sink, never a source

  const simulatedEdges = [...edges, { sourceNode: connection.source!, targetNode: connection.target! }];
  if (hasCycle(nodes, simulatedEdges)) return false;

  return true;
}, [nodes, edges]);
```

With this in place, React Flow will **refuse to complete the connection visually** if the user drops on the node body instead of a named handle dot — the edge simply won't draw, instead of drawing and silently saving broken data.

---

### ✅ Layer 2 — Data hygiene: seed data now includes explicit handles

**File:** `src/actions/workflow.ts` (or wherever `createWorkflow` seeds the sample workflow)

Every seeded edge must specify both handles explicitly, matching the type table in `handleTypes.ts`:

```ts
{ sourceNode: requestInputsId, targetNode: cropId,  sourceHandle: "image_field", targetHandle: "image_in" }
{ sourceNode: requestInputsId, targetNode: geminiId, sourceHandle: "text_field",  targetHandle: "prompt" }
{ sourceNode: cropId,          targetNode: finalGeminiId, sourceHandle: "image_out", targetHandle: "image" }
{ sourceNode: geminiId,        targetNode: responseId,    sourceHandle: "response",  targetHandle: "input" }
// ...and so on for the full sample graph
```

> The sample workflow is a required deliverable per the original spec ("Pre-built sample workflow as specified") — it was **not removed**. Only its seed data was corrected.

---

### ✅ Layer 3 — Defense in depth: graceful fallback in `nodeRunner.ts`

Kept as a **safety net only**, not as the primary fix — it protects against any legacy/malformed data that predates Layer 1, but should rarely trigger going forward. A warning is logged whenever it activates, so silent guessing doesn't go unnoticed:

```ts
// nodeRunner.ts
const promptInput =
  inputs["prompt"] ??
  inputs["default"] ??
  (() => {
    console.warn(
      "⚠️ [nodeRunner] No matching handle key for prompt input — falling back to first available input. Node:",
      node.id
    );
    return Object.values(inputs)[0];
  })();

const imageRaw =
  inputs["image_in"] ??
  inputs["default"] ??
  (() => {
    console.warn(
      "⚠️ [nodeRunner] No matching handle key for image input — falling back to first available input. Node:",
      node.id
    );
    return Object.values(inputs)[0];
  })();

const finalOutput = inputs["input"] ?? inputs["default"] ?? inputs;
```

> ⚠️ **Important limitation:** `Object.values(inputs)[0]` picks whichever input happens to be first in insertion order. This is fine for single-parent nodes, but **unreliable for fan-in nodes** (e.g. Final Gemini receiving from both Crop1 and Crop2) — it can silently pick the wrong parent's output. Layer 1 prevents this scenario from occurring in new workflows; this fallback exists only to avoid a hard crash on old/malformed data, not to be relied on for correctness.

---

## Why the Sample Workflow Was Kept (Not Removed)

It was tempting to delete the sample workflow to make this bug "go away," but that would have:

1. **Failed a required deliverable** — "Pre-built sample workflow as specified" is explicitly listed in the assignment checklist.
2. **Not fixed anything** — hand-drawn connections had the identical vulnerability (Source 2 above). The bug would still exist for every real user-built workflow.

The correct fix targets the actual defect: connections without named handles should never be allowed to save, regardless of whether they come from seed data or a user's drag gesture.

---

## Verification Checklist

```
□ Attempt to drag a connection and drop it on a node's body (not a handle dot) — confirm the edge is rejected and does not draw.
□ Inspect DB after creating a fresh sample workflow — confirm all edges have non-null sourceHandle/targetHandle.
□ Inspect DB after manually drawing connections on canvas — confirm same.
□ Run the sample workflow end-to-end — confirm Gemini receives a real prompt, Crop receives a real image URL.
□ Check terminal logs for any ⚠️ fallback warnings during a normal run — should be zero on a freshly-seeded workflow.
□ Test a fan-in case (two parents → one node, e.g. Crop1 + Crop2 → Final Gemini) — confirm both parent outputs are correctly resolved by handle key, not just the first one found.
```

---

## Summary Table

| Layer | Purpose | File | Status |
|---|---|---|---|
| 1. Prevention | Block null-handle connections at creation time | `WorkflowCanvas.tsx` → `isValidConnection` | **Primary fix — required** |
| 2. Data hygiene | Seed data uses explicit, correct handle IDs | `actions/workflow.ts` | Already corrected |
| 3. Defense in depth | Graceful fallback + warning for legacy data | `server/execution/nodeRunner.ts` | Safety net only — not a substitute for Layer 1 |