import { type CSSProperties, createContext, type ReactNode, useContext, useState } from "react";
import { themeTokens } from "./tokens";

const PortalRoot = createContext<HTMLElement | null>(null);

/** Where overlays portal so the theme's custom properties reach them; null before mount. */
export function usePortalRoot(): HTMLElement | null {
  return useContext(PortalRoot);
}

export type AppThemeProps = {
  /** Off keeps the same wrapper with no overrides, so layout and behavior never depend on the theme. */
  enabled?: boolean;
  children: ReactNode;
};

export function AppTheme({ enabled = true, children }: AppThemeProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setRoot}
      data-app-theme={enabled ? "" : undefined}
      style={enabled ? (themeTokens as CSSProperties) : undefined}
    >
      <PortalRoot value={root}>{children}</PortalRoot>
    </div>
  );
}
