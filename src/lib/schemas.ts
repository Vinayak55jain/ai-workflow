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
