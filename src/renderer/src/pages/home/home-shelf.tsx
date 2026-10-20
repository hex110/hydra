import type { ReactNode } from "react";

interface HomeShelfProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** One row of cards; whatever doesn't fit the width is cut off. */
export function HomeShelf({
  title,
  description,
  children,
}: Readonly<HomeShelfProps>) {
  return (
    <section className="home__shelf">
      <div className="home__shelf-header">
        <h2>{title}</h2>
        {description && (
          <p className="home__shelf-description">{description}</p>
        )}
      </div>
      <div className="home__shelf-row">{children}</div>
    </section>
  );
}
