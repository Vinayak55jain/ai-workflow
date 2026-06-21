import { readFileSync } from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

const env = readFileSync(".env", "utf-8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[k] = v;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Try the current recommended models in order
const candidates = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest",
  "gemini-pro",
];

for (const modelName of candidates) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([{ text: "Say hello in 3 words" }]);
    const text = result.response.text();
    console.log(`✅ ${modelName} → "${text.trim()}"`);
    break; // found a working model
  } catch (e) {
    console.log(`❌ ${modelName} → ${e.message.split("\n")[0]}`);
  }
}
