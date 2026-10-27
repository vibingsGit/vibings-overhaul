// Vibings Better Scenes — UI entry.
//
// Stash's scene page is two patchable components, ScenePage (title, toolbar
// and tabs) and ScenePlayer. This plugin renders its own side panel and
// player in their place, with the same props, so Stash's routing, queue,
// autoplay and continue playlist keep working and Stash's own player never
// loads. Stash's original scene page stays available in the side panel's
// Stash tab. Turning the plugin's page off in its settings restores Stash's.

import { LOG, VERSION } from "./api.js";
import { getSettings, loadSettings, useSettings } from "./settings.js";
import { injectStyles } from "./styles.js";
import { Player, SHORTCUTS } from "./Player.jsx";
import { SidePanel, ShortcutsHelp } from "./SidePanel.jsx";
import { ToolsPanel } from "./ToolsPanel.jsx";
import { useStore } from "./store.js";
import { registerToolsPanel } from "../../_shared/overhaul-tools.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(LOG, error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    // Fall back to Stash's own component so the scene stays usable.
    return this.props.fallback;
  }
}

function PagePart({ props, Original }) {
  const settings = useSettings();
  const theater = useStore((s) => s.theater ?? settings.layout.theater);
  React.useEffect(() => {
    if (!settings.enabled) return undefined;
    const html = document.documentElement;
    document.body.classList.toggle("vbs-theater", !!theater);
    document.body.classList.toggle("vbs-fit", !theater);
    // Where the page content starts, so the default view can fit the window.
    const measure = () => {
      const row = document.querySelector(".vbs-side")?.parentElement;
      if (row) html.style.setProperty("--vbs-top", Math.max(0, row.getBoundingClientRect().top + window.scrollY) + "px");
    };
    measure();
    const t = setTimeout(measure, 300);
    window.addEventListener("resize", measure);
    if (!theater) window.scrollTo(0, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      document.body.classList.remove("vbs-theater");
      document.body.classList.remove("vbs-fit");
    };
  }, [theater, settings.enabled]);
  if (!settings.enabled) return <Original {...props} />;
  return (
    <Boundary fallback={<Original {...props} />}>
      <SidePanel props={props} Original={Original} />
      <ShortcutsHelp shortcuts={SHORTCUTS} />
    </Boundary>
  );
}

function PlayerPart({ props, Original }) {
  const settings = useSettings();
  if (!settings.enabled) return <Original {...props} />;
  return (
    <Boundary fallback={<Original {...props} />}>
      <Player {...props} />
    </Boundary>
  );
}

export default function main() {
  injectStyles();
  loadSettings();

  PluginApi.patch.instead("ScenePage", (props, ...rest) => {
    const Original = rest[rest.length - 1];
    return <PagePart props={props} Original={Original} />;
  });
  PluginApi.patch.instead("ScenePlayer", (props, ...rest) => {
    const Original = rest[rest.length - 1];
    return <PlayerPart props={props} Original={Original} />;
  });

  registerToolsPanel({
    id: "vibings-better-scenes",
    title: "Vibings Better Scenes",
    version: VERSION,
    description: "Scene page with its own player, timeline previews, queue and the other Vibings plugins built in.",
    order: 20,
    Component: ToolsPanel,
  });

  console.info(LOG, `v${VERSION} loaded` + (getSettings().enabled ? "" : " (page off)"));
}
