/**
 * Shared market-seed helpers used by operator-actions and oracle-resolve.
 *
 * Seeds are loaded from data/markets.json (the canonical seed file checked
 * into the repo).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ethers } from "ethers";

/**
 * Load all market seed definitions from data/markets.json.
 * @returns {Array<Object>}
 */
export function loadSeeds() {
  const file = path.resolve(process.cwd(), "data", "markets.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Find a seed by slug or idSeed string.  Returns null when no match.
 * @param {string} slugOrId
 * @returns {Object|null}
 */
export function findSeedBySlug(slugOrId) {
  if (!slugOrId) return null;
  return (
    loadSeeds().find(
      (seed) => seed.slug === slugOrId || seed.idSeed === slugOrId
    ) || null
  );
}

/**
 * Deterministic market ID from a seed's idSeed string (keccak256).
 * @param {string} idSeed
 * @returns {string} bytes32 hex
 */
export function computeMarketId(idSeed) {
  return ethers.id(idSeed);
}
