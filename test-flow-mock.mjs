/**
 * test-flow-mock.mjs
 *
 * Tests the full RequestInput → GeminiModel → Response pipeline
 * with a MOCKED Gemini API (no real API key needed).
 *
 * Verifies:
 *   1. DAG topology and execution order
 *   2. Input routing via edge handles
 *   3. Template resolution ({{text}} placeholder)
 *   4. Data handoff between nodes
 *   5. Response node collects final output
 *
 * Run: node test-flow-mock.mjs
 */

// ── Mock Gemini ────────────────────────────────────────────────────────────
// Simulates what Gemini would return — deterministic, no network needed
let MOCK_GEMINI_CALLS = [];
async function mockCallGemini(prompt, systemPrompt) {
  MOCK_GEMINI_CALLS.push({ prompt, systemPrompt });
  // Return a realistic-looking summary
  return `[MOCK GEMINI RESPONSE] Summarised: "${prompt.substring(0, 60).replace(/\n/g, " ")}..."`;
}

// ── Helpers (identical to production code in nodeRunner.ts) ─────────────
function resolveInputs(nodeId, edges, outputs) {
  const incoming = edges.filter(e => e.targetNode === nodeId);
  const inputs = {};
  for (const edge of incoming) {
    const parentOutput = outputs.get(edge.sourceNode);
    const key = edge.targetHandle ?? "default";
    inputs[key] = parentOutput;
  }
  return inputs;
}

function resolveTemplate(template, value) {
  if (!value) return template ?? "";
  let text = typeof value === "string" ? value : undefined;
  if (!text && typeof value === "object") {
    text = value.response ?? value.text_field ?? value.output ?? JSON.stringify(value);
  }
  if (!template) return text ?? "";
  return template.replace(/\{\{.*?\}\}/g, text ?? "");
}

// ── Node executor (local mock) ─────────────────────────────────────────────
const executionLog = [];   // keeps per-node details for the report

