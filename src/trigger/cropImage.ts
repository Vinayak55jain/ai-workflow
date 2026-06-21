// src/trigger/cropImage.ts
import { task } from "@trigger.dev/sdk/v3";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { prisma } from "../lib/prisma";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

export const cropImageTask = task({
  id: "crop-image",
  run: async (payload: {
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    nodeExecutionId: string;
  }) => {
    console.log("Starting crop image task for", payload.imageUrl);

    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `input_${Date.now()}.jpg`);
    const outputPath = path.join(tmpDir, `output_${Date.now()}.jpg`);

    // 1. Download image
    const res = await fetch(payload.imageUrl);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(inputPath, Buffer.from(buffer));

    // 2. Run FFmpeg crop
    execSync(
      `${ffmpegPath} -i ${inputPath} -vf "crop=${payload.width}:${payload.height}:${payload.x}:${payload.y}" ${outputPath}`
    );

    // 3. MANDATORY 30s artificial delay
    await sleep(30_000);

    // 4. Upload cropped image (placeholder until you wire real storage)
    const mockCroppedUrl = `${payload.imageUrl}?cropped=true&w=${payload.width}&h=${payload.height}`;

    // 5. Update DB
    await prisma.runNodeExecution.update({
      where: { id: payload.nodeExecutionId },
      data: {
        status: "Completed",
        output: { croppedImageUrl: mockCroppedUrl },
        finishedAt: new Date(),
      },
    });

    // 6. Cleanup
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    return { croppedImageUrl: mockCroppedUrl };
  },
});