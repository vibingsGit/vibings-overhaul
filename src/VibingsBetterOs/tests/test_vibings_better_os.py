"""
Unit tests for the Vibings Better Os backend.

Run from src/VibingsBetterOs:
    python3 -m unittest discover -s tests -v
"""
import importlib
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend", "vibings_better_os.py")


class BackendTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["VIBINGS_BETTER_OS_DATA_DIR"] = self.tmp.name
        sys.path.insert(0, os.path.dirname(BACKEND))
        import vibings_better_os
        self.vb = importlib.reload(vibings_better_os)

    def tearDown(self):
        sys.path.remove(os.path.dirname(BACKEND))
        os.environ.pop("VIBINGS_BETTER_OS_DATA_DIR", None)
        self.tmp.cleanup()

    def call(self, operation, **args):
        res = self.vb.handle({"args": {"operation": operation, **args}})
        self.assertNotIn("error", res, res.get("error"))
        return res["output"]

    def call_err(self, operation, **args):
        res = self.vb.handle({"args": {"operation": operation, **args}})
        self.assertIn("error", res)
        return res["error"]

    def backups(self, tag=None):
        return [b for b in self.vb.list_backups() if tag is None or b["tag"] == tag]


class TestTimestamps(BackendTestCase):
    def test_normalises_to_stash_format(self):
        n = self.vb.norm_ts
        self.assertEqual(n("2026-10-24T10:10:10Z"), "2026-10-24T10:10:10Z")
        self.assertEqual(n("2026-10-19T10:36:08.681495+00:00"), "2026-10-19T10:36:08Z")
        self.assertEqual(n("2026-10-24T13:10:10+03:00"), "2026-10-24T10:10:10Z")
        self.assertEqual(n("2026-10-24T10:10:10.999Z"), "2026-10-24T10:10:10Z")
        self.assertEqual(n("2026-10-24T10:10:10"), "2026-10-24T10:10:10Z")

    def test_rejects_garbage(self):
        self.assertIn("timestamp", self.call_err("record_scene", sceneId="1", at="yesterday"))
        self.assertIn("numeric id", self.call_err("record_scene", sceneId="abc", at="2026-10-24T10:10:10Z"))


