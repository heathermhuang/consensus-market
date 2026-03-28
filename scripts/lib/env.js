/**
 * Shared environment and provider helpers used across operator, oracle, and
 * event-indexing scripts.
 */

import process from "node:process";
import { ethers } from "ethers";

/**
 * Read a required environment variable or throw.
 * @param {string} name
 * @returns {string}
 */
export function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

/**
 * Create a read-only JSON-RPC provider.
 * @param {string} rpcUrl
 * @returns {ethers.JsonRpcProvider}
 */
export function connectProvider(rpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Create a Wallet signer connected to the given provider.
 * @param {string} rpcUrl
 * @param {string} privateKey
 * @returns {ethers.Wallet}
 */
export function connectSigner(rpcUrl, privateKey) {
  const provider = connectProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}
