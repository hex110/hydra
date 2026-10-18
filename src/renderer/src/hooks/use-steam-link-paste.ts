import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { parseSteamStoreLink } from "@shared";

const isTextField = (element: Element | null) =>
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLElement && element.isContentEditable);

/**
 * Pasting a Steam store link anywhere outside a text field, or into the
 * header search, opens the game with its download options.
 */
export function useSteamLinkPaste() {
  const navigate = useNavigate();

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as Element | null;
      const inSearch = target?.classList.contains("header__search-input");
      if (isTextField(target) && !inSearch) return;

      const appId = parseSteamStoreLink(
        event.clipboardData?.getData("text") ?? ""
      );
      if (!appId) return;

      event.preventDefault();
      navigate(`/game/steam/${appId}?download=1&source=paste`);
    };

    document.addEventListener("paste", handlePaste, true);
    return () => document.removeEventListener("paste", handlePaste, true);
  }, [navigate]);
}
