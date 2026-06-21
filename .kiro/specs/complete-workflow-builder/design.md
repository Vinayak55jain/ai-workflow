# Design Document — Complete Workflow Builder (Phases 7–10)

## Overview

This document describes the design for completing the AI Workflow Builder application.
The existing codebase already contains the DAG execution engine, all four node UI
components, the Clerk auth integration, and the Prisma schema. The remaining work
covers six cohesive areas:

1. **GeminiTask** — Trigger.dev background task for Gemini API calls
2. **Runs API** — `GET /api/workflows/[id]/runs` for history data
3. **History Sidebar** — HistorySidebar + RunCard UI components
4. **Sample Seeding** — auto-populate 7 nodes / 8 edges on workflow creation
5. **Validation & Schemas** — centralised Zod schemas in `src/lib/schemas.ts`
6. **Polish** — `sonner` toasts, loading spinners, TypeScript strict mode

---

## Architecture

The application follows Next.js App Router conventions:

```
src/
├── app/
│   ├── layout.tsx                  ← mount <Toaster /> here
│   ├── api/workflows/[id]/
│   │   ├── execute/route.ts        ← existing
│   │   └── runs/route.ts           ← NEW: history endpoint
│   └── workflow/[workflowId]/
│       ├── page.tsx                ← add HistorySidebar + skeleton
│       └── WorkflowCanvas.tsx      ← existing
├── components/workflow/
│   ├── CanvasToolbar.tsx           ← add toast + spinner
│   ├── HistorySidebar.tsx          ← NEW
│   └── RunCard.tsx                 ← NEW
├── trigger/
│   └── geminiGenerate.ts           ← NEW
├── lib/
│   └── schemas.ts                  ← NEW
└── actions/
    └── workflow.ts                 ← modify createWorkflow for sample seeding
```

---

## Components and Interfaces

### GeminiTask (`src/trigger/geminiGenerate.ts`)

```typescript
import { task } from "@trigger.dev/sdk/v3";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { prisma } from "../lib/prisma";

export const geminiTask = task({
  id: "gemini-generate",
  run: async (payload: {
    prompt: string;
    systemPrompt?: string;
    imageBase64?: string;
    nodeExecutionId: string;
  }) => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: payload.systemPrompt,
    });

    const parts: Part[] = [{ text: payload.prompt }];
    if (payload.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: payload.imageBase64,
        },
      });
    }

    const result = await model.generateContent(parts);
    const response = result.response.text();

    // Update the RunNodeExecution record in DB
    await prisma.runNodeExecution.update({
      where: { id: payload.nodeExecutionId },
      data: {
        status: "Completed",
        output: { response },
        finishedAt: new Date(),
      },
    });

    return { response };
  },
});
```

The task is registered automatically by the Trigger.dev SDK when the file is imported.
The `nodeRunner.ts` already imports `geminiTask` by type and uses
`tasks.triggerAndPoll<typeof geminiTask>("gemini-generate", ...)`.

### History API Route (`src/app/api/workflows/[id]/runs/route.ts`)

```typescript
export async function GET(req, { params }) {
  const workflow = await prisma.workflow.findUnique({ where: { id: params.id } });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const runs = await prisma.workflowRun.findMany({
    where: { workflowId: params.id },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      nodeExecutions: { orderBy: { startedAt: "asc" } },
    },
  });

  return NextResponse.json(runs);
}
```

### HistorySidebar (`src/components/workflow/HistorySidebar.tsx`)

- Client component (`"use client"`)
- Accepts `workflowId: string` and optional `refreshToken: number` (incremented by parent when a new run starts, to trigger re-fetch)
- Uses `useEffect` + `fetch` to load runs from `/api/workflows/[id]/runs`
- Renders a `<RunCard>` for each run
- Shows empty-state message when no runs

```typescript
interface HistorySidebarProps {
  workflowId: string;
  refreshToken: number;   // incremented by parent on new execution
}
```

### RunCard (`src/components/workflow/RunCard.tsx`)

- Client component
- Collapsible via local `useState`
- Formats duration as `${Math.round(durationMs / 1000)}s` when both timestamps present
- Status badge: spinner (Running), green ✓ (Completed), red ✗ (Failed)
- Expanded section: one row per `RunNodeExecution` with node id, status, duration, and pre-formatted JSON for input/output

