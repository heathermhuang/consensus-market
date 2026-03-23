import { copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const redirectsPath = resolve("dist", "_redirects");
const distPath = resolve("dist");
const sourceHeadersPath = resolve("public", "_headers");
const distHeadersPath = resolve("dist", "_headers");

function removeDuplicateMacCopies(directory) {
  if (!existsSync(directory)) return 0;

  let removed = 0;
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      removed += removeDuplicateMacCopies(entryPath);
      continue;
    }

    if (/\s2(\.[^./]+)?$/u.test(entry.name)) {
      rmSync(entryPath, { force: true });
      removed += 1;
    }
  }

  return removed;
}

if (existsSync(redirectsPath)) {
  rmSync(redirectsPath);
  console.log("Removed dist/_redirects for Worker deployment.");
} else {
  console.log("No dist/_redirects file found.");
}

const duplicateCount = removeDuplicateMacCopies(distPath);
console.log(
  duplicateCount > 0
    ? `Removed ${duplicateCount} duplicate macOS copy artifacts from dist/.`
    : "No duplicate macOS copy artifacts found in dist/."
);

if (existsSync(sourceHeadersPath)) {
  copyFileSync(sourceHeadersPath, distHeadersPath);
  console.log("Synced public/_headers into dist/_headers for Worker deployment.");
} else {
  console.log("No public/_headers file found to sync.");
}
