import { tasks, runs } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import type { cropImageTask } from "@/trigger/cropImage";
import type { geminiTask } from "@/trigger/geminiGenerate";

// ─────────────────────────────────────────────────────────────
// One-time diagnostic log — confirms env vars are actually loaded
// in this process. Safe to leave in during debugging; remove once
// the underlying issue is confirmed fixed.
// ─────────────────────────────────────────────────────────────
console.log("=========================================");
console.log("🔧 [nodeRunner] ENV CHECK on module load:");
console.log("   TRIGGER_SECRET_KEY present?", Boolean(process.env.TRIGGER_SECRET_KEY));
console.log("   TRIGGER_SECRET_KEY prefix:", process.env.TRIGGER_SECRET_KEY?.slice(0, 10) ?? "MISSING");
console.log("   GEMINI_API_KEY present?", Boolean(process.env.GEMINI_API_KEY));
console.log("=========================================");

/**
 * Extracts a readable message + cause from any thrown value.
 * Trigger.dev SDK errors don't always stringify cleanly with
 * console.error(err) alone — this pulls out the actual useful parts.
 */
function describeError(err: unknown): Record<string, any> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      cause: (err as any).cause,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
    };
  }
  try {
    return { raw: JSON.stringify(err) };
  } catch {
    return { raw: String(err) };
  }
}

