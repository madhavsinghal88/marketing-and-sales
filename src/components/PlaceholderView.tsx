type Props = {
  eyebrow: string;
  title: string;
  description: string;
  phaseHint: string;
  bullets?: string[];
};

export function PlaceholderView({
  eyebrow,
  title,
  description,
  phaseHint,
  bullets = [],
}: Props) {
  return (
    <section className="view-panel" aria-label={title}>
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="view-panel__sub">{description}</p>
        </div>
        <span className="phase-chip">{phaseHint}</span>
      </div>

      {bullets.length > 0 ? (
        <ul className="placeholder-list">
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
