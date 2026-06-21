/**
 * debug-node-config.mjs
 * Shows the exact shape of every node's config in the DB for the latest workflow.
 * Run: node debug-node-config.mjs
 */
import { readFileSync } from "fs";

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

const workflow = await prisma.workflow.findFirst({
  orderBy: { updatedAt: "desc" },
  include: { nodes: true, edges: true },
});

if (!workflow) { console.log("No workflows found."); process.exit(0); }

console.log(`\nWorkflow: "${workflow.name}" (${workflow.id})`);
console.log(`\n=== NODE CONFIGS ===`);
for (const n of workflow.nodes) {
  console.log(`\n  ${n.type} (${n.id.slice(0,8)}…)`);
  console.log(`  config =`, JSON.stringify(n.config, null, 4));

  // Simulate what RequestInput returns as output
  if (n.type === "RequestInput") {
    const output = n.config;
    const keys = typeof output === "object" && output !== null ? Object.keys(output) : [];
    const hasText = keys.includes("text_field");
    const hasImage = keys.includes("image_field");
    console.log(`  → RequestInput would output: keys=[${keys.join(", ")}]`);
    console.log(`    text_field present: ${hasText ? "✅" : "❌ MISSING"}`);
    console.log(`    image_field present: ${hasImage ? "✅" : "❌ MISSING"}`);
    if (!hasText && !hasImage) {
      console.log(`    ⚠️  Config is EMPTY — user data never saved into this node's config.`);
      
      // Check if there's a nested config key (saveWorkflow bug)
      if (typeof output === "object" && output !== null && "config" in output) {
        console.log(`    🐛 BUG FOUND: config has a nested "config" key — double-wrapping!`);
        console.log(`    Inner config =`, JSON.stringify(output.config));
      }
    }
  }

  // Show what GeminiModel would receive as prompt
  if (n.type === "GeminiModel") {
    const cfg = n.config;
    console.log(`  prompt template: "${cfg?.prompt ?? "(none)"}"`);
    console.log(`  systemPrompt: "${cfg?.systemPrompt ?? "(none)"}"`);
  }
}

console.log(`\n=== EDGE HANDLES ===`);
for (const e of workflow.edges) {
  const srcType = workflow.nodes.find(n => n.id === e.sourceNode)?.type ?? "?";
  const tgtType = workflow.nodes.find(n => n.id === e.targetNode)?.type ?? "?";
  console.log(`  ${srcType} --[${e.sourceHandle ?? "null"}]--> ${tgtType} --[${e.targetHandle ?? "null"}]-->`);
}

await prisma.$disconnect();
