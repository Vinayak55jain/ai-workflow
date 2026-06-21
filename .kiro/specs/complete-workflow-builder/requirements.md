# Requirements Document

## Introduction

This feature completes the AI Workflow Builder application by implementing phases 7–10:
the Gemini Trigger.dev task, execution history sidebar, sample workflow seeding, Zod
validation schemas, toast notifications, loading states, and TypeScript strict mode.
The app is a Next.js 16 canvas-based tool that lets authenticated users build and run
AI workflows composed of RequestInput, CropImage, GeminiModel, and Response nodes.
All existing DAG execution infrastructure, node UI components, Clerk auth, and the
Prisma schema are already in place.

## Glossary

- **Workflow**: A directed acyclic graph of nodes saved as a Prisma `Workflow` record.
- **WorkflowRun**: A single execution run of a Workflow, persisted as a Prisma `WorkflowRun` record with `status`, `startedAt`, and `finishedAt` fields.
- **RunNodeExecution**: Per-node execution record within a WorkflowRun, containing `input`, `output`, `status`, `startedAt`, and `finishedAt` fields.
- **GeminiTask**: The Trigger.dev background task (`gemini-generate`) that calls the Google Gemini API and returns a text response.
- **HistorySidebar**: A right-panel UI component listing WorkflowRun records for the current workflow.
- **RunCard**: A collapsible UI component inside HistorySidebar showing per-node execution details for a single WorkflowRun.
- **CanvasToolbar**: The top-center floating toolbar on the workflow canvas containing run, undo/redo, export, and import controls.
- **SampleWorkflow**: Seven pre-seeded nodes and eight pre-seeded edges created automatically when a new Workflow is created.
- **Schemas**: Zod validation schemas in `src/lib/schemas.ts` used by server actions and API routes.
- **Toaster**: The `sonner` toast notification component mounted at the app root.

---

## Requirements

### Requirement 1: Gemini Trigger.dev Task

**User Story:** As a workflow executor, I want the GeminiModel node to call the Google
Gemini API via a Trigger.dev background task, so that AI text generation runs reliably
outside the HTTP request lifecycle.

#### Acceptance Criteria

1. THE GeminiTask SHALL be defined in `src/trigger/geminiGenerate.ts` with Trigger.dev task id `"gemini-generate"`.
2. WHEN the GeminiTask runs, THE GeminiTask SHALL accept a payload containing `prompt` (string), `systemPrompt` (optional string), `imageBase64` (optional string), and `nodeExecutionId` (string).
3. WHEN `imageBase64` is provided, THE GeminiTask SHALL include the image as an inline base64 part in the Gemini API request.
4. WHEN `imageBase64` is not provided, THE GeminiTask SHALL send a text-only request to the Gemini API.
5. WHEN the Gemini API returns a successful response, THE GeminiTask SHALL return `{ response: string }`.
6. WHEN the Gemini API throws an error, THE GeminiTask SHALL propagate the error so Trigger.dev marks the run as failed.
7. THE GeminiTask SHALL use the `@google/generative-ai` package and read the API key from the `GEMINI_API_KEY` environment variable.

---

### Requirement 2: History API Route

**User Story:** As a user, I want to retrieve execution history for a workflow, so that
the HistorySidebar can display past runs and their per-node details.

#### Acceptance Criteria

1. THE System SHALL expose a `GET /api/workflows/[id]/runs` route that returns an array of WorkflowRun records for the given workflow id.
2. WHEN a valid workflow id is provided, THE System SHALL include each run's `id`, `status`, `startedAt`, `finishedAt`, and its associated `RunNodeExecution` array sorted by `startedAt` ascending.
3. WHEN the workflow does not exist or the id is invalid, THE System SHALL return HTTP 404.
4. THE System SHALL return runs ordered by `startedAt` descending (most recent first).
5. WHEN fewer than 50 runs exist, THE System SHALL return all of them; WHEN 50 or more exist, THE System SHALL return the 50 most recent.

---

### Requirement 3: History Sidebar Component

**User Story:** As a user, I want to see execution history in a right sidebar on the
workflow canvas, so that I can inspect past runs without leaving the canvas.

#### Acceptance Criteria

1. THE HistorySidebar SHALL be rendered as a fixed-width right panel inside the workflow page layout alongside the canvas.
2. WHEN the workflow page loads, THE HistorySidebar SHALL fetch runs from `GET /api/workflows/[id]/runs` and display them.
3. WHEN no runs exist, THE HistorySidebar SHALL display an empty state message.
4. WHEN runs exist, THE HistorySidebar SHALL render one RunCard per WorkflowRun, ordered most recent first.
5. WHEN a run has `status = "Running"`, THE HistorySidebar SHALL display a spinner badge on its RunCard.
6. WHEN a run has `status = "Completed"`, THE HistorySidebar SHALL display a green checkmark badge on its RunCard.
7. WHEN a run has `status = "Failed"`, THE HistorySidebar SHALL display a red X badge on its RunCard.
8. WHEN execution starts, THE HistorySidebar SHALL re-fetch runs so the new WorkflowRun appears at the top.

---

