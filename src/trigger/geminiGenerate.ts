// src/trigger/geminiGenerate.ts
import { task } from "@trigger.dev/sdk/v3";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../lib/prisma";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Helper — strips the "data:<mime>;base64," prefix that FileReader.readAsDataURL adds
function stripDataUrlPrefix(dataUrl: string): { data: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mimeType: match[1], data: match[2] };
  // Already raw base64 (e.g. from CropImage output)
  return { mimeType: "application/octet-stream", data: dataUrl };
}

export const geminiTask = task({
  id: "gemini-generate",
  run: async (payload: {
    prompt: string;
    systemPrompt?: string;
    // Each field is either a raw base64 string or a data-URL string.
    // Pass null/undefined to omit the input.
    imageBase64?: string;
    videoBase64?: string;
    audioBase64?: string;
    // For file inputs we send the text content directly, not base64
    fileText?: string;
    fileMimeType?: string;
    nodeExecutionId: string;
  }) => {
    console.log("Starting Gemini task for execution", payload.nodeExecutionId);
    console.log("  prompt length:", payload.prompt?.length ?? 0);
    console.log("  image?", !!payload.imageBase64);
    console.log("  video?", !!payload.videoBase64);
    console.log("  audio?", !!payload.audioBase64);
    console.log("  file?", !!payload.fileText);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      systemInstruction: payload.systemPrompt,
    });

    const parts: any[] = [{ text: payload.prompt }];

    if (payload.imageBase64) {
      const { data, mimeType } = stripDataUrlPrefix(payload.imageBase64);
      parts.push({ inlineData: { mimeType: mimeType || "image/jpeg", data } });
    }

    if (payload.videoBase64) {
      const { data, mimeType } = stripDataUrlPrefix(payload.videoBase64);
      parts.push({ inlineData: { mimeType: mimeType || "video/mp4", data } });
    }

    if (payload.audioBase64) {
      const { data, mimeType } = stripDataUrlPrefix(payload.audioBase64);
      parts.push({ inlineData: { mimeType: mimeType || "audio/mpeg", data } });
    }

    // File content — sent as plain text part so Gemini can read it
    if (payload.fileText) {
      parts.push({ text: `\n\n[Attached file content]:\n${payload.fileText}` });
    }

    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    await prisma.runNodeExecution.update({
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
