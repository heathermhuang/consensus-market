import { readdirSync, rmSync } from "node:fs";
import path from "node:path";

const artifactsRoot = path.resolve("artifacts/contracts");

function removeDuplicateArtifacts(directory) {
  let removed = 0;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      removed += removeDuplicateArtifacts(fullPath);
      continue;
    }

    if (/ \d+\.json$/i.test(entry.name)) {
      rmSync(fullPath, { force: true });
      removed += 1;
    }
  }

  return removed;
}

try {
  const removed = removeDuplicateArtifacts(artifactsRoot);
  if (removed > 0) {
    console.log(`Removed ${removed} duplicate Hardhat artifact file(s).`);
  }
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}
