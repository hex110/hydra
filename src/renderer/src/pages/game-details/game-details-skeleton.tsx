import {
  SidebarRow,
  SidebarRows,
  SidebarSection,
} from "@renderer/components/sidebar-section/sidebar-section";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

export function GameDetailsSkeleton() {
  return (
    <div className="game-details__wrapper game-details__skeleton">
      <section className="game-details__container">
        <div className="game-details__hero">
          <Skeleton
            height={350}
            style={{
              borderRadius: "0px 0px 8px 8px",
              position: "absolute",
              width: "100%",
              zIndex: 0,
            }}
          />

          <div className="game-details__hero-logo-backdrop">
            <div className="game-details__hero-content">
              <div className="game-details__game-logo" />
              <div className="game-details__hero-buttons game-details__hero-buttons--right" />
            </div>

            <div className="game-details__hero-panel">
              <div className="hero-panel__container">
                <div className="hero-panel">
                  <div className="hero-panel__content">
                    <Skeleton height={16} width={150} />
                    <Skeleton height={16} width={120} />
                  </div>
                  <div className="hero-panel__actions" style={{ gap: "16px" }}>
                    <Skeleton
                      height={36}
                      width={36}
                      style={{ borderRadius: "6px" }}
                    />
                    <Skeleton
                      height={36}
                      width={36}
                      style={{ borderRadius: "6px" }}
                    />
                    <Skeleton
                      height={36}
                      width={100}
                      style={{ borderRadius: "6px" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="game-details__description-container">
          <div className="game-details__description-content">
            <div className="description-header">
              <section className="description-header__info">
                <Skeleton height={16} width={200} />
                <Skeleton height={16} width={150} />
              </section>
            </div>

            <div className="gallery-slider__container">
              <div
                className="gallery-slider__viewport"
                style={{ height: "250px" }}
              >
                <Skeleton
                  height="100%"
                  width="100%"
                  className="gallery-slider__media"
                />
              </div>
            </div>

            <div className="game-details__description">
              <Skeleton count={8} height={22} style={{ marginBottom: "8px" }} />
              <Skeleton height={22} width="60%" />
            </div>
          </div>

          <aside className="content-sidebar">
            <SidebarSection variant="flat" title="">
              <SidebarRows>
                {[80, 70, 60].map((width) => (
                  <SidebarRow
                    key={width}
                    label={<Skeleton height={14} width={width} />}
                  >
                    <Skeleton height={14} width={40} />
                  </SidebarRow>
                ))}
              </SidebarRows>
            </SidebarSection>

            <SidebarSection variant="flat" title="">
              <ul className="list">
                {Array.from({ length: 4 }).map((_, index) => (
                  <li key={index}>
                    <div
                      className="list__item"
                      style={{ pointerEvents: "none" }}
                    >
                      <Skeleton
                        height={32}
                        width={32}
                        style={{ borderRadius: "4px" }}
                      />
                      <div>
                        <Skeleton height={14} width={120} />
                        <Skeleton height={12} width={80} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          </aside>
        </div>
      </section>
    </div>
  );
}
