// Settings state shared by the Battles page and the Stash Tools panel:
// loading, saving (with rating sync to Stash) and error toasts.

import { LOG, backend, syncRatings } from "./api.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

export function useBattlesSettings({ onChanged } = {}) {
  const toast = PluginApi.hooks.useToast();
  const [settings, setSettings] = React.useState(null);
  const syncEnabled = settings?.ui?.syncRatings !== false;

  const notifyError = React.useCallback((msg, e) => {
    console.warn(LOG, msg, e);
    toast.error(`${msg}: ${e?.message || e}`);
  }, [toast]);

  React.useEffect(() => {
    backend("get_settings").then(setSettings).catch((e) => notifyError("Could not load settings", e));
  }, []);

  const sync = React.useCallback(async (changed, force = false) => {
    if ((!syncEnabled && !force) || !changed?.length) return 0;
    try {
      return await syncRatings(changed);
    } catch (e) {
      notifyError("Rating sync to Stash failed", e);
      return 0;
    }
  }, [syncEnabled, notifyError]);

  // `next` may be partial; sections are merged by the backend. `silent`
  // skips the toast when the caller reports the change itself.
  const saveSettings = React.useCallback(async (next, { silent = false } = {}) => {
    try {
      const out = await backend("save_settings", { settings: next });
      setSettings(out.settings);
      const willSync = out.settings.ui?.syncRatings !== false;
      const n = willSync ? await sync(out.changed, true) : 0;
      if (!silent || n) toast.success(n ? `Settings saved, ${n} Stash ratings updated` : "Settings saved");
      if (out.changed.length) onChanged?.();
      return out;
    } catch (e) {
      notifyError("Could not save settings", e);
      return null;
    }
  }, [sync, toast, notifyError, onChanged]);

  const toggleSync = React.useCallback(
    () => saveSettings({ ui: { syncRatings: !syncEnabled } }),
    [saveSettings, syncEnabled]
  );

  return { settings, syncEnabled, saveSettings, toggleSync, sync, notifyError };
}
