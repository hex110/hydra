import type { ReactNode } from "react";

import "./activity-section.scss";

interface ActivitySectionProps {
  title: string;
  count?: number;
  /** Header action, e.g. Clear all. */
  action?: ReactNode;
  children: ReactNode;
}

export function ActivitySection({
  title,
  count,
  action,
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
      <ul className="activity-section__list">{children}</ul>
    </section>
  );
}
