import cn from "classnames";
import "./hover-preview-images.scss";

/**
 * Screenshots stacked over a cover while the pointer rests on a game. The
 * parent is positioned and clips; the images fill it and crop to its shape.
 * All stay mounted so the swap never shows the cover between two of them.
 */
export function HoverPreviewImages({
  urls,
  activeUrl,
}: Readonly<{
  urls: string[];
  activeUrl: string | null;
}>) {
  return (
    <>
      {urls.map((url) => (
        <img
          key={url}
          className={cn(
            "hover-preview-images__image",
            url === activeUrl && "hover-preview-images__image--active"
          )}
          src={url}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ))}
    </>
  );
}
