"""Backend tests. Run: python3 -m unittest discover -s tests"""
import importlib.util
import json
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend", "vibings_scene_heatmap.py")


def load_backend(data_dir):
    os.environ["VIBINGS_SCENE_HEATMAP_DATA_DIR"] = data_dir
    spec = importlib.util.spec_from_file_location("vsh_backend", BACKEND)
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

    def test_segment_spreads_over_bins(self):
        bins = [0.0] * 10
        self.assertAlmostEqual(self.b.add_segment(bins, 100, 5, 25), 20)
        self.assertEqual(bins[:4], [5.0, 10.0, 5.0, 0.0])
        self.assertAlmostEqual(self.b.add_segment(bins, 100, 95, 130), 5)  # clipped at the end
        self.assertEqual(self.b.add_segment(bins, 100, 30, 30), 0)

    def test_record_and_get(self):
        out = self.op("record", scenes={"7": {"d": 200, "segments": [[0, 10], [10, 20], [100, 101]]}})
        self.assertAlmostEqual(out["added"], 21)
        scene = self.op("get_scene", sceneId=7)
        self.assertEqual(len(scene["bins"]), self.b.BINS)
        self.assertAlmostEqual(sum(scene["bins"]), 21, places=2)
        self.assertAlmostEqual(scene["w"], 21)
        self.assertIsNone(self.op("get_scene", sceneId=8)["bins"])
        self.op("record", scenes={"7": {"d": 200, "segments": [[0, 10]]}})
        self.assertAlmostEqual(self.op("get_scene", sceneId=7)["bins"][0], 2)  # 1 s per bin, watched twice
        self.assertEqual(list(self.op("get_scenes", ids=["7", "8"])), ["7"])

    def test_record_ignores_bad_input(self):
        self.op("record", scenes={"7": {"d": 0, "segments": [[0, 10]]}, "8": {"d": 100, "segments": [[5], ["a", 3], [-1, 4], [9, 2]]}})
        self.assertAlmostEqual(self.stored()["scenes"].get("8", {}).get("w", 0), 0)
        self.assertIn("numeric", self.err("record", scenes={"x": {"d": 1}}))

    def test_rescale(self):
        self.assertEqual(self.b.rescale([1, 1, 1, 1], 2), [2, 2])
        self.assertEqual(sum(self.b.rescale([1, 2, 3], 7)), 6)

    def test_settings(self):
        s = self.op("save_settings", settings={"show": "always", "height": 500, "smoothing": 2})
        self.assertEqual((s["show"], s["height"], s["smoothing"]), ("always", 36, 2))
        s = self.op("save_settings", settings={"show": "sometimes", "backup": {"keep": 3}})
        self.assertEqual((s["show"], s["backup"]["keep"], s["backup"]["auto"]), ("always", 3, True))

    def test_export_import(self):
        self.op("record", scenes={"7": {"d": 100, "segments": [[0, 50]]}})
        exported = self.op("export")
        out = self.op("import", data=exported, mode="merge")
        self.assertEqual(out["scenes"], 1)
        self.assertAlmostEqual(self.op("get_scene", sceneId=7)["w"], 100)
        self.op("import", data=exported, mode="replace")
        self.assertAlmostEqual(self.op("get_scene", sceneId=7)["w"], 50)
        self.assertIn("unrecognised", self.err("import", data={"scenes": {}}))

    def test_compact_backups_reset(self):
        self.op("record", scenes={"1": {"d": 100, "segments": [[0, 5]]}, "2": {"d": 100, "segments": [[0, 5]]}})
        self.op("backup_now")
        out = self.op("compact", existing={"1": True, "2": False}, keepBackups=1)
        self.assertEqual(out["removedRows"], 1)
        self.assertEqual(sorted(self.stored()["scenes"]), ["1"])
        self.assertEqual(len(self.b.list_backups()), 1)
        self.assertIn("confirm", self.err("reset"))
        self.assertEqual(self.op("reset", confirm=True)["counts"]["scenes"], 0)

    def test_corrupt_file_moved_aside(self):
        with open(self.b.DATA_FILE, "w") as f:
            f.write("{nope")
        self.assertEqual(self.op("ping")["corruptBackups"], 1)


if __name__ == "__main__":
    unittest.main()