export async function executeNode(
  node: { id: string; type: string; config: any },
  inputs: Record<string, any>,
  runId: string
) {
  console.log("=========================================");
  console.log(`🔵 [executeNode] Starting node execution`);
  console.log(`🔵 Node ID: ${node.id}`);
  console.log(`🔵 Node Type: ${node.type}`);
  console.log(`🔵 Node Config:`, JSON.stringify(node.config).substring(0, 200) + "...");
  console.log(`🔵 Incoming Inputs:`, Object.keys(inputs).reduce((acc, key) => {
    const val = inputs[key];
    acc[key] = typeof val === 'object' ? JSON.stringify(val).substring(0, 100) + "..." : val;
    return acc;
  }, {} as Record<string, any>));

  const nodeExecution = await prisma.runNodeExecution.create({
    data: { runId, nodeId: node.id, status: "Running", input: inputs },
  });

  switch (node.type) {
    case "RequestInput": {
      console.log(`✅ [nodeRunner] RequestInput resolving instantly with its config.`);
      await prisma.runNodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "Completed", output: node.config, finishedAt: new Date() },
      });
      return node.config;
    }

    case "CropImage": {
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

      const imageUrl =
        imageRaw?.croppedImageUrl ??
        imageRaw?.image_field ??
        (typeof imageRaw === "string" ? imageRaw : undefined);

      if (!imageUrl) {
        console.error(
          "🔴 [nodeRunner] Crop node missing image input. Node:", node.id,
          "| Inputs received:", JSON.stringify(inputs).substring(0, 100)
        );
        throw new Error(`Crop node ${node.id} has no connected image input — check edge handle IDs`);
      }

      // 🔵 FIX: slider fields are stored as x_position / y_position per the
      // node field type table — node.config.x / node.config.y never existed,
      // which is why FFmpeg was receiving "crop=undefined:undefined:undefined:undefined".
      const cropX = node.config.x_position ?? node.config.x;
      const cropY = node.config.y_position ?? node.config.y;
      const cropWidth = node.config.width;
      const cropHeight = node.config.height;

      console.log("🔵 [nodeRunner] Triggering crop-image task with payload:", {
        imageUrlPresent: !!imageUrl,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
      });

      if ([cropX, cropY, cropWidth, cropHeight].some((v) => v === undefined || v === null)) {
        console.error(
          "🔴 [nodeRunner] Crop node missing dimension config. Node:", node.id,
          "| Resolved values:", { cropX, cropY, cropWidth, cropHeight },
          "| Full node.config:", JSON.stringify(node.config)
        );
        throw new Error(
          `Crop node ${node.id} has incomplete dimensions — check that the CropImageNode slider component saves to x_position/y_position/width/height`
        );
      }

      console.log("🔵 [nodeRunner] About to call trigger+poll for crop-image...");
      let result;
      try {
        // nodeRunner.ts runs in plain Next.js server context — NOT inside a
        // Trigger.dev task.run(). triggerAndWait() only works task-to-task.
        // Correct pattern outside a task: trigger() then runs.poll() to wait.
        const handle = await tasks.trigger<typeof cropImageTask>("crop-image", {
          imageUrl: typeof imageUrl === 'string' ? imageUrl : JSON.stringify(imageUrl),
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight,
          nodeExecutionId: nodeExecution.id,
        });
        console.log("🔵 [nodeRunner] crop-image triggered, run id:", handle.id, "— polling...");
        result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        console.log("✅ [nodeRunner] poll returned for crop-image. status =", result.status);
      } catch (triggerErr) {
        const details = describeError(triggerErr);
        console.error("🔴 [nodeRunner] trigger/poll THREW for crop-image:");
        console.error("   Name:", details.name);
        console.error("   Message:", details.message ?? details.raw);
        console.error("   Cause:", details.cause);
        console.error("   Stack (first 5 lines):", details.stack);
        await prisma.runNodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "Failed", finishedAt: new Date() },
        });
        throw triggerErr;
      }

      if (result.status !== "COMPLETED") {
        await prisma.runNodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "Failed", finishedAt: new Date() },
        });
        throw new Error(`Crop task failed for node ${node.id} — status: ${result.status}`);
      }
      return result.output;
    }

    case "GeminiModel": {
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

      // ── Resolve all 4 media inputs ──────────────────────────────────────
      // Each can arrive via a direct edge (keyed by handle id) OR by a user
      // uploading a file directly in the node UI (stored in node.config).
      const imageInput = inputs["image"] ?? inputs["image_out"] ??
        Object.values(inputs).find((v) => typeof v === "object" && v !== null && "croppedImageUrl" in v);

      const videoInput = inputs["video"];
      const audioInput = inputs["audio"];
      const fileInput  = inputs["file"];

      const resolvedPrompt = resolveTemplate(node.config.prompt, promptInput);
      const finalPrompt = resolvedPrompt?.trim()
        ? resolvedPrompt
        : (typeof promptInput === "string"
            ? promptInput
            : promptInput?.text_field ?? promptInput?.response ?? JSON.stringify(promptInput ?? ""));

      // ── Extract actual data strings ──────────────────────────────────────
      // image: may come from CropImage (croppedImageUrl), RequestInput (image_field),
      //        or direct upload in node config (node.config.image — a data-URL)
      const imageBase64 =
        imageInput?.croppedImageUrl ??
        imageInput?.image_field ??
        (typeof imageInput === "string" ? imageInput : undefined) ??
        (node.config.image as string | undefined);

      const videoBase64 =
        (typeof videoInput === "string" ? videoInput : videoInput?.video_field) ??
        (node.config.video as string | undefined);

      const audioBase64 =
        (typeof audioInput === "string" ? audioInput : audioInput?.audio_field) ??
        (node.config.audio as string | undefined);

      // File input stores raw text content (FileReader.readAsText)
      const fileText =
        (typeof fileInput === "string" ? fileInput : fileInput?.file_field) ??
        (node.config.file as string | undefined);

      const fileMimeType = node.config.file_mime as string | undefined;

      console.log("🔵 [nodeRunner] Gemini Task Payload Prep:");
      console.log("   - Template string:", node.config.prompt ?? "(none — using raw input)");
      console.log("   - Final Resolved Prompt:", finalPrompt?.substring(0, 80));
      console.log("   - System Prompt:", node.config.systemPrompt ?? node.config.system_prompt);
      console.log("   - image?", !!imageBase64, "| video?", !!videoBase64,
                  "| audio?", !!audioBase64, "| file?", !!fileText);

      console.log("🔵 [nodeRunner] About to call trigger+poll for gemini-generate...");
      console.log("   - prompt length:", finalPrompt?.length ?? 0);
      console.log("   - nodeExecutionId:", nodeExecution.id);

      let result;
      try {
        const handle = await tasks.trigger<typeof geminiTask>("gemini-generate", {
          prompt: finalPrompt,
          systemPrompt: node.config.systemPrompt ?? node.config.system_prompt,
          imageBase64,
          videoBase64,
          audioBase64,
          fileText,
          fileMimeType,
          nodeExecutionId: nodeExecution.id,
        });
        console.log("🔵 [nodeRunner] gemini-generate triggered, run id:", handle.id, "— polling...");
        result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        console.log("✅ [nodeRunner] poll returned for gemini-generate. status =", result.status);
      } catch (triggerErr) {
        const details = describeError(triggerErr);
        console.error("🔴 [nodeRunner] trigger/poll THREW for gemini-generate:");
        console.error("   Name:", details.name);
        console.error("   Message:", details.message ?? details.raw);
        console.error("   Cause:", details.cause);
        console.error("   Stack (first 5 lines):", details.stack);
        await prisma.runNodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "Failed", finishedAt: new Date() },
        });
        throw triggerErr;
      }

      if (result.status !== "COMPLETED") {
        await prisma.runNodeExecution.update({
          where: { id: nodeExecution.id },
          data: { status: "Failed", finishedAt: new Date() },
        });
        throw new Error(`Gemini task failed for node ${node.id}`);
      }

      await prisma.runNodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "Completed", output: result.output, finishedAt: new Date() },
      });
      return result.output;
    }

    case "Response": {
      const finalOutput = inputs["input"] ?? inputs["default"] ?? inputs;
      console.log(`✅ [nodeRunner] Response node resolving instantly with inputs.`);
      await prisma.runNodeExecution.update({
        where: { id: nodeExecution.id },
        data: { status: "Completed", output: finalOutput, finishedAt: new Date() },
      });
      return finalOutput;
    }

    default:
      console.error(`🔴 [nodeRunner] Unknown node type encountered: ${node.type}`);
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

function resolveTemplate(template: string, value: any): string {
  if (!value) return template ?? "";

  let text = typeof value === "string" ? value : undefined;

  if (!text && typeof value === "object") {
    text = value.response ?? value.text_field ?? value.output ?? JSON.stringify(value);
  }

  if (!template) return text ?? "";

  return template.replace(/\{\{.*?\}\}/g, text ?? "");
}