```typescript
interface RunCardProps {
  run: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    nodeExecutions: RunNodeExecution[];
  };
}
```

### Workflow Page Layout (`src/app/workflow/[workflowId]/page.tsx`)

The page layout changes from a two-pane (header + canvas) to a three-pane layout:

```
+--------------------------------------------------+----------+
| header (h-16)                                              |
+--------------------------------------------------+----------+
| WorkflowCanvas (flex-1)                          | History  |
|                                                  | Sidebar  |
|                                                  | (w-72)   |
+--------------------------------------------------+----------+
```

The page passes a `refreshToken` state variable (managed in a client wrapper) down to
both `CanvasToolbar` (to increment on run start) and `HistorySidebar` (to re-fetch).

Because the workflow page is a Server Component and CanvasToolbar/HistorySidebar are
Client Components, the `refreshToken` state lives in a new thin `WorkflowPageClient`
wrapper component that composes them.

### CanvasToolbar updates (`src/components/workflow/CanvasToolbar.tsx`)

- Import `toast` from `"sonner"`
- On successful `fetch` → call `toast.success("Workflow execution started")`; call `onRunStart?.()` prop callback to increment parent's `refreshToken`
- On error → call `toast.error("Execution failed: " + message)`
- Replace the `"Running..."` text label with a `<Loader2 className="animate-spin" size={14} />` + `"Running"` when `isRunning`
- Accept optional `onRunStart?: () => void` prop

### Sample Workflow Seeding (`src/actions/workflow.ts`)

Replace the current two-node seed in `createWorkflow` with a seven-node / eight-edge
transactional seed using `prisma.$transaction`. Node and edge IDs are generated with
`crypto.randomUUID()`.

```typescript
const SAMPLE_NODES = [
  { type: "RequestInput",  posX: 100,  posY: 200, config: {} },
  { type: "CropImage",     posX: 400,  posY: 100, config: { x:0,  y:0,  width:200, height:200 } },
  { type: "CropImage",     posX: 400,  posY: 300, config: { x:50, y:50, width:150, height:150 } },
  { type: "GeminiModel",   posX: 400,  posY: 500, config: { prompt: "Describe this image" } },
  { type: "GeminiModel",   posX: 700,  posY: 500, config: { prompt: "Summarize: {{response}}" } },
  { type: "GeminiModel",   posX: 700,  posY: 200, config: { prompt: "Write a product description based on these cropped images" } },
  { type: "Response",      posX: 1000, posY: 300, config: {} },
] as const;

// Edges (indices into SAMPLE_NODES array):
// 0→1, 0→2, 0→3, 3→4, 1→5, 2→5, 4→5, 5→6
```

### Zod Schemas (`src/lib/schemas.ts`)

```typescript
import { z } from "zod";

export const WorkflowSchema = z.object({
  name: z.string().min(1),
});

export const CropConfigSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const GeminiConfigSchema = z.object({
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
});

export const ExecuteWorkflowSchema = z.object({
  workflowId: z.string().min(1),
  mode: z.enum(["full", "single", "multi"]),
});
```

---

## Data Models

No schema changes needed — the existing `WorkflowRun` and `RunNodeExecution` models
already carry all fields required by HistorySidebar and RunCard:

| Model | Key fields used |
|---|---|
| `WorkflowRun` | `id`, `workflowId`, `status`, `startedAt`, `finishedAt` |
| `RunNodeExecution` | `id`, `runId`, `nodeId`, `status`, `input`, `output`, `startedAt`, `finishedAt` |

The `runs/route.ts` uses Prisma's `include: { nodeExecutions: ... }` (relation name is
`nodeExecutions` as defined in `schema.prisma` — the field is named `nodeExecutions`
on `WorkflowRun`).

> **Note**: `schema.prisma` uses `nodeExecutions` as the relation name on `WorkflowRun`.
> Confirm the exact Prisma relation field name before implementing the API route.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid
executions of a system — essentially, a formal statement about what the system should
do. Properties serve as the bridge between human-readable specifications and
machine-verifiable correctness guarantees.*

The features in this spec are a mix of API data-shaping, UI rendering, configuration,
and background-task logic. The pure functions most amenable to property-based testing
are:

