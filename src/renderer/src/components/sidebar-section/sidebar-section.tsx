import { ChevronDownIcon, LinkExternalIcon } from "@primer/octicons-react";
import { useEffect, useRef, useState } from "react";
import "./sidebar-section.scss";

export interface SidebarSectionProps {
  title: string;
  subtitle?: string;
  subtitleHref?: string;
  children: React.ReactNode;
}

export function SidebarSection({
  title,
  subtitle,
  subtitleHref,
  children,
}: SidebarSectionProps) {
  const inner = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(true);
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
