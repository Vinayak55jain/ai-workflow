/**
 * debug-edges.mjs
 *
 * Diagnoses the targetNode vs nodeId mismatch in resolveInputs.
 * Fetches the latest workflow from the DB and prints every edge
 * alongside each node id, showing exactly which edges match and
 * which ones fail e.targetNode === nodeId.
 *
 * Run: node debug-edges.mjs
 */

import { readFileSync } from "fs";

// Load .env
const env = readFileSync(".env", "utf-8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[k] = v;
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

// ── Grab the most recently updated workflow ──────────────────────────────
const workflow = await prisma.workflow.findFirst({
  orderBy: { updatedAt: "desc" },
  include: { nodes: true, edges: true },
});

if (!workflow) {
  console.log("No workflows found in the database.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`\nWorkflow: "${workflow.name}" (${workflow.id})`);
console.log(`Nodes: ${workflow.nodes.length}   Edges: ${workflow.edges.length}`);

// ── Print every node id ──────────────────────────────────────────────────
console.log("\n=== NODE IDs ===");
for (const n of workflow.nodes) {
  console.log(`  ${n.type.padEnd(15)} id = ${n.id}`);
}

// ── Print every edge and check field names ───────────────────────────────
console.log("\n=== EDGE FIELDS (raw Prisma object) ===");
const firstEdge = workflow.edges[0];
if (firstEdge) {
  console.log("Keys on a WorkflowEdge:", Object.keys(firstEdge).join(", "));
  console.log("Sample edge:", JSON.stringify(firstEdge, null, 2));
}

// ── Simulate resolveInputs for every node ───────────────────────────────
console.log("\n=== resolveInputs SIMULATION ===");
const nodeIds = new Set(workflow.nodes.map(n => n.id));

for (const node of workflow.nodes) {
  // This is exactly what resolveInputs does:
  const incomingEdges = workflow.edges.filter(e => e.targetNode === node.id);

  // Also check using 'target' (React Flow field) in case there's a mismatch
  const incomingByTarget = workflow.edges.filter((e) => e.target === node.id);

  const status = incomingEdges.length > 0
    ? `✅ ${incomingEdges.length} incoming edge(s) found`
    : incomingByTarget.length > 0
    ? `❌ 0 via targetNode BUT ${incomingByTarget.length} via e.target — FIELD NAME MISMATCH`
    : `⚪ root node (0 incoming edges — expected for ${node.type})`;

  console.log(`  ${node.type.padEnd(15)} ${node.id.substring(0, 12)}…  ${status}`);
  if (incomingEdges.length > 0) {
    for (const e of incomingEdges) {
      const sourceType = workflow.nodes.find(n => n.id === e.sourceNode)?.type ?? "unknown";
      console.log(`     ← from ${sourceType} [handle: ${e.targetHandle ?? "null"}]`);
    }
  }
}

// ── Check for dangling edges (edges pointing to non-existent node ids) ───
console.log("\n=== DANGLING EDGE CHECK ===");
let hasProblems = false;
for (const edge of workflow.edges) {
  const targetExists = nodeIds.has(edge.targetNode);
  const sourceExists = nodeIds.has(edge.sourceNode);
  if (!targetExists || !sourceExists) {
    hasProblems = true;
    console.log(`  ❌ DANGLING EDGE ${edge.id.substring(0, 8)}…`);
    if (!sourceExists) console.log(`     sourceNode ${edge.sourceNode.substring(0, 12)}… NOT in nodes`);
    if (!targetExists) console.log(`     targetNode ${edge.targetNode.substring(0, 12)}… NOT in nodes`);
  }
}
if (!hasProblems) {
  console.log("  ✅ All edge sourceNode/targetNode values match existing node IDs");
}

// ── Check saveWorkflow edge mapping ─────────────────────────────────────
console.log("\n=== EDGE FIELD NAMES AVAILABLE ===");
if (firstEdge) {
  const hasSourceNode  = "sourceNode"  in firstEdge;
  const hasTargetNode  = "targetNode"  in firstEdge;
  const hasSource      = "source"      in firstEdge;
  const hasTarget      = "target"      in firstEdge;
  console.log(`  sourceNode field present: ${hasSourceNode ? "✅" : "❌"}`);
  console.log(`  targetNode field present: ${hasTargetNode ? "✅" : "❌"}`);
  console.log(`  source field present:     ${hasSource ? "⚠️  YES (React Flow field — wrong)" : "✅ no"}`);
  console.log(`  target field present:     ${hasTarget ? "⚠️  YES (React Flow field — wrong)" : "✅ no"}`);
  
  if (hasSource || hasTarget) {
    console.log("\n  ⚠️  DIAGNOSIS: Edges were saved with React Flow field names (source/target)");
    console.log("     instead of DB field names (sourceNode/targetNode).");
    console.log("     This means e.targetNode === nodeId will ALWAYS be false.");
    console.log("     Fix: correct the saveWorkflow mapping in src/actions/workflow.ts");
  }
}

await prisma.$disconnect();
