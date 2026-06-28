// src/trigger/geminiGenerate.ts
import { task } from "@trigger.dev/sdk/v3";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../lib/prisma";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Helper — strips the "data:<mime>;base64," prefix that FileReader.readAsDataURL adds
function stripDataUrlPrefix(dataUrl: string): { data: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mimeType: match[1], data: match[2] };
  return { mimeType: "application/octet-stream", data: dataUrl };
}

// ✅ Helper — checks if a value is a non-empty string
function hasValue(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const geminiTask = task({
  id: "gemini-generate",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: {
    prompt: string;
    systemPrompt?: string;
    imageBase64?: string;
    videoBase64?: string;
    audioBase64?: string;
    fileText?: string;
    fileMimeType?: string;
    nodeExecutionId: string;
  }) => {
    console.log("Starting Gemini task for execution", payload.nodeExecutionId);
    console.log("  prompt length :", payload.prompt?.length ?? 0);
    console.log("  image?        :", hasValue(payload.imageBase64));
    console.log("  video?        :", hasValue(payload.videoBase64));
    console.log("  audio?        :", hasValue(payload.audioBase64));
    console.log("  file?         :", hasValue(payload.fileText));

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      ...(hasValue(payload.systemPrompt) && {
        systemInstruction: payload.systemPrompt, // ✅ only added if provided
      }),
    });

    const parts: any[] = [{ text: payload.prompt }];

    // ✅ Only add image if provided
    if (hasValue(payload.imageBase64)) {
      const { data, mimeType } = stripDataUrlPrefix(payload.imageBase64);
      parts.push({ inlineData: { mimeType: mimeType || "image/jpeg", data } });
    }

    // ✅ Only add video if provided
    if (hasValue(payload.videoBase64)) {
      const { data, mimeType } = stripDataUrlPrefix(payload.videoBase64);
      parts.push({ inlineData: { mimeType: mimeType || "video/mp4", data } });
    }

    // ✅ Only add audio if provided
    if (hasValue(payload.audioBase64)) {
      const { data, mimeType } = stripDataUrlPrefix(payload.audioBase64);
      parts.push({ inlineData: { mimeType: mimeType || "audio/mpeg", data } });
    }

    // ✅ Only add file text if provided
    if (hasValue(payload.fileText)) {
      parts.push({ text: `\n\n[Attached file content]:\n${payload.fileText}` });
    }

    console.log("  total parts sent to Gemini:", parts.length);

    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    await prisma.runNodeExecution.updateMany({
      where: { id: payload.nodeExecutionId },
      data: {
        status: "Completed",
        output: { response: responseText },
        finishedAt: new Date(),
      },
    });

    return { response: responseText };
  },
});