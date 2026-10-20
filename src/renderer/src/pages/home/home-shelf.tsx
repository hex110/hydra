import type { ReactNode } from "react";

interface HomeShelfProps {
  title: string;
  description?: string;
  /** A link at the end of the header, such as "See all". */
  action?: ReactNode;
  /** Wider cards, for news. */
  wide?: boolean;
  children: ReactNode;
}

/** One row of cards; whatever doesn't fit the width is cut off. */
export function HomeShelf({
  title,
  description,
  action,
  wide = false,
  children,
}: Readonly<HomeShelfProps>) {
  return (
    <section className="home__shelf">
      <div className="home__shelf-header">
        <h2>{title}</h2>
        {description && (
          <p className="home__shelf-description">{description}</p>
        )}
        {action && <div className="home__shelf-action">{action}</div>}
      </div>
      <div className={`home__shelf-row${wide ? " home__shelf-row--wide" : ""}`}>
        {children}
      </div>
    </section>
  );
}
