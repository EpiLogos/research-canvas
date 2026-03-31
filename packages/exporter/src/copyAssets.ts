import fs from "node:fs/promises";
import path from "node:path";

import type { ExportAsset } from "@research-canvas/schema";

export async function copyAssets(assets: ExportAsset[], outputDir: string) {
  const copiedAssets: string[] = [];
  const assetsDir = path.join(outputDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  for (const asset of assets) {
    const targetPath = path.join(assetsDir, asset.downloadName);
    await copyPath(asset.sourcePath, targetPath);
    copiedAssets.push(targetPath);
  }

  return copiedAssets;
}

async function copyPath(sourcePath: string, targetPath: string) {
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.mkdir(targetPath, { recursive: true });
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      await copyPath(
        path.join(sourcePath, entry.name),
        path.join(targetPath, entry.name)
      );
    }
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}
