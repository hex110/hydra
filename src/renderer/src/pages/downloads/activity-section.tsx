import { Children, type ReactNode } from "react";

import "./activity-section.scss";

interface ActivitySectionProps {
  title: string;
  count?: number;
  /** Header action, e.g. Clear all. */
  action?: ReactNode;
  /** Shown above the rows, e.g. the active download's card. */
  lead?: ReactNode;
  children?: ReactNode;
}

export function ActivitySection({
  title,
  count,
  action,
  lead,
  children,
}: Readonly<ActivitySectionProps>) {
  return (
    <section className="activity-section">
      <div className="activity-section__header">
        <h2>{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="activity-section__count">{count}</span>
        )}
        {action && <div className="activity-section__action">{action}</div>}
      </div>
      {lead}
      {Children.count(children) > 0 && (
        <ul className="activity-section__list">{children}</ul>
      )}
    </section>
  );
}
