# Implementation Plan: Complete Workflow Builder (Phases 7–10)

## Overview

Implement the six remaining areas to complete the AI Workflow Builder: the Gemini
Trigger.dev task, execution history API + UI sidebar, sample workflow seeding, Zod
validation schemas, toast notifications with loading states, and TypeScript strict mode.
Each task builds on the previous one. The DAG engine, node UIs, Clerk auth, and Prisma
schema are already in place.

---

## Tasks

- [x] 1. Create Zod validation schemas
  - Create `src/lib/schemas.ts` with `WorkflowSchema`, `CropConfigSchema`, `GeminiConfigSchema`, and `ExecuteWorkflowSchema`
  - `WorkflowSchema`: `name` must be a non-empty string
  - `CropConfigSchema`: `x`, `y` are numbers; `width` and `height` are positive numbers
  - `GeminiConfigSchema`: `prompt` is a non-empty string; `systemPrompt` is optional string
  - `ExecuteWorkflowSchema`: `workflowId` is a non-empty string; `mode` is `"full" | "single" | "multi"`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 1.1 Write property tests for Zod schema validation
    - Install `fast-check` and `vitest` as devDependencies
    - **Property 1: CropConfigSchema rejects non-positive dimensions** — for any `width` or `height` ≤ 0, `safeParse` returns `{ success: false }`
    - **Property 2: GeminiConfigSchema rejects empty/whitespace prompt** — for any all-whitespace or empty prompt string, `safeParse` returns `{ success: false }`
    - **Property 3: ExecuteWorkflowSchema rejects invalid mode** — for any string not in `["full","single","multi"]`, `safeParse` returns `{ success: false }`
    - Tag each test: `// Feature: complete-workflow-builder, Property N: ...`
    - Minimum 100 iterations per property
    - _Requirements: 6.3, 6.4, 6.5_

- [x] 2. Implement Gemini Trigger.dev task
  - Create `src/trigger/geminiGenerate.ts` with task id `"gemini-generate"`
  - Accept payload: `{ prompt: string; systemPrompt?: string; imageBase64?: string; nodeExecutionId: string }`
  - Build `Part[]` array: always include `{ text: prompt }`; if `imageBase64` present, add `{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } }`
  - Call `genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: payload.systemPrompt })` using API key from `process.env.GEMINI_API_KEY`
  - Call `model.generateContent(parts)` and extract `result.response.text()`
  - Update `RunNodeExecution` in DB: `status: "Completed"`, `output: { response }`, `finishedAt: new Date()`
  - Return `{ response: string }` — do not catch Gemini API errors (let Trigger.dev handle failure)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 2.1 Write unit tests for geminiGenerate task
    - Mock `@google/generative-ai` to return a known response string
    - Test: with `imageBase64` provided, `parts` array contains both text and inlineData elements
    - Test: without `imageBase64`, `parts` array contains only the text element
    - Test: return shape is `{ response: string }`
    - Test: when `generateContent` throws, the error propagates (is not swallowed)
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

- [x] 3. Create History API route
  - Create `src/app/api/workflows/[id]/runs/route.ts` with a `GET` handler
  - Look up workflow by `params.id`; return 404 JSON if not found
  - Query `prisma.workflowRun.findMany` with `where: { workflowId }`, `orderBy: { startedAt: "desc" }`, `take: 50`
  - Include `nodeExecutions` relation ordered by `startedAt: "asc"` (check the exact Prisma relation field name in `schema.prisma`)
  - Return the array as JSON
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 3.1 Write property tests for runs API response invariants
    - Mock Prisma, generate random arrays of runs with varying `startedAt` values
    - **Property 5: Limit invariant** — for any N runs in DB, response contains `min(N, 50)` runs
    - **Property 6: Descending order invariant** — for any non-empty response, each run's `startedAt` ≥ the next run's `startedAt`
    - **Property 7: NodeExecutions ascending order invariant** — for any run, its `nodeExecutions` array has each `startedAt` ≤ the next element's `startedAt`
    - _Requirements: 2.2, 2.4, 2.5_

