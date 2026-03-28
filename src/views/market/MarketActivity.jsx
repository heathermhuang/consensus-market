export default function MarketActivity({ activityFeed }) {
  return (
    <article id="market-activity" className="surface-card activity-card-shell">
      <div className="panel-heading">
        <div>
          <p className="section-label">Activity</p>
          <h2>Recent on-chain events</h2>
        </div>
        <span className="hero-pill">
          {activityFeed.length ? `${activityFeed.length} recent events` : "No report loaded"}
        </span>
      </div>
      <div className="activity-feed">
        {activityFeed.map((event) => (
          <article key={`${event.transactionHash}-${event.logIndex}`} className="activity-card">
            <span className="field-label">{event.eventName}</span>
            <strong>{event.summary}</strong>
            <p>{event.timestampLabel || "Unknown time"} · block {event.blockNumber}</p>
          </article>
        ))}
        {activityFeed.length === 0 && (
          <div className="empty-state">
            <strong>No indexed activity report found yet.</strong>
            <p>Run the event indexer to publish a curated feed into `public/activity.json`.</p>
          </div>
        )}
      </div>
    </article>
  );
}