### Requirement 4: RunCard Component

**User Story:** As a user, I want to expand a run card to see per-node execution details,
so that I can debug individual node failures.

#### Acceptance Criteria

1. THE RunCard SHALL display the run's `startedAt` timestamp and overall `status` badge in its collapsed header.
2. WHEN the run has both `startedAt` and `finishedAt`, THE RunCard SHALL display the elapsed duration in seconds.
3. WHEN a user clicks the RunCard header, THE RunCard SHALL toggle between collapsed and expanded state.
4. WHEN expanded, THE RunCard SHALL list each RunNodeExecution with its node id, `status`, `startedAt`, and `finishedAt`.
5. WHEN expanded, THE RunCard SHALL render the `input` and `output` JSON for each RunNodeExecution as formatted, readable text.
6. WHEN a RunNodeExecution has `status = "Running"`, THE RunCard SHALL show a spinner for that node.
7. WHEN a RunNodeExecution has `status = "Failed"`, THE RunCard SHALL highlight that row in red.

---

### Requirement 5: Sample Workflow Seeding

**User Story:** As a new user, I want a pre-built sample workflow to be created
automatically, so that I can immediately explore the canvas without building from scratch.

#### Acceptance Criteria

1. WHEN `createWorkflow` is called, THE System SHALL seed exactly 7 WorkflowNode records and 8 WorkflowEdge records matching the sample DAG defined in phase 9.
2. THE SampleWorkflow nodes SHALL be: one `RequestInput` at (100, 200), one `CropImage` at (400, 100) with config `{x:0, y:0, width:200, height:200}`, one `CropImage` at (400, 300) with config `{x:50, y:50, width:150, height:150}`, one `GeminiModel` at (400, 500) with prompt `"Describe this image"`, one `GeminiModel` at (700, 500) with prompt `"Summarize: {{response}}"`, one `GeminiModel` at (700, 200) with prompt `"Write a product description based on these cropped images"`, and one `Response` at (1000, 300).
3. THE SampleWorkflow edges SHALL connect: RequestInput→CropImage1, RequestInput→CropImage2, RequestInput→GeminiModel1, GeminiModel1→GeminiModel2, CropImage1→GeminiModel3, CropImage2→GeminiModel3, GeminiModel2→GeminiModel3, GeminiModel3→Response.
4. THE System SHALL create the workflow record and all 7 nodes and 8 edges within a single Prisma transaction.

---

### Requirement 6: Zod Validation Schemas

**User Story:** As a developer, I want centralised Zod schemas for workflow data
structures, so that all server actions and API routes validate inputs consistently.

#### Acceptance Criteria

1. THE System SHALL provide `WorkflowSchema`, `CropConfigSchema`, `GeminiConfigSchema`, and `ExecuteWorkflowSchema` exported from `src/lib/schemas.ts`.
2. THE `WorkflowSchema` SHALL validate that `name` is a non-empty string.
3. THE `CropConfigSchema` SHALL validate that `x` and `y` are numbers and that `width` and `height` are positive numbers.
4. THE `GeminiConfigSchema` SHALL validate that `prompt` is a non-empty string and that `systemPrompt` is an optional string.
5. THE `ExecuteWorkflowSchema` SHALL validate that `workflowId` is a non-empty string and that `mode` is one of `"full"`, `"single"`, or `"multi"`.
6. WHEN a server action or API route receives invalid input that fails schema validation, THE System SHALL return a typed error response rather than throwing an unhandled exception.

---

### Requirement 7: Toast Notifications

**User Story:** As a user, I want toast notifications when I start or fail an execution,
so that I get immediate feedback without having to watch the console.

#### Acceptance Criteria

1. THE System SHALL install the `sonner` npm package and mount a `<Toaster />` component in the root layout (`src/app/layout.tsx`).
2. WHEN the user clicks Run and execution starts successfully, THE CanvasToolbar SHALL display a success toast with a message indicating the workflow is running.
3. WHEN execution fails to start (network error or server error), THE CanvasToolbar SHALL display an error toast with a descriptive message.
4. THE Toaster SHALL be positioned at the bottom-right of the viewport.

---

### Requirement 8: Loading States

**User Story:** As a user, I want visual loading indicators during execution and while
the workflow page loads, so that I know the app is working and not frozen.

#### Acceptance Criteria

1. WHEN `isRunning` is `true`, THE CanvasToolbar Run button SHALL display an animated spinner icon alongside the label.
2. WHEN `isRunning` is `true`, THE CanvasToolbar Run button SHALL be disabled and visually indicate the disabled state.
3. WHEN the workflow page is loading its data, THE WorkflowCanvas area SHALL display a skeleton placeholder UI.

---

### Requirement 9: TypeScript Strict Mode

**User Story:** As a developer, I want TypeScript strict mode enabled, so that the
codebase catches type errors and null-safety issues at compile time.

#### Acceptance Criteria

1. THE System SHALL set `"strict": true` in `tsconfig.json` under `compilerOptions`.
2. WHEN strict mode is enabled, THE System SHALL resolve all resulting TypeScript compiler errors in existing source files so that `tsc --noEmit` completes without errors.
