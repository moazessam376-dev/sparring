/*
 * The window's own furniture, and the one fact every screen needs about it:
 * whether the system draws the controls or the interface has to.
 *
 * On macOS the window keeps its decorations and uses an overlay title bar, so
 * the real traffic lights sit on the left over the glass. The interface draws
 * nothing there; it only leaves room. On Windows and Linux the window stays
 * frameless and the interface draws minimise, maximise and close on the right,
 * which is their convention.
 */

import { createContext, useContext } from "react";
import type { WindowChrome } from "./api";
import { CloseIcon, MaximiseIcon, MinimiseIcon } from "./Icons";

/** Outside the desktop shell there is no window to control, so nothing is drawn. */
export const NO_CHROME: WindowChrome = {
  platform: "web",
  overlayTitleBar: false,
  drawsOwnControls: false,
};

export const ChromeContext = createContext<WindowChrome>(NO_CHROME);

export function useChrome(): WindowChrome {
  return useContext(ChromeContext);
}

/**
 * The strip the traffic lights sit in. It is part of the rail's glass and it is
 * a drag region, so the window moves when the user drags beside its own
 * controls, exactly as a Mac window does.
 */
export function TrafficLightGap() {
  const chrome = useChrome();
  if (!chrome.overlayTitleBar) return null;
  return <div className="traffic-lights" data-tauri-drag-region="deep" aria-hidden="true" />;
}

export function WindowButtons() {
  const chrome = useChrome();
  if (!chrome.drawsOwnControls) return null;

  const act = (action: "minimise" | "maximise" | "close") => {
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const current = getCurrentWindow();
      if (action === "minimise") await current.minimize();
      else if (action === "maximise") await current.toggleMaximize();
      else await current.close();
    })();
  };

  return (
    <div className="window-buttons" style={{ marginLeft: 10 }}>
      <button type="button" aria-label="Minimise" onClick={() => act("minimise")}>
        <MinimiseIcon size={11} stroke="currentColor" />
      </button>
      <button type="button" aria-label="Maximise" onClick={() => act("maximise")}>
        <MaximiseIcon size={10} stroke="currentColor" />
      </button>
      <button type="button" className="close" aria-label="Close" onClick={() => act("close")}>
        <CloseIcon size={11} stroke="currentColor" />
      </button>
    </div>
  );
}
