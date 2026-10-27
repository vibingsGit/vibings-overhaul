// Vibings Better Os — UI entry.
//
// Works with Stash's own pages: every O added anywhere in Stash (scene O
// button, History tab, image page, lightbox) is seen through Stash's GraphQL
// client and gets its detail stored on the server. Scene pages get an "Os"
// tab and O markers on the video timeline.

import { LOG, VERSION } from "./api.js";
import { loadSettings } from "./settings.js";
import { injectStyles } from "./styles.js";
import { installTracker } from "./tracker.js";
import { startImageSessions } from "./player.js";
import { startPlayerDecor } from "./decor.js";
import { OsPanel, OsTabTitle, TAB_KEY } from "./OsPanel.jsx";
import { ToolsPanel } from "./ToolsPanel.jsx";
import { registerToolsPanel } from "../../_shared/overhaul-tools.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Nav, Tab } = PluginApi.libraries.Bootstrap;

// Stash creates its GraphQL client before plugins load; retry briefly in case it is not ready.
function waitForClient(tries = 0) {
  if (installTracker() || tries > 20) return;
  setTimeout(() => waitForClient(tries + 1), 250);
}

export default function main() {
  injectStyles();
  loadSettings();
  startImageSessions();
  startPlayerDecor();
  waitForClient();

  PluginApi.patch.before("ScenePage.Tabs", (props) => [{
    ...props,
    children: (
      <>
        {props.children}
        <Nav.Item>
          <Nav.Link eventKey={TAB_KEY}><OsTabTitle scene={props.scene} /></Nav.Link>
        </Nav.Item>
      </>
    ),
  }]);

  PluginApi.patch.before("ScenePage.TabContent", (props) => [{
    ...props,
    children: (
      <>
        {props.children}
        <Tab.Pane eventKey={TAB_KEY}>
          <OsPanel scene={props.scene} />
        </Tab.Pane>
      </>
    ),
  }]);

  registerToolsPanel({
    id: "vibings-better-os",
    title: "Vibings Better Os",
    version: VERSION,
    description: "Video positions and image viewing times for your Os.",
    order: 30,
    Component: ToolsPanel,
  });

  console.info(LOG, `v${VERSION} loaded`);
}
