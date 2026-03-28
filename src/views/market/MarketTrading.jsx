import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  shortAddress,
} from "../../contracts";
import { useWalletContext } from "../../contexts/WalletContext";
import { useRuntimeContext } from "../../contexts/RuntimeContext";
import { formatConsensusDisplay, formatCountdown } from "../../lib/market-utils";

export default function MarketTrading({
  selectedMarket,
  hitProbability,
  missProbability,
  hitPreview,
  missPreview,
  selectedPositionLabel,
  selectedOutcomeLabel,
  stakeAmount,
  setStakeAmount,
  busyAction,
  takePosition,
  settleMarket,
  claimPayout,
}) {
  const { wallet, walletOnExpectedChain, setConnectModalOpen, connectDemoChain } = useWalletContext();

  return (
    <aside className="market-sidebar" aria-label="Trade ticket and market summary">
      <article id="market-ticket" className="surface-card trade-panel sticky-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">Trade ticket</p>
            <h2>Take a position</h2>
          </div>
          <span className="hero-pill">
            {wallet.account ? shortAddress(wallet.account) : "Wallet not connected"}
          </span>
        </div>

        <label>
          Stake amount
          <input
            className="stake-input"
            aria-label="Stake amount"
            placeholder="Enter demo credits"
            value={stakeAmount}
            onChange={(event) => setStakeAmount(event.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
          />
        </label>

        <div className="trade-quote-grid">
          <article className="trade-quote trade-quote-beat">
            <span className="field-label">Beat payout</span>
            <strong>{formatNumber(hitPreview)}</strong>
            <p>{formatPercent(hitProbability)} implied probability</p>
          </article>
          <article className="trade-quote trade-quote-miss">
            <span className="field-label">Miss payout</span>
            <strong>{formatNumber(missPreview)}</strong>
            <p>{formatPercent(missProbability)} implied probability</p>
          </article>
        </div>

        <p className="helper-copy">
          {wallet.account
            ? "Use demo credits to express a view. Resolution only depends on the issuer-reported KPI."
            : "Connect a wallet when you are ready to place a demo trade."}
        </p>

        <div className="action-row action-row-trade">
          <button
            type="button"
            className="primary action-buy-beat"
            disabled={busyAction !== ""}
            onClick={() => takePosition(1)}
          >
            {busyAction === "position-1" ? "Submitting..." : "Buy beat"}
          </button>
          <button
            type="button"
            className="secondary action-buy-miss"
            disabled={busyAction !== ""}
            onClick={() => takePosition(2)}
          >
            {busyAction === "position-2" ? "Submitting..." : "Buy miss"}
          </button>
        </div>

        <div className="action-row">
          <button
            type="button"
            className="ghost"
            disabled={busyAction !== ""}
            onClick={settleMarket}
          >
            {busyAction === "settle" ? "Settling..." : "Settle market"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busyAction !== ""}
            onClick={claimPayout}
          >
            {busyAction === "claim" ? "Claiming..." : "Claim payout"}
          </button>
        </div>

        {!wallet.account && (
          <button type="button" className="ghost full-width" onClick={() => setConnectModalOpen(true)}>
            Connect wallet
          </button>
        )}

        {!walletOnExpectedChain && wallet.account && (
          <button type="button" className="ghost full-width" onClick={connectDemoChain}>
            Switch to Ethereum
          </button>
        )}
      </article>

      <article className="surface-card rail-card">
        <div className="panel-heading panel-heading-compact">
          <div>
            <p className="section-label">Market brief</p>
            <h2>Position, consensus, and pool view</h2>
          </div>
        </div>
        <div className="rail-card-grid">
          <article className="snapshot-card">
            <span className="field-label">My position</span>
            <strong>{selectedPositionLabel}</strong>
            <p>{formatNumber(selectedMarket.myStake)} demo credits currently staked.</p>
          </article>
          <article className="snapshot-card">
            <span className="field-label">Locked reference</span>
            <strong>{selectedMarket.frozenConsensusSource}</strong>
            <p>The market resolves against the benchmark frozen at lock.</p>
          </article>
          <article className="snapshot-card">
            <span className="field-label">Trading window</span>
            <strong>{formatTimestamp(selectedMarket.locksAt)}</strong>
            <p>
              Locks {formatCountdown(selectedMarket.locksAt)}. Opens{" "}
              {formatTimestamp(selectedMarket.opensAt)}.
            </p>
          </article>
          <article className="note-card">
            <span className="field-label">Consensus move</span>
            <strong>{selectedMarket.consensusMoveLabel}</strong>
            <p>
              {selectedMarket.currentConsensusDisplay} now versus{" "}
              {formatConsensusDisplay(
                selectedMarket.openingConsensusSnapshot.value,
                selectedMarket.consensusDisplay
              )}{" "}
              on the first street read.
            </p>
          </article>
          <article className="note-card">
            <span className="field-label">Oracle outcome</span>
            <strong>{selectedOutcomeLabel}</strong>
            <p>{selectedMarket.sourceUri || "Waiting for a signed source URI."}</p>
          </article>
          <article className="note-card">
            <span className="field-label">Resolution policy</span>
            <strong>Issuer disclosure only</strong>
            <p>{selectedMarket.resolutionPolicy}</p>
          </article>
          <article className="note-card">
            <span className="field-label">Beat pool</span>
            <strong className="tone-beat">{formatNumber(selectedMarket.hitPool)}</strong>
            <p>{formatPercent(hitProbability)} of current liquidity is on beat.</p>
          </article>
          <article className="note-card">
            <span className="field-label">Miss pool</span>
            <strong className="tone-miss">{formatNumber(selectedMarket.missPool)}</strong>
            <p>{formatPercent(missProbability)} of current liquidity is on miss.</p>
          </article>
        </div>
      </article>

      <article className="surface-card compliance-card compliance-card-quiet">
        <p className="section-label">Demo boundary</p>
        <ul className="compliance-list">
          <li>Only issuer-reported KPIs can resolve a market.</li>
          <li>Users trade closed-loop demo credits, not withdrawable assets.</li>
          <li>Every resolution can be traced to a signed payload, source hash, and URI.</li>
          <li>Markets stay binary: beat or miss against a documented consensus snapshot.</li>
        </ul>
      </article>
    </aside>
  );
}