class TestScenes(BackendTestCase):
    def test_record_and_get(self):
        out = self.call("record_scene", sceneId="5", at="2026-10-24T10:10:10Z", t=123.456, d=600, src="player")
        self.assertEqual(out["events"], [{"at": "2026-10-24T10:10:10Z", "t": 123.46, "d": 600, "src": "player"}])
        self.assertEqual(self.call("get_scene", sceneId="5")["events"], out["events"])
        self.assertEqual(self.call("get_scene", sceneId="6")["events"], [])

    def test_same_o_is_replaced_not_duplicated(self):
        self.call("record_scene", sceneId="5", at="2026-10-24T10:10:10Z", t=10)
        out = self.call("record_scene", sceneId="5", at="2026-10-24T13:10:10+03:00", t=20, src="manual")
        self.assertEqual(len(out["events"]), 1)
        self.assertEqual(out["events"][0]["t"], 20)
        self.assertEqual(out["events"][0]["src"], "manual")

    def test_events_sorted_and_bad_positions_dropped(self):
        self.call("record_scene", sceneId="5", at="2026-10-24T10:10:10Z", t=-5)
        out = self.call("record_scene", sceneId="5", at="2026-10-20T10:10:10Z", t="x", src="nope")
        self.assertEqual([e["at"] for e in out["events"]], ["2026-10-20T10:10:10Z", "2026-10-24T10:10:10Z"])
        self.assertEqual([e["t"] for e in out["events"]], [None, None])
        self.assertEqual(out["events"][0]["src"], "stash")

    def test_clear_time_keeps_others(self):
        self.call("record_scene", sceneId="5", at="2026-10-24T10:10:10Z", t=10)
        self.call("record_scene", sceneId="5", at="2026-10-25T10:10:10Z", t=20)
        out = self.call("clear_scene_time", sceneId="5", at="2026-10-24T10:10:10Z")
        self.assertEqual([e["t"] for e in out["events"]], [20])
        self.call("clear_scene_time", sceneId="5", at="2026-10-25T10:10:10Z")
        self.assertNotIn("5", self.call("get_all")["scenes"])

    def test_sync_drops_removed_os(self):
        self.call("record_scene", sceneId="5", at="2026-10-24T10:10:10Z", t=10)
        self.call("record_scene", sceneId="5", at="2026-10-25T10:10:10Z", t=20)
        out = self.call("sync_scene", sceneId="5", history=["2026-10-25T10:10:10Z", "2026-01-01T00:00:00Z"])
        self.assertEqual(out["removed"], 1)
        self.assertEqual([e["t"] for e in out["events"]], [20])
        out = self.call("sync_scene", sceneId="5", history=[])
        self.assertEqual(out["events"], [])

    def test_sync_snaps_to_nearby_history_entry(self):
        self.call("record_scene", sceneId="5", at="2026-10-24T10:10:10Z", t=10)
        out = self.call("sync_scene", sceneId="5", history=["2026-10-24T10:10:11Z"])
        self.assertEqual(out["events"][0]["at"], "2026-10-24T10:10:11Z")
        self.assertEqual(out["removed"], 0)
        # Two stored Os can not claim the same history entry.
        self.call("record_scene", sceneId="6", at="2026-10-24T10:10:10Z", t=1)
        self.call("record_scene", sceneId="6", at="2026-10-24T10:10:12Z", t=2)
        out = self.call("sync_scene", sceneId="6", history=["2026-10-24T10:10:11Z"])
        self.assertEqual(len(out["events"]), 1)
        self.assertEqual(out["removed"], 1)

    def test_history_as_json_string(self):
        self.call("record_scene", sceneId="5", at="2026-10-24T10:10:10Z", t=10)
        out = self.call("sync_scene", sceneId="5", history=json.dumps(["2026-10-24T10:10:10Z"]))
        self.assertEqual(len(out["events"]), 1)


class TestImages(BackendTestCase):
    def test_record_and_trim(self):
        self.call("record_image", imageId="7", at="2026-10-24T10:00:00Z", view=12.5)
        self.call("record_image", imageId="7", at="2026-10-24T11:00:00Z", view=None)
        out = self.call("record_image", imageId="7", at="2026-10-24T12:00:00Z", view=30, oCounter=3)
        self.assertEqual([e["view"] for e in out["events"]], [12.5, None, 30])
        out = self.call("sync_image", imageId="7", oCounter=1)
        self.assertEqual(out["removed"], 2)
        self.assertEqual([e["view"] for e in out["events"]], [12.5])  # newest go first
        self.call("sync_image", imageId="7", oCounter=0)
        self.assertNotIn("7", self.call("get_all")["images"])
        self.assertIn("non-negative", self.call_err("sync_image", imageId="7", oCounter=-1))

    def test_decrement_forgets_newest(self):
        self.call("record_image", imageId="7", at="2026-10-24T10:00:00Z", view=1)
        self.call("record_image", imageId="7", at="2026-10-24T11:00:00Z", view=2)
        out = self.call("sync_image", imageId="7", oCounter=5, removeNewest=True)
        self.assertEqual(out["removed"], 1)
        self.assertEqual([e["view"] for e in out["events"]], [1])

    def test_record_trims_to_o_counter(self):
        self.call("record_image", imageId="7", at="2026-10-24T10:00:00Z", view=1)
        out = self.call("record_image", imageId="7", at="2026-10-24T11:00:00Z", view=2, oCounter=1)
        self.assertEqual([e["view"] for e in out["events"]], [1])


