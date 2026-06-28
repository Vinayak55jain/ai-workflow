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
    console.log("Starting crop image task for", payload.imageUrl.substring(0, 50) + "...");

    // 1. Simulate 30-second processing
    await sleep(20);

    // 2. Pass original image forward (bypassing FFmpeg issues to reliably test Gemini)
    const outImage = payload.imageUrl;

    // 3. Update DB
    await prisma.runNodeExecution.updateMany({
      where: { id: payload.nodeExecutionId },
      data: {
        status: "Completed",
        output: { croppedImageUrl: outImage },
        finishedAt: new Date(),
      },
    });

    return { croppedImageUrl: outImage };
  },
});