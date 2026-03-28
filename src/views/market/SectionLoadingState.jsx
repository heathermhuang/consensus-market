export default function SectionLoadingState({ title, copy, cards = 2 }) {
  return (
    <div className="loading-state" aria-busy="true" aria-live="polite">
      <div className="loading-state-copy">
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
      <div className={`loading-state-grid ${cards === 1 ? "loading-state-grid-single" : ""}`}>
        {Array.from({ length: cards }).map((_, index) => (
          <article key={`${title}-${index}`} className="loading-card">
            <span className="loading-block loading-block-kicker" />
            <span className="loading-block loading-block-title" />
            <span className="loading-block loading-block-line" />
            <span className="loading-block loading-block-line loading-block-line-short" />
          </article>
        ))}
      </div>
    </div>
  );
}