class TestSettings(BackendTestCase):
    def test_defaults_and_partial_merge(self):
        s = self.call("get_settings")
        self.assertTrue(s["player"]["markers"])
        s = self.call("save_settings", settings={"player": {"popup": False}, "backup": {"keep": 3}})
        self.assertFalse(s["player"]["popup"])
        self.assertTrue(s["player"]["markers"])
        self.assertEqual(s["backup"]["keep"], 3)
        self.assertEqual(s["backup"]["intervalHours"], 24)

    def test_invalid_values_fall_back(self):
        s = self.call("save_settings", settings={"recordPosition": "yes", "backup": {"keep": 0, "intervalHours": "x"}})
        self.assertTrue(s["recordPosition"])
        self.assertEqual(s["backup"]["keep"], 10)
        self.assertEqual(s["backup"]["intervalHours"], 24)


class TestBackups(BackendTestCase):
    def test_auto_backup_once_per_interval(self):
        self.call("record_scene", sceneId="1", at="2026-10-24T10:10:10Z", t=1)  # creates the file, nothing to back up
        self.assertEqual(self.backups("auto"), [])
        self.call("record_scene", sceneId="1", at="2026-10-25T10:10:10Z", t=2)
        self.assertEqual(len(self.backups("auto")), 1)
        self.call("record_scene", sceneId="1", at="2026-10-26T10:10:10Z", t=3)
        self.assertEqual(len(self.backups("auto")), 1)

    def test_auto_backups_are_pruned(self):
        self.call("save_settings", settings={"backup": {"keep": 2, "intervalHours": 1}})
        for i in range(5):
            for b in self.backups("auto"):  # pretend the last backup is old
                path = os.path.join(self.tmp.name, b["name"])
                os.utime(path, (b["mtime"] - 7200, b["mtime"] - 7200))
            self.call("record_scene", sceneId="1", at=f"2026-10-2{i}T10:10:10Z", t=i)
        self.assertEqual(len(self.backups("auto")), 2)

    def test_auto_backup_off(self):
        self.call("save_settings", settings={"backup": {"auto": False}})
        self.call("record_scene", sceneId="1", at="2026-10-24T10:10:10Z", t=1)
        self.assertEqual(self.backups("auto"), [])

    def test_manual_backup_restore_and_delete(self):
        self.call("record_scene", sceneId="1", at="2026-10-24T10:10:10Z", t=1)
        name = self.call("backup_now")["backup"]
        self.call("record_scene", sceneId="2", at="2026-10-24T10:10:10Z", t=2)
        out = self.call("restore_backup", name=name)
        self.assertEqual(out["counts"]["sceneOs"], 1)
        self.assertTrue(out["backup"].startswith("vibings-better-os-data.json.restore-"))
        with open(os.path.join(self.tmp.name, out["backup"])) as f:
            self.assertIn("2", json.load(f)["scenes"])
        self.call("delete_backup", name=name)
        self.assertNotIn(name, [b["name"] for b in self.backups()])

    def test_backup_names_are_checked(self):
        self.assertIn("no such backup", self.call_err("restore_backup", name="../../etc/passwd"))
        self.assertIn("no such backup", self.call_err("delete_backup", name="vibings-better-os-data.json"))

    def test_corrupt_file_is_moved_aside(self):
        with open(os.path.join(self.tmp.name, "vibings-better-os-data.json"), "w") as f:
            f.write("{broken")
        self.assertEqual(self.call("ping")["corruptBackups"], 1)


