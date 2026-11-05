import { ChevronDownIcon, LinkExternalIcon } from "@primer/octicons-react";
import { useEffect, useRef, useState } from "react";
import "./sidebar-section.scss";

export interface SidebarSectionProps {
  title: string;
  subtitle?: string;
  subtitleHref?: string;
  /**
   * `card` (default) is a collapsible panel, as in the catalogue's filters.
   * `flat` is a frameless block under a small label and a hairline, for
   * columns that should read as one piece (the game page).
   */
  variant?: "card" | "flat";
  /** Card only: starts folded away when false; open by default. */
  defaultOpen?: boolean;
  /** Flat only: something small on the label's right, such as a link. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function SidebarSection(props: SidebarSectionProps) {
  return props.variant === "flat" ? (
    <FlatSidebarSection {...props} />
  ) : (
    <CardSidebarSection {...props} />
  );
}

function FlatSidebarSection({
  title,
  subtitle,
  subtitleHref,
  action,
  children,
}: SidebarSectionProps) {
  return (
    <section className="flat-sidebar-section">
      <header className="flat-sidebar-section__header">
        <h3 className="flat-sidebar-section__title">{title}</h3>

        {subtitle && subtitleHref && (
          <a
            href={subtitleHref}
            className="flat-sidebar-section__link"
            target="_blank"
            rel="noreferrer"
          >
            {subtitle}
            <LinkExternalIcon size={12} />
          </a>
        )}

        {action}
      </header>

      {children}
    </section>
  );
}

function CardSidebarSection({
  title,
  subtitle,
  subtitleHref,
  defaultOpen = true,
  children,
}: SidebarSectionProps) {
  const inner = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [contentHeight, setContentHeight] = useState(0);

  // Follows the content as it reflows (window resize, wrapping text, async data).
  useEffect(() => {
    const element = inner.current;
    if (!element) return;

    const measure = () => setContentHeight(element.scrollHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sidebar-section">
      <div className="sidebar-section__header">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="sidebar-section__toggle"
          aria-expanded={isOpen}
          aria-label={title}
        />

        <span className="sidebar-section__button">
          <ChevronDownIcon
            className={`sidebar-section__chevron ${
              isOpen ? "sidebar-section__chevron--open" : ""
            }`}
          />
          <span>{title}</span>
        </span>

        {subtitle && subtitleHref && (
          <a
            href={subtitleHref}
            className="sidebar-section__subtitle"
            target="_blank"
            rel="noreferrer"
          >
            {subtitle}
            <LinkExternalIcon size={12} />
          </a>
        )}
      </div>

      <div
        className="sidebar-section__content"
        style={{ maxHeight: `${isOpen ? contentHeight : 0}px` }}
      >
        <div ref={inner}>{children}</div>
      </div>
    </div>
  );
}

/** A label and its value on one line; wrap rows in SidebarRows. */
export function SidebarRow({
  label,
  icon,
  title,
  children,
}: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sidebar-row" title={title}>
      <dt className="sidebar-row__label">
        {icon}
        {label}
      </dt>
      <dd className="sidebar-row__value">{children}</dd>
    </div>
  );
}

export function SidebarRows({ children }: { children: React.ReactNode }) {
  return <dl className="sidebar-rows">{children}</dl>;
}