1. The Zod schemas (validation logic over arbitrary inputs)
2. The `runs` API sorting and limit logic
3. The RunCard duration calculation

Other requirements (UI components, Trigger.dev task wiring, seeding) are better
verified with example-based or integration tests.

### Property 1: CropConfigSchema rejects non-positive dimensions

*For any* pair of numbers where at least one of `width` or `height` is ≤ 0,
`CropConfigSchema.safeParse(...)` SHALL return `{ success: false }`.

**Validates: Requirements 6.3**

### Property 2: GeminiConfigSchema rejects empty prompt

*For any* string composed entirely of whitespace characters (or the empty string),
`GeminiConfigSchema.safeParse({ prompt })` SHALL return `{ success: false }`.

**Validates: Requirements 6.4**

### Property 3: ExecuteWorkflowSchema rejects invalid mode values

*For any* string that is not `"full"`, `"single"`, or `"multi"`,
`ExecuteWorkflowSchema.safeParse({ workflowId: "abc", mode })` SHALL return
`{ success: false }`.

**Validates: Requirements 6.5**

### Property 4: RunCard duration is non-negative

*For any* `startedAt` and `finishedAt` timestamps where `finishedAt >= startedAt`,
the computed duration displayed by RunCard SHALL be a non-negative number of seconds.

**Validates: Requirements 4.2**

### Property 5: Runs API limit invariant

*For any* workflow with N runs (N ≥ 0), the `GET /api/workflows/[id]/runs` endpoint
SHALL return exactly `min(N, 50)` runs.

**Validates: Requirements 2.5**

### Property 6: Runs API descending order invariant

*For any* non-empty response from `GET /api/workflows/[id]/runs`, each run's
`startedAt` SHALL be ≥ the `startedAt` of the run immediately following it in the
array (i.e., the array is sorted descending).

**Validates: Requirements 2.4**

### Property 7: NodeExecutions ascending order invariant

*For any* run returned by the API, each `RunNodeExecution` in its `nodeExecutions`
array SHALL have a `startedAt` ≤ the `startedAt` of the execution immediately
following it (i.e., sorted ascending).

**Validates: Requirements 2.2**

---

## Error Handling

- **GeminiTask**: errors from the Gemini API surface naturally as thrown exceptions,
  which Trigger.dev catches and marks the run as failed. The `nodeRunner.ts` already
  handles `result.status !== "COMPLETED"` and marks the `RunNodeExecution` as Failed.
- **History API**: returns `{ error: "Not found" }` with HTTP 404 when workflow id is
  unknown. The HistorySidebar should catch fetch errors and show an error state.
- **Schema validation**: all server actions parse inputs through Zod `safeParse` and
  return `{ success: false, error: ... }` instead of throwing on validation failures.
- **Toast errors**: `CanvasToolbar` catches non-OK HTTP responses from `/execute` and
  calls `toast.error(...)` with the response error message.

---

## Testing Strategy

This feature combines background tasks, API routes, React components, and configuration.
Property-based tests are appropriate for the pure validation logic (Zod schemas, sorting,
duration computation). Everything else uses example-based unit or integration tests.

### Property-Based Tests (using [fast-check](https://fast-check.io/))

- **Properties 1–3**: test Zod schema rejection/acceptance over randomly generated inputs
- **Properties 4–7**: test API response shape invariants over mock data sets

Each property test runs a minimum of 100 iterations. Install `fast-check` as a dev
dependency alongside `vitest`.

Tag format for each test:
```
// Feature: complete-workflow-builder, Property N: <property_text>
```

### Example-Based Unit Tests (vitest)

- `geminiGenerate.ts`: mock `@google/generative-ai`, verify correct `Part[]` assembly for
  text-only and image payloads; verify `{ response: string }` return shape; verify error
  propagation.
- `schemas.ts`: spot-check valid inputs parse successfully.
- `RunCard`: render with mock run data; check header shows timestamp and status; check
  duration calculation; check toggle behavior.
- `HistorySidebar`: render with mock fetch; check RunCard count matches run count; check
  empty state.

### Integration Tests

- `GET /api/workflows/[id]/runs`: hit the real route handler with a seeded DB (or mock
  Prisma) and verify response shape, ordering, and 404 behavior.
- `createWorkflow`: call the server action and assert exactly 7 nodes and 8 edges were
  created with correct types and positions.
