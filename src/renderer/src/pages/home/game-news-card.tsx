import { useState } from "react";
import type { GameNewsItem } from "@shared";
import { useDate } from "@renderer/hooks";
import "./game-news-card.scss";

interface GameNewsCardProps {
  item: GameNewsItem;
  gameTitle?: string;
  /** Shown when the post has no picture. */
  fallbackImageUrl?: string | null;
}

/** One Steam announcement; opens the post in the browser. */
export function GameNewsCard({
  item,
  gameTitle,
  fallbackImageUrl,
}: Readonly<GameNewsCardProps>) {
  const { formatDistance } = useDate();
  const [imageFailed, setImageFailed] = useState(false);
  const image = imageFailed
    ? fallbackImageUrl
    : (item.imageUrl ?? fallbackImageUrl);

  return (
    <button
      type="button"
      className="game-news-card"
      onClick={() => void window.electron.openExternal(item.url)}
      title={item.title}
    >
      <div className="game-news-card__media">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : null}
      </div>
      <div className="game-news-card__body">
        <span className="game-news-card__meta">
          {gameTitle ? `${gameTitle} · ` : ""}
          {formatDistance(item.date, new Date(), { addSuffix: true })}
        </span>
        <span className="game-news-card__title">{item.title}</span>
        {item.snippet && (
          <span className="game-news-card__snippet">{item.snippet}</span>
        )}
      </div>
    </button>
  );
}
