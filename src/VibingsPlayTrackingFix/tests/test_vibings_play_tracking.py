"""Backend tests. Run: python3 -m unittest discover -s tests"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend", "vibings_play_tracking.py")


def load_backend(data_dir):
    os.environ["VIBINGS_PLAY_TRACKING_DATA_DIR"] = data_dir
    spec = importlib.util.spec_from_file_location("vpt_backend", BACKEND)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class BackendTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.b = load_backend(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def op(self, operation, **args):
        out = self.b.handle({"args": {"operation": operation, **args}})
        if "error" in out:
            raise AssertionError(out["error"])
        return out["output"]

    def err(self, operation, **args):
        out = self.b.handle({"args": {"operation": operation, **args}})
        self.assertIn("error", out)
        return out["error"]

    def stored(self):
        with open(self.b.DATA_FILE, encoding="utf-8") as f:
            return json.load(f)

    def test_ping_creates_file_with_fixed_start(self):
        first = self.op("ping")
        self.assertTrue(os.path.exists(self.b.DATA_FILE))
        self.assertEqual(self.op("ping")["installedAt"], first["installedAt"])
        self.assertIsNone(first["mode"])

    def test_record_adds_up(self):
        self.op("record", scenes={"5": {"s": 10.5, "p": 0}})
        self.op("record", scenes={"5": {"s": 4.25, "p": 1}, "6": {"s": 0, "p": 0}})
        data = self.stored()
        self.assertEqual(data["scenes"], {"5": {"s": 14.75, "p": 1}})
        self.assertEqual(self.op("ping")["counts"]["plays"], 1)

    def test_record_rejects_bad_values(self):
        self.op("record", scenes={"5": {"s": -3, "p": "x"}, "7": {"s": 1e12}})
        self.assertEqual(self.stored()["scenes"], {})
        self.assertIn("numeric", self.err("record", scenes={"abc": {"s": 1}}))

    def test_settings_merge_and_validate(self):
        s = self.op("save_settings", settings={"minPercent": 40, "estimate": {"rounding": "down"}})
        self.assertEqual(s["minPercent"], 40)
        self.assertEqual(s["estimate"], {"rounding": "down", "skipWithoutTime": True})
        s = self.op("save_settings", settings={"minPercent": 500, "estimate": {"rounding": "sideways"}})
        self.assertEqual(s["minPercent"], 40)  # invalid: the current value stays
        self.assertEqual(s["estimate"]["rounding"], "down")

    def test_hybrid_estimates(self):
        out = self.op("set_estimates", estimates={"1": 3, "2": 0, "3": 2.0})
        self.assertEqual(out["mode"], "hybrid")
        self.assertEqual(self.stored()["estimates"], {"1": 3, "3": 2})
        self.assertEqual(out["counts"]["estimatedPlays"], 5)
        out = self.op("clear_estimates")
        self.assertIsNone(out["mode"])

    def test_replace_keeps_first_original_and_blocks_hybrid(self):
        self.op("set_estimates", estimates={"1": 3})
        out = self.op("save_originals", scenes={"1": ["2025-01-01T10:00:00Z", "2024-01-01T10:00:00Z"]})
        self.assertEqual(out["mode"], "replace")
        self.assertEqual(self.stored()["estimates"], {})  # replace clears hybrid
        self.op("save_originals", scenes={"1": ["2026-01-01T00:00:00Z"]})
        self.assertEqual(self.op("get_originals", ids=[1])["1"]["history"], ["2025-01-01T10:00:00Z", "2024-01-01T10:00:00Z"])
        self.assertEqual(self.op("get_all")["originals"], {"1": 2})
        self.assertIn("undo", self.err("set_estimates", estimates={"1": 1}))
        self.assertIn("undo", self.err("set_installed_at", at="2026-01-01T00:00:00Z"))
        self.assertIn("undo", self.err("reset", confirm=True))
        out = self.op("drop_originals", ids=["1"])
        self.assertIsNone(out["mode"])
        self.assertIsNone(self.stored()["estimate"])

    def test_set_installed_at(self):
        out = self.op("set_installed_at", at="2026-10-27T20:00:00.500+02:00")
        self.assertEqual(out["installedAt"], "2026-10-27T18:00:00Z")
        self.assertIn("timestamp", self.err("set_installed_at", at="soon"))

    def test_compact_drops_deleted_and_empty(self):
        self.op("record", scenes={"1": {"s": 5}, "2": {"s": 6}})
        self.op("set_estimates", estimates={"2": 4, "3": 1})
        data = self.stored()
        data["scenes"]["9"] = {"s": 0, "p": 0}
        self.b.save_data(data, auto_backup=False)
        self.op("backup_now")
        self.op("backup_now")
        out = self.op("compact", existing={"1": True, "2": False, "3": True, "9": True}, keepBackups=1)
        data = self.stored()
        self.assertEqual(sorted(data["scenes"]), ["1"])
        self.assertEqual(data["estimates"], {"3": 1})
        self.assertEqual(out["removedRows"], 3)
        self.assertEqual(len(self.b.list_backups()), 1)
        self.assertEqual(self.b.list_backups()[0]["name"], out["backup"])

    def test_backups_and_restore(self):
        self.op("record", scenes={"1": {"s": 5}})
        name = self.op("backup_now")["backup"]
        self.op("record", scenes={"1": {"s": 5}})
        out = self.op("restore_backup", name=name)
        self.assertEqual(self.stored()["scenes"]["1"]["s"], 5)
        self.assertTrue(out["backup"].startswith(os.path.basename(self.b.DATA_FILE) + ".restore-"))
        self.assertIn("no such backup", self.err("restore_backup", name="../../etc/passwd"))

    def test_corrupt_file_moved_aside(self):
        with open(self.b.DATA_FILE, "w") as f:
            f.write("{not json")
        self.assertEqual(self.op("get_all")["counts"]["scenes"], 0)
        self.assertEqual(self.op("ping")["corruptBackups"], 1)

    def test_reset(self):
        self.op("record", scenes={"1": {"s": 5, "p": 1}})
        self.op("set_estimates", estimates={"1": 2})
        self.assertIn("confirm", self.err("reset"))
        out = self.op("reset", confirm=True)
        self.assertEqual(out["counts"]["scenes"], 0)
        self.assertIsNone(out["mode"])

    def test_get_scene(self):
        self.op("record", scenes={"4": {"s": 7, "p": 1}})
        self.op("set_estimates", estimates={"4": 6})
        out = self.op("get_scene", sceneId="4")
        self.assertEqual((out["tracked"], out["estimate"], out["mode"], out["originalPlays"]), ({"s": 7, "p": 1}, 6, "hybrid", None))
        self.assertEqual(self.op("get_scene", sceneId=5)["tracked"], {"s": 0, "p": 0})

    def test_unknown_operation(self):
        self.assertIn("unknown operation", self.b.handle({"args": {"operation": "nope"}})["error"])


if __name__ == "__main__":
    unittest.main()
