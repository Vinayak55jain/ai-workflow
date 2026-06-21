/**
 * test-flow.mjs
 *
 * Standalone end-to-end test for a simple workflow:
 *   RequestInput → GeminiModel → Response
 *
 * Bypasses Trigger.dev entirely — calls Gemini API directly.
 * Requires: GEMINI_API_KEY in .env
 *
 * Run: node test-flow.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load .env manually ─────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

// ── Check required env ─────────────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error("❌  GEMINI_API_KEY is not set in .env — cannot run this test.");
  console.error("    Add:  GEMINI_API_KEY=your_key_here  to your .env file.");
  process.exit(1);
}

// ── Test setup ─────────────────────────────────────────────────────────────
// Simulate a workflow with 3 nodes and 2 edges:
//
//   RequestInput (nodeA)  ──[targetHandle="prompt"]──▶  GeminiModel (nodeB)  ──[targetHandle="input"]──▶  Response (nodeC)
//
// The input text (simulating what a user would type into the RequestInput node):
const INPUT_TEXT = `
The quick brown fox jumps over the lazy dog.
This is a test sentence to verify the pipeline works end-to-end.
Please summarise this text in one short sentence.
`.trim();

const nodeA = { id: "node-a", type: "RequestInput",  config: { text_field: INPUT_TEXT, image_field: null } };
const nodeB = { id: "node-b", type: "GeminiModel",   config: { prompt: "Summarise the following text: {{text}}", systemPrompt: "You are a concise summarisation assistant." } };
const nodeC = { id: "node-c", type: "Response",       config: {} };

const edges = [
  { sourceNode: "node-a", targetNode: "node-b", sourceHandle: "text_field", targetHandle: "prompt" },
  { sourceNode: "node-b", targetNode: "node-c", sourceHandle: "response",   targetHandle: "input"  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
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

function statusBadge(status) {
  if (status === "ok")      return "✅";
  if (status === "running") return "🔄";
  if (status === "failed")  return "❌";
  return "⚪";
}

// ── Gemini caller (direct HTTP — no Trigger.dev) ───────────────────────────
async function callGemini(prompt, systemPrompt) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent([{ text: prompt }]);
  return result.response.text();
}

// ── Node executor (local, no DB, no Trigger.dev) ───────────────────────────
async function executeNode(node, inputs) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶  Node: ${node.id}  |  Type: ${node.type}`);
  console.log(`   Config:  ${JSON.stringify(node.config)}`);
  console.log(`   Inputs:  ${JSON.stringify(inputs, null, 2).replace(/\n/g, "\n           ")}`);

  switch (node.type) {
    case "RequestInput": {
      // Pure passthrough — output IS the config (text_field, image_field, etc.)
      const output = node.config;
      console.log(`   ${statusBadge("ok")} RequestInput: passing through config as output`);
      console.log(`   Output: ${JSON.stringify(output)}`);
      return { status: "Completed", output };
    }

    case "GeminiModel": {
      const promptInput = inputs["prompt"];
      const resolvedPrompt = resolveTemplate(node.config.prompt, promptInput);

      console.log(`   Resolved prompt: "${resolvedPrompt}"`);
      console.log(`   System prompt:   "${node.config.systemPrompt ?? "(none)"}"`);
      console.log(`   Calling Gemini API...`);

      let response;
      try {
        response = await callGemini(resolvedPrompt, node.config.systemPrompt);
      } catch (err) {
        console.error(`   ${statusBadge("failed")} Gemini API error:`, err.message);
        return { status: "Failed", output: null, error: err.message };
      }

      console.log(`   ${statusBadge("ok")} Gemini responded:`);
      console.log(`   "${response}"`);
      return { status: "Completed", output: { response } };
    }

    case "Response": {
      // Collects inputs as final output
      console.log(`   ${statusBadge("ok")} Response node received final output`);
      console.log(`   Final output: ${JSON.stringify(inputs, null, 2).replace(/\n/g, "\n   ")}`);
      return { status: "Completed", output: inputs };
    }

    default:
      console.error(`   ${statusBadge("failed")} Unknown node type: ${node.type}`);
      return { status: "Failed", output: null, error: `Unknown node type: ${node.type}` };
  }
}

// ── DAG runner ─────────────────────────────────────────────────────────────
async function runDAG(nodes, edges) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🚀 Starting DAG execution`);
  console.log(`   Nodes: ${nodes.map(n => `${n.id}(${n.type})`).join(" → ")}`);
  console.log(`   Edges: ${edges.map(e => `${e.sourceNode}──[${e.targetHandle}]──▶${e.targetNode}`).join(", ")}`);
  console.log(`${"═".repeat(60)}`);

  // Build adjacency + in-degree
  const adjacency = {};
  const parents = {};
  const remaining = {};

  for (const n of nodes) {
    adjacency[n.id] = [];
    parents[n.id] = [];
    remaining[n.id] = 0;
  }
  for (const e of edges) {
    adjacency[e.sourceNode].push(e.targetNode);
    parents[e.targetNode].push(e.sourceNode);
    remaining[e.targetNode]++;
  }

  const outputs = new Map();
  const results = [];

  async function tryExecute(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    const inputs = resolveInputs(nodeId, edges, outputs);

    const { status, output, error } = await executeNode(node, inputs);
    results.push({ nodeId, type: node.type, status, output, error });

    if (status === "Failed") {
      console.error(`\n❌ Node ${nodeId} failed — stopping downstream execution`);
      return;
    }

    outputs.set(nodeId, output);

    // Unlock children
    for (const childId of adjacency[nodeId]) {
      remaining[childId]--;
      if (remaining[childId] === 0) {
        await tryExecute(childId);
      }
    }
  }

  // Start root nodes (in-degree 0)
  const roots = nodes.filter(n => remaining[n.id] === 0);
  await Promise.all(roots.map(n => tryExecute(n.id)));

  return results;
}

// ── Report ─────────────────────────────────────────────────────────────────
function printReport(results) {
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊  EXECUTION REPORT");
  console.log(`${"═".repeat(60)}`);

  let allPassed = true;
  for (const r of results) {
    const badge = r.status === "Completed" ? "✅" : "❌";
    console.log(`\n${badge}  ${r.nodeId}  (${r.type})  →  ${r.status}`);
    if (r.error) {
      console.log(`     Error: ${r.error}`);
      allPassed = false;
    }
    if (r.output) {
      const out = typeof r.output === "object" ? JSON.stringify(r.output, null, 2) : r.output;
      console.log(`     Output: ${out.replace(/\n/g, "\n             ")}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  if (allPassed) {
    console.log("🎉  All nodes completed successfully!");
  } else {
    const failed = results.filter(r => r.status !== "Completed");
    console.log(`❌  ${failed.length} node(s) failed: ${failed.map(r => r.nodeId).join(", ")}`);
  }
  console.log(`${"═".repeat(60)}\n`);
}

// ── Run ────────────────────────────────────────────────────────────────────
const nodes = [nodeA, nodeB, nodeC];
const results = await runDAG(nodes, edges);
printReport(results);