class TestImportExport(BackendTestCase):
    def test_round_trip(self):
        self.call("record_scene", sceneId="1", at="2026-10-24T10:10:10Z", t=1, d=100, src="player")
        self.call("record_image", imageId="9", at="2026-10-24T10:10:10Z", view=5)
        exported = self.call("export")
        self.assertEqual(exported["format"], "vibings-better-os")
        self.call("reset", confirm=True)
        out = self.call("import", data=exported, mode="merge")
        self.assertEqual(out["added"], 2)
        self.assertEqual(self.call("export")["scenes"], exported["scenes"])
        self.assertEqual(self.call("export")["images"], exported["images"])

    def test_merge_and_replace(self):
        self.call("record_scene", sceneId="1", at="2026-10-24T10:10:10Z", t=1)
        incoming = {"format": "vibings-better-os", "version": 1, "scenes": {
            "1": [{"at": "2026-10-24T10:10:10Z", "t": 5}], "2": [{"at": "2026-10-25T10:10:10Z", "t": 6}]}, "images": {}}
        out = self.call("import", data=json.dumps(incoming))
        self.assertEqual((out["added"], out["updated"]), (1, 1))
        self.assertEqual(self.call("get_scene", sceneId="1")["events"][0]["t"], 5)
        self.call("record_scene", sceneId="3", at="2026-10-24T10:10:10Z", t=1)
        self.call("import", data=incoming, mode="replace")
        self.assertEqual(sorted(self.call("get_all")["scenes"]), ["1", "2"])
        self.assertTrue(self.backups("import"))

    def test_older_timestamp_format(self):
        legacy = {"version": 2, "scenes": {
            "1167": [{"seconds": 640.547215, "createdAt": "2026-10-19T10:36:08.681495+00:00", "source": "custom"},
                     {"seconds": None, "createdAt": "2026-10-01T13:00:00+00:00", "source": "manual"}],
            "x": [{"seconds": 1, "createdAt": "2026-10-19T10:36:08Z"}]}}
        out = self.call("import", data=legacy)
        self.assertEqual(out["added"], 1)
        self.assertEqual(self.call("get_scene", sceneId="1167")["events"],
                         [{"at": "2026-10-19T10:36:08Z", "t": 640.55, "src": "import"}])

    def test_settings_only_with_flag(self):
        exported = self.call("export")
        exported["settings"]["player"]["markers"] = False
        self.call("import", data=exported)
        self.assertTrue(self.call("get_settings")["player"]["markers"])
        self.call("import", data=exported, withSettings=True)
        self.assertFalse(self.call("get_settings")["player"]["markers"])

    def test_rejects_unknown_files(self):
        self.assertIn("unrecognised", self.call_err("import", data={"hello": 1}))
        self.assertIn("mode", self.call_err("import", data={"version": 2, "scenes": {}}, mode="wipe"))


class TestCompact(BackendTestCase):
    def test_compact_against_stash_state(self):
        self.call("record_scene", sceneId="1", at="2026-10-24T10:10:10Z", t=1)
        self.call("record_scene", sceneId="1", at="2026-10-25T10:10:10Z", t=2)
        self.call("record_scene", sceneId="2", at="2026-10-24T10:10:10Z", t=3)
        self.call("record_scene", sceneId="3", at="2026-10-24T10:10:10Z", t=4)  # not in stash state: kept
        self.call("record_image", imageId="8", at="2026-10-24T10:10:10Z", view=1)
        self.call("record_image", imageId="8", at="2026-10-25T10:10:10Z", view=2)
        self.call("record_image", imageId="9", at="2026-10-25T10:10:10Z", view=2)
        out = self.call("compact", stash={
            "scenes": {"1": ["2026-10-25T10:10:10Z"], "2": None},
            "images": {"8": 1, "9": None},
        }, keepBackups=1)
        self.assertEqual(out["removedItems"], 2)
        self.assertEqual(out["removedOs"], 4)
        self.assertEqual(out["counts"]["sceneOs"], 2)
        self.assertEqual(out["counts"]["imageOs"], 1)
        self.assertEqual([b["name"] for b in self.backups()], [out["backup"]])


class TestProcess(BackendTestCase):
    def test_stdin_stdout_contract(self):
        env = {**os.environ, "VIBINGS_BETTER_OS_DATA_DIR": self.tmp.name}
        run = lambda payload: json.loads(subprocess.run(
            [sys.executable, BACKEND], input=json.dumps(payload), capture_output=True, text=True, env=env, check=True).stdout)
        self.assertEqual(run({"args": {"operation": "ping"}})["output"]["dataVersion"], 1)
        self.assertIn("unknown operation", run({"args": {"operation": "nope"}})["error"])


if __name__ == "__main__":
    unittest.main()
