// The Vibings Overhaul plugin set, for status checks and cross-plugin
// statistics. `planned` plugins are not released yet; they are listed so a
// status view can show them once they appear.

export const OVERHAUL_PLUGINS = [
  { id: "VibingsBattles", name: "Vibings Battles", route: "/vibings-battles" },
  { id: "VibingsStats", name: "Vibings Stats", route: "/vibings-stats" },
  { id: "VibingsBetterOs", name: "Vibings Better Os", route: "/vibings-stats?view=os" },
  { id: "VibingsPlayTrackingFix", name: "Vibings Play Tracking Fix", route: "/settings?tab=tools" },
  { id: "VibingsSceneHeatmap", name: "Vibings Scene Heatmap", route: "/settings?tab=tools" },
  { id: "VibingsHomepage", name: "Vibings Homepage", planned: true },
  { id: "VibingsBetterScenes", name: "Vibings Better Scenes", planned: true },
  { id: "VibingsBetterPerformers", name: "Vibings Better Performers", planned: true },
];

/**
 * Installed state of every Vibings plugin from Stash's `plugins` query:
 * [{ ...plugin, installed, enabled, version }].
 */
export async function overhaulPluginStates(graphql) {
  const data = await graphql(`query VibingsOverhaulPlugins { plugins { id version enabled } }`);
  const byId = new Map(data.plugins.map((p) => [p.id, p]));
  return OVERHAUL_PLUGINS.map((p) => {
    const found = byId.get(p.id);
    return { ...p, installed: !!found, enabled: !!found?.enabled, version: found?.version || null };
  });
}
