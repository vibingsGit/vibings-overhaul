// The curve of the most watched parts, drawn over a timeline. Used on
// Stash's own player (decor.js) and by Vibings Better Scenes.

import { curveValues, curvePath } from "./heat.js";
import { useHeat } from "./store.js";
import { useSettings } from "./settings.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

export function Curve({ sceneId, height, className = "" }) {
  const heat = useHeat(sceneId);
  const settings = useSettings();
  const values = React.useMemo(() => curveValues(heat.bins || [], settings.smoothing), [heat.bins, settings.smoothing]);
  if (!heat.bins || !values.some((v) => v > 0)) return null;
  const h = height ?? settings.height;
  const path = curvePath(values, 1000, 100);
  return (
    <div className={"vsh-curve " + (settings.show === "always" ? "vsh-always " : "") + className} style={{ height: h }} aria-hidden="true">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id="vsh-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--vibings-scene-heatmap-colour)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--vibings-scene-heatmap-colour)" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <path d={path} fill="url(#vsh-fill)" />
      </svg>
    </div>
  );
}
