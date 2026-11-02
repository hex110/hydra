import { Badge } from "@renderer/components/badge/badge";
import "./source-badges.scss";

/** Download sources that have a game, on one line. */
export function SourceBadges({ sources }: Readonly<{ sources?: string[] }>) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="source-badges">
      {sources.map((name) => (
        <Badge key={name}>{name}</Badge>
      ))}
    </div>
  );
}