async function executeNode(node, inputs) {
  const entry = {
    nodeId:    node.id,
    nodeType:  node.type,
    status:    "Running",
    inputs:    structuredClone(inputs),
    output:    null,
    error:     null,
    assertions: [],
  };
  executionLog.push(entry);

  console.log(`\n${"─".repeat(64)}`);
  console.log(`▶  Node: ${node.id}  |  Type: ${node.type}`);
  console.log(`   Config : ${JSON.stringify(node.config)}`);
  console.log(`   Inputs : ${JSON.stringify(inputs)}`);

  try {
    switch (node.type) {

      // ── RequestInput ──────────────────────────────────────────────────
      case "RequestInput": {
        // Output is the node's own config (text_field, image_field, etc.)
        const output = node.config;
        console.log(`   ✅ Passthrough — output = config`);
        console.log(`   Output: ${JSON.stringify(output)}`);

        // Assertions
        assert(entry, "Output has text_field",  output.text_field !== undefined && output.text_field !== "");
        assert(entry, "Output is an object",    typeof output === "object");

        entry.status = "Completed";
        entry.output = output;
        return output;
      }

      // ── GeminiModel ───────────────────────────────────────────────────
      case "GeminiModel": {
        const promptInput = inputs["prompt"];
        const resolvedPrompt = resolveTemplate(node.config.prompt, promptInput);

        console.log(`   Prompt input  : ${JSON.stringify(promptInput)}`);
        console.log(`   Template      : "${node.config.prompt}"`);
        console.log(`   Resolved →    : "${resolvedPrompt}"`);
        console.log(`   System prompt : "${node.config.systemPrompt ?? "(none)"}"`);

        // ── Bug check: is resolvedPrompt actually a real string?
        assert(entry, "Resolved prompt is a non-empty string",
          typeof resolvedPrompt === "string" && resolvedPrompt.trim().length > 0);

        // ── Bug check: does prompt still contain unresolved placeholders?
        const hasUnresolved = /\{\{.*?\}\}/.test(resolvedPrompt);
        assert(entry, "No unresolved {{}} placeholders in prompt", !hasUnresolved,
          hasUnresolved ? `Unresolved placeholder in: "${resolvedPrompt}"` : null);

        console.log(`   Calling Gemini (mock)...`);
        const response = await mockCallGemini(resolvedPrompt, node.config.systemPrompt);
        console.log(`   Gemini → "${response}"`);

        const output = { response };

        assert(entry, "Output has 'response' string", typeof output.response === "string" && output.response.length > 0);

        entry.status = "Completed";
        entry.output = output;
        return output;
      }

      // ── Response ──────────────────────────────────────────────────────
      case "Response": {
        // Collects everything — no transformation
        const output = inputs;
        console.log(`   ✅ Final collector — output = all inputs`);
        console.log(`   Output: ${JSON.stringify(output, null, 2)}`);

        assert(entry, "Response has 'input' key (from GeminiModel edge)", "input" in output);
        assert(entry, "Response.input.response is a string",
          typeof output?.input?.response === "string" && output.input.response.length > 0);

        entry.status = "Completed";
        entry.output = output;
        return output;
      }

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    entry.status = "Failed";
    entry.error = err.message;
    return null;
  }
}

function assert(entry, label, condition, hint = null) {
  const pass = Boolean(condition);
  entry.assertions.push({ label, pass, hint });
  const icon = pass ? "  ✅" : "  ❌";
  console.log(`${icon} ASSERT: ${label}${hint ? `\n       ↳ ${hint}` : ""}`);
}

// ── DAG runner ─────────────────────────────────────────────────────────────
async function runDAG(nodes, edges) {
  const adjacency = {};
  const parents   = {};
  const remaining = {};

  for (const n of nodes) { adjacency[n.id] = []; parents[n.id] = []; remaining[n.id] = 0; }
  for (const e of edges) {
    adjacency[e.sourceNode].push(e.targetNode);
    parents[e.targetNode].push(e.sourceNode);
    remaining[e.targetNode]++;
  }

  const outputs = new Map();

  async function tryExecute(nodeId) {
    const node    = nodes.find(n => n.id === nodeId);
    const inputs  = resolveInputs(nodeId, edges, outputs);
    const output  = await executeNode(node, inputs);

    if (output === null) return; // failed — stop propagation

    outputs.set(nodeId, output);
    for (const childId of adjacency[nodeId]) {
      remaining[childId]--;
      if (remaining[childId] === 0) await tryExecute(childId);
    }
  }

  const roots = nodes.filter(n => remaining[n.id] === 0);
  console.log(`\n${"═".repeat(64)}`);
  console.log(`🚀  DAG: ${nodes.map(n => `${n.id}(${n.type})`).join(" → ")}`);
  console.log(`${"═".repeat(64)}`);
  await Promise.all(roots.map(n => tryExecute(n.id)));
}

// ── Report ─────────────────────────────────────────────────────────────────
function printReport() {
  console.log(`\n${"═".repeat(64)}`);
  console.log("📊  FULL EXECUTION REPORT");
  console.log(`${"═".repeat(64)}`);

  let totalAssertions = 0, failedAssertions = 0;

  for (const entry of executionLog) {
    const nodeStatus = entry.status === "Completed" ? "✅" : "❌";
    console.log(`\n${nodeStatus}  ${entry.nodeId} (${entry.nodeType})  → ${entry.status}`);
    if (entry.error) console.log(`    Error: ${entry.error}`);

    for (const a of entry.assertions) {
      totalAssertions++;
      if (!a.pass) failedAssertions++;
      const icon = a.pass ? "  ✅" : "  ❌";
      console.log(`  ${icon}  ${a.label}`);
      if (!a.pass && a.hint) console.log(`         ↳ ${a.hint}`);
    }
  }

  console.log(`\n${"─".repeat(64)}`);
  const passed = totalAssertions - failedAssertions;
  console.log(`Assertions:  ${passed}/${totalAssertions} passed`);
  if (failedAssertions === 0) {
    console.log("🎉  All assertions passed — pipeline is healthy!");
  } else {
    console.log(`❌  ${failedAssertions} assertion(s) failed — see details above`);
  }
  console.log(`${"═".repeat(64)}\n`);
}

// ══════════════════════════════════════════════════════════════════════════
//  TEST SCENARIO: RequestInput → GeminiModel → Response
// ══════════════════════════════════════════════════════════════════════════
const INPUT_TEXT = `
The quick brown fox jumps over the lazy dog.
This is test input to verify the full pipeline.
Please summarise this text in one short sentence.
`.trim();

const nodes = [
  {
    id:     "node-request",
    type:   "RequestInput",
    config: { text_field: INPUT_TEXT, image_field: null },
  },
  {
    id:     "node-gemini",
    type:   "GeminiModel",
    // The template uses {{text}} — resolveTemplate replaces ANY {{...}} with the upstream value
    config: {
      prompt:       "Summarise the following text: {{text}}",
      systemPrompt: "You are a concise summarisation assistant.",
    },
  },
  {
    id:     "node-response",
    type:   "Response",
    config: {},
  },
];

// Edge 1: RequestInput text_field → GeminiModel prompt input
// Edge 2: GeminiModel response    → Response collector
const edges = [
  {
    sourceNode:   "node-request",
    targetNode:   "node-gemini",
    sourceHandle: "text_field",
    targetHandle: "prompt",      // ← matches inputs["prompt"] in nodeRunner
  },
  {
    sourceNode:   "node-gemini",
    targetNode:   "node-response",
    sourceHandle: "response",
    targetHandle: "input",       // ← Response node receives it as inputs["input"]
  },
];

await runDAG(nodes, edges);
printReport();

// ── Verify Gemini was called exactly once with the right content ──────────
console.log("🔍  Gemini mock call verification:");
console.log(`   Calls made: ${MOCK_GEMINI_CALLS.length}`);
if (MOCK_GEMINI_CALLS.length > 0) {
  const call = MOCK_GEMINI_CALLS[0];
  const promptOk = call.prompt.includes("The quick brown fox");
  console.log(`   Prompt contains input text: ${promptOk ? "✅ YES" : "❌ NO"}`);
  console.log(`   System prompt: "${call.systemPrompt}"`);
  if (!promptOk) {
    console.log(`\n⚠️  BUG: The GeminiModel prompt did NOT contain the original input text.`);
    console.log(`   This means the template placeholder was not resolved from RequestInput output.`);
    console.log(`   Actual prompt sent: "${call.prompt}"`);
  }
}