- [x] 4. Modify createWorkflow to seed sample workflow
  - In `src/actions/workflow.ts`, replace the existing two-node seed inside `createWorkflow` with a `prisma.$transaction` that creates 7 `WorkflowNode` records and 8 `WorkflowEdge` records
  - Generate node IDs upfront with `crypto.randomUUID()` so edges can reference them
  - Node definitions (type / positionX / positionY / config):
    - `RequestInput` at (100, 200), config `{}`
    - `CropImage` at (400, 100), config `{ x:0, y:0, width:200, height:200 }`
    - `CropImage` at (400, 300), config `{ x:50, y:50, width:150, height:150 }`
    - `GeminiModel` at (400, 500), config `{ prompt: "Describe this image" }`
    - `GeminiModel` at (700, 500), config `{ prompt: "Summarize: {{response}}" }`
    - `GeminiModel` at (700, 200), config `{ prompt: "Write a product description based on these cropped images" }`
    - `Response` at (1000, 300), config `{}`
  - Edge connectivity: RequestInput→CropImage1, RequestInput→CropImage2, RequestInput→GeminiModel1, GeminiModel1→GeminiModel2, CropImage1→GeminiModel3, CropImage2→GeminiModel3, GeminiModel2→GeminiModel3, GeminiModel3→Response
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 4.1 Write integration test for sample workflow seeding
    - Mock Prisma `$transaction`, call `createWorkflow("Test")`
    - Assert exactly 7 `WorkflowNode` creates and 8 `WorkflowEdge` creates were issued
    - Assert node types and positions match the spec
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Build RunCard component
  - Create `src/components/workflow/RunCard.tsx` as a client component
  - Props: `run: { id, status, startedAt, finishedAt, nodeExecutions: RunNodeExecution[] }`
  - Collapsed header: show `format(new Date(run.startedAt), "MMM d HH:mm:ss")` (use `date-fns`), status badge (spinner/checkmark/X), and duration when `finishedAt` is present (`Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)` + `"s"`)
  - Click header toggles `isExpanded` local state
  - Expanded: render each `RunNodeExecution` in a row — node id, status indicator, duration, and `<pre>` blocks for `input` and `output` JSON (use `JSON.stringify(value, null, 2)`)
  - Status badge colours: Running = blue spinner (Loader2 animate-spin), Completed = green ✓, Failed = red ✗; failed rows get `bg-red-50` background
  - **Property 4**: duration computation — always non-negative when `finishedAt >= startedAt`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 6.1 Write unit tests for RunCard
    - Test: collapsed header contains formatted timestamp and status badge
    - Test: duration shown when both timestamps provided; not shown when `finishedAt` is null
    - **Property 4: RunCard duration is non-negative** — for any `startedAt`/`finishedAt` pair where finishedAt ≥ startedAt, computed duration ≥ 0
    - Test: clicking header toggles expanded/collapsed; two clicks returns to original state (idempotence)
    - Test: expanded section shows one row per nodeExecution
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 7. Build HistorySidebar component
  - Create `src/components/workflow/HistorySidebar.tsx` as a client component
  - Props: `workflowId: string; refreshToken: number`
  - `useEffect` on `[workflowId, refreshToken]` — fetch `/api/workflows/${workflowId}/runs`, store in `useState`
  - Render a scrollable list of `<RunCard>` components, one per run
  - Show `"No runs yet"` empty state when the array is empty
  - Show a loading spinner while the initial fetch is in progress
  - Handle fetch errors gracefully (display error message, no crash)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.8_

  - [ ]* 7.1 Write unit tests for HistorySidebar
    - Mock `fetch` to return an array of 3 run objects; assert 3 RunCards rendered
    - Mock `fetch` to return empty array; assert empty state message shown
    - Test: when `refreshToken` changes, the component re-fetches
    - _Requirements: 3.2, 3.3, 3.4, 3.8_

- [x] 8. Integrate HistorySidebar into the workflow page layout
  - Create `src/app/workflow/[workflowId]/WorkflowPageClient.tsx` as a thin client wrapper component
    - Manages `refreshToken` state (`useState<number>(0)`)
    - Renders `<WorkflowCanvas>` + `<HistorySidebar>` side by side in a flex row
    - Exposes `onRunStart` callback to `CanvasToolbar` (passed via `WorkflowCanvas` props) which calls `setRefreshToken(t => t + 1)`
  - Update `src/app/workflow/[workflowId]/page.tsx` to render `<WorkflowPageClient>` instead of rendering `<WorkflowCanvas>` directly
  - Layout: `<main className="flex flex-1 overflow-hidden">` wrapping canvas (flex-1) and sidebar (w-72 border-l shrink-0 overflow-y-auto)
  - Add skeleton loading placeholder: create a `WorkflowSkeleton` component used as the `loading.tsx` or `Suspense` fallback in the workflow page
  - _Requirements: 3.1, 3.2, 8.3_

- [x] 9. Add toast notifications and loading spinner to CanvasToolbar
  - Install `sonner` npm package: `npm install sonner`
  - Add `<Toaster position="bottom-right" />` to `src/app/layout.tsx` inside `<body>`
  - In `src/components/workflow/CanvasToolbar.tsx`:
    - Import `toast` from `"sonner"` and `Loader2` from `"lucide-react"`
    - Accept optional `onRunStart?: () => void` prop
    - In `handleRun`: on successful response, call `toast.success("Workflow execution started")` then `onRunStart?.()`
    - In `handleRun` catch block: call `toast.error("Execution failed: " + errorMessage)`
    - Replace the Run button label: when `isRunning`, show `<Loader2 size={14} className="animate-spin" />` + `"Running"` text; otherwise show `<Play size={14} fill="currentColor" />` + `"Run"` text
  - Pass `onRunStart` from `WorkflowPageClient` through `WorkflowCanvas` to `CanvasToolbar`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2_

- [x] 10. Enable TypeScript strict mode and fix compiler errors
  - Add `"strict": true` to the `compilerOptions` block in `tsconfig.json`
  - Run `npx tsc --noEmit` to surface all new errors introduced by strict mode
  - Fix all errors — common patterns to handle:
    - Add explicit type annotations where inference previously allowed `any`
    - Handle `undefined` returns from array lookups (`.find()` returns `T | undefined`)
    - Add null checks where Prisma nullable fields are used
    - Ensure all component props have explicit types (no implicit `any`)
  - Verify `npx tsc --noEmit` exits with code 0 before marking this task done
  - _Requirements: 9.1, 9.2_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Run `npx tsc --noEmit` and confirm zero errors
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `fast-check` property tests run 100+ iterations automatically
- The `sonner` `Toaster` must be a Client Component — it is already inside `<body>` which is fine for Next.js App Router as long as `layout.tsx` keeps `"use server"` semantics (the Toaster renders client-side only)
- For the Prisma `include` in the runs route, verify the relation field name on `WorkflowRun` in `schema.prisma` (currently `nodeExecutions`)
- Sample seeding replaces the old two-node default — any existing "new workflow" tests should be updated accordingly

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3", "4"] },
    { "wave": 2, "tasks": ["5"] },
    { "wave": 3, "tasks": ["6", "7"] },
    { "wave": 4, "tasks": ["8"] },
    { "wave": 5, "tasks": ["9", "10"] },
    { "wave": 6, "tasks": ["11"] }
  ]
}
```
