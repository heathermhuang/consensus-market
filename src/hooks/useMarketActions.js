import { useState } from "react";
import { ethers } from "ethers";
import {
  buildMarketId,
  buildResolutionDomain,
  buildResolutionPayload,
  marketAbi,
  oracleAbi,
  registryAbi,
  resolutionTypes,
} from "../contracts";
import { normalizeAddress, requireAddress } from "../lib/market-utils";

export default function useMarketActions({
  wallet,
  runtimeConfig,
  configuredRpcUrls,
  hasLiveContracts,
  hasRuntimeRpc,
  canOperate,
  isWalletBlacklisted,
  setBanner,
  refreshOnChain,
  getSelectedMarket,
  getAttestationForm,
  getOperatorForm,
  getCreateMarketForm,
  getStakeAmount,
}) {
  const [busyAction, setBusyAction] = useState("");
  const [signature, setSignature] = useState("");
  const [digest, setDigest] = useState("");

  const walletOnExpectedChain = wallet.chainId === runtimeConfig.chainId;

  async function runMarketAction(label, callback) {
    if (!wallet.signer) { setBanner("Connect a wallet first."); return; }
    if (isWalletBlacklisted) {
      setBanner("This wallet is on this browser's local restricted list. On-chain denylist enforcement is not enabled yet.");
      return;
    }
    if (!hasLiveContracts) {
      setBanner("Add live contract addresses to the Worker runtime config to enable on-chain actions.");
      return;
    }
    if (hasRuntimeRpc && !walletOnExpectedChain) {
      setBanner(`Switch your wallet to chain ${runtimeConfig.chainId} before sending transactions.`);
      return;
    }
    try {
      setBusyAction(label);
      await callback();
      await refreshOnChain();
    } catch (error) {
      setBanner(error.shortMessage || error.message || "Transaction failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function runOperatorAction(label, callback) {
    if (!wallet.signer) { setBanner("Connect a wallet first."); return; }
    if (!hasLiveContracts) {
      setBanner("The operator console needs market, oracle, and registry addresses plus an RPC URL.");
      return;
    }
    if (hasRuntimeRpc && !walletOnExpectedChain) {
      setBanner(`Switch your wallet to chain ${runtimeConfig.chainId} before using operator actions.`);
      return;
    }
    if (!canOperate) {
      setBanner("The connected wallet is not the contract owner set. Switch to the operator wallet to use admin actions.");
      return;
    }
    try {
      setBusyAction(label);
      await callback();
      await refreshOnChain();
    } catch (error) {
      setBanner(error.shortMessage || error.message || "Operator action failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function takePosition(side) {
    const selectedMarket = getSelectedMarket();
    const stakeAmount = getStakeAmount();
    await runMarketAction(`position-${side}`, async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.takePosition(selectedMarket.marketId, side, BigInt(stakeAmount || "0"));
      await tx.wait();
      setBanner(`Submitted a ${side === 1 ? "Beat" : "Miss"} position on ${selectedMarket.ticker}.`);
    });
  }

  async function settleMarket() {
    const selectedMarket = getSelectedMarket();
    await runMarketAction("settle", async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.settleMarket(selectedMarket.marketId);
      await tx.wait();
      setBanner(`Settled ${selectedMarket.ticker} using the oracle resolution.`);
    });
  }

  async function claimPayout() {
    const selectedMarket = getSelectedMarket();
    await runMarketAction("claim", async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.claim(selectedMarket.marketId);
      await tx.wait();
      setBanner(`Claimed demo-credit payout for ${selectedMarket.ticker}.`);
    });
  }

  async function signAttestation() {
    const selectedMarket = getSelectedMarket();
    const attestationForm = getAttestationForm();
    if (!wallet.signer) { setBanner("Connect a wallet to sign the EIP-712 attestation."); return; }
    if (!runtimeConfig.oracleAddress) {
      setBanner("Add a live oracle address to Worker runtime config before signing attestations.");
      return;
    }
    if (hasRuntimeRpc && !walletOnExpectedChain) {
      setBanner(`Switch your wallet to chain ${runtimeConfig.chainId} before signing the attestation.`);
      return;
    }
    try {
      setBusyAction("sign");
      const payload = buildResolutionPayload(selectedMarket.marketId, attestationForm);
      const signed = await wallet.signer.signTypedData(
        buildResolutionDomain(wallet.chainId || runtimeConfig.chainId, runtimeConfig.oracleAddress),
        resolutionTypes,
        payload
      );
      setSignature(signed);
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.provider);
      const nextDigest = await oracleContract.hashResolutionPayload(payload);
      setDigest(nextDigest);
      setBanner("Resolution attestation signed locally. Any relayer can now submit it on-chain.");
    } catch (error) {
      setBanner(error.shortMessage || error.message || "Could not sign attestation.");
    } finally {
      setBusyAction("");
    }
  }

  async function relayAttestation() {
    const selectedMarket = getSelectedMarket();
    const attestationForm = getAttestationForm();
    if (!signature) { setBanner("Sign the attestation first."); return; }
    await runMarketAction("relay", async () => {
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.signer);
      const payload = buildResolutionPayload(selectedMarket.marketId, attestationForm);
      const tx = await oracleContract.publishSignedResolution(payload, signature);
      await tx.wait();
      setBanner(`Relayed signed oracle resolution for ${selectedMarket.ticker}.`);
    });
  }

  async function publishDirectResolution() {
    const selectedMarket = getSelectedMarket();
    const attestationForm = getAttestationForm();
    await runOperatorAction("direct-resolve", async () => {
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.signer);
      const tx = await oracleContract.publishResolution(
        selectedMarket.marketId,
        BigInt(attestationForm.actualValue || "0"),
        ethers.id(attestationForm.sourceLabel || "manual-resolution"),
        attestationForm.sourceUri || ""
      );
      await tx.wait();
      setBanner(`Published direct oracle resolution for ${selectedMarket.ticker}.`);
    });
  }

  async function setEligibility(eligible) {
    const operatorForm = getOperatorForm();
    await runOperatorAction(`eligible-${eligible ? "on" : "off"}`, async () => {
      const targetAddress = requireAddress(operatorForm.eligibilityAddress, "eligibility wallet");
      const registryContract = new ethers.Contract(runtimeConfig.registryAddress, registryAbi, wallet.signer);
      const tx = await registryContract.setEligible(targetAddress, eligible);
      await tx.wait();
      setBanner(`${eligible ? "Allowlisted" : "Removed"} ${targetAddress} in the eligibility registry.`);
    });
  }

  async function grantCredits() {
    const operatorForm = getOperatorForm();
    await runOperatorAction("grant-credits", async () => {
      const targetAddress = requireAddress(operatorForm.creditAddress, "credit recipient");
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.grantDemoCredits(targetAddress, BigInt(operatorForm.creditAmount || "0"));
      await tx.wait();
      setBanner(`Granted ${operatorForm.creditAmount} demo credits to ${targetAddress}.`);
    });
  }

  async function setReporter(authorized) {
    const operatorForm = getOperatorForm();
    await runOperatorAction(`reporter-${authorized ? "on" : "off"}`, async () => {
      const targetAddress = requireAddress(operatorForm.reporterAddress, "reporter");
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.signer);
      const tx = await oracleContract.setReporter(targetAddress, authorized);
      await tx.wait();
      setBanner(`${authorized ? "Authorized" : "Revoked"} reporter ${targetAddress}.`);
    });
  }

  async function setSigner(authorized) {
    const operatorForm = getOperatorForm();
    await runOperatorAction(`signer-${authorized ? "on" : "off"}`, async () => {
      const targetAddress = requireAddress(operatorForm.signerAddress, "signer");
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.signer);
      const tx = await oracleContract.setSigner(targetAddress, authorized);
      await tx.wait();
      setBanner(`${authorized ? "Authorized" : "Revoked"} signer ${targetAddress}.`);
    });
  }

  async function createMarket() {
    const createMarketForm = getCreateMarketForm();
    await runOperatorAction("create-market", async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.createMarket(
        buildMarketId(createMarketForm.idSeed),
        createMarketForm.ticker,
        createMarketForm.metricName,
        BigInt(createMarketForm.consensusValue || "0"),
        createMarketForm.consensusSource,
        createMarketForm.resolutionPolicy,
        BigInt(createMarketForm.opensAt || "0"),
        BigInt(createMarketForm.locksAt || "0"),
        BigInt(createMarketForm.expectedAnnouncementAt || "0")
      );
      await tx.wait();
      setBanner(`Created market ${createMarketForm.ticker} · ${createMarketForm.metricName}.`);
    });
  }

  async function cancelSelectedMarket() {
    const selectedMarket = getSelectedMarket();
    await runOperatorAction("cancel-market", async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.cancelMarket(selectedMarket.marketId);
      await tx.wait();
      setBanner(`Cancelled ${selectedMarket.ticker} · ${selectedMarket.metricName}.`);
    });
  }

  return {
    busyAction,
    signature,
    digest,
    takePosition,
    settleMarket,
    claimPayout,
    signAttestation,
    relayAttestation,
    publishDirectResolution,
    setEligibility,
    grantCredits,
    setReporter,
    setSigner,
    createMarket,
    cancelSelectedMarket,
  };
}
