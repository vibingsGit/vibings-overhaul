"""
Unit tests for the Vibings Battles backend.

Run from src/VibingsBattles:
    python3 -m unittest discover -s tests -v
"""
import importlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend", "vibings_battles.py")


class BackendTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["VIBINGS_BATTLES_DATA_DIR"] = self.tmp.name
        sys.path.insert(0, os.path.dirname(BACKEND))
        import vibings_battles
        self.vb = importlib.reload(vibings_battles)

    def tearDown(self):
        sys.path.remove(os.path.dirname(BACKEND))
        os.environ.pop("VIBINGS_BATTLES_DATA_DIR", None)
        self.tmp.cleanup()

    def call(self, operation, **args):
        res = self.vb.handle({"args": {"operation": operation, **args}})
        self.assertNotIn("error", res, res.get("error"))
        return res["output"]

    def call_err(self, operation, **args):
        res = self.vb.handle({"args": {"operation": operation, **args}})
        self.assertIn("error", res)
        return res["error"]

    def battle(self, a, b, result, category="scenes"):
        return self.call("record", category=category,
                         a={"id": a, "name": f"Item {a}"}, b={"id": b, "name": f"Item {b}"},
                         result=result)


class TestElo(BackendTestCase):
    def test_first_win_moves_ratings_symmetrically(self):
        out = self.battle("1", "2", "a")
        # Equal ratings, expected 0.5, provisional K 48 -> +/-24
        self.assertEqual(out["a"]["rating"], 1524.0)
        self.assertEqual(out["b"]["rating"], 1476.0)
        self.assertEqual(out["entry"]["delta"], [24.0, -24.0])

    def test_draw_between_equals_changes_nothing(self):
        out = self.battle("1", "2", "draw")
        self.assertEqual(out["a"]["rating"], 1500.0)
        self.assertEqual(out["a"]["draws"], 1)
        self.assertEqual(out["a"]["streak"], 0)

    def test_upset_win_gains_more_than_expected_win(self):
        for _ in range(5):
            self.battle("1", "2", "a")  # 1 becomes strong, 2 weak
        strong_beats_weak = self.battle("1", "2", "a")["entry"]["delta"][0]
        weak_beats_strong = self.battle("1", "2", "b")["entry"]["delta"][1]
        self.assertGreater(weak_beats_strong, strong_beats_weak)

    def test_provisional_k_switches_after_n_battles(self):
        self.call("save_settings", settings={"elo": {"provisionalBattles": 1}})
        self.battle("1", "2", "a")  # both provisional (K 48)
        out = self.battle("3", "1", "a")  # item 3 provisional, item 1 regular (K 32)
        da, db = out["entry"]["delta"]
        self.assertAlmostEqual(abs(da) / abs(db), 48 / 32, places=2)  # deltas are rounded

    def test_skip_does_not_change_rating_but_counts(self):
        out = self.battle("1", "2", "skip")
        self.assertEqual(out["a"]["rating"], 1500.0)
        self.assertEqual(out["a"]["battles"], 0)
        self.assertEqual(out["a"]["skips"], 1)
        self.assertEqual(out["changed"], [])

    def test_streaks(self):
        for _ in range(3):
            self.battle("1", "2", "a")
        item = self.call("get_item", category="scenes", id="1")
        loser = self.call("get_item", category="scenes", id="2")
        self.assertEqual((item["streak"], item["bestStreak"]), (3, 3))
        self.assertEqual((loser["streak"], loser["worstStreak"]), (-3, 3))
        self.battle("1", "2", "b")
        item = self.call("get_item", category="scenes", id="1")
        self.assertEqual((item["streak"], item["bestStreak"], item["worstStreak"]), (-1, 3, 1))


class TestRating100(BackendTestCase):
    def test_linear_mapping_and_changed_list(self):
        out = self.battle("1", "2", "a")
        # 50 + 24/8 = 53, 50 - 24/8 = 47
        self.assertEqual(out["a"]["rating100"], 53)
        self.assertEqual(out["b"]["rating100"], 47)
        self.assertEqual(out["changed"], [
            {"category": "scenes", "id": "1", "rating100": 53},
            {"category": "scenes", "id": "2", "rating100": 47},
        ])

    def test_linear_mapping_is_clamped(self):
        self.call("save_settings", settings={"ratingMap": {"scale": 1}})
        for _ in range(10):
            self.battle("1", "2", "a")
        items = {it["id"]: it for it in self.call("get_items", category="scenes")}
        self.assertEqual(items["1"]["rating100"], 100)
        self.assertEqual(items["2"]["rating100"], 1)

    def test_percentile_mapping(self):
        self.call("save_settings", settings={"ratingMap": {"mode": "percentile"}})
        self.battle("1", "2", "a")
        self.battle("2", "3", "a")
        items = {it["id"]: it["rating100"] for it in self.call("get_items", category="scenes")}
        self.assertEqual(sorted(items.values()), [1, 50, 100])
        self.assertEqual(items["1"], 100)

    def test_settings_change_reports_all_changed_ratings(self):
        self.battle("1", "2", "a")
        out = self.call("save_settings", settings={"ratingMap": {"scale": 4}})
        self.assertEqual({c["id"]: c["rating100"] for c in out["changed"]}, {"1": 56, "2": 44})


class TestUndoAndLog(BackendTestCase):
    def test_undo_restores_previous_state(self):
        self.battle("1", "2", "a")
        before = self.call("get_items", category="scenes")
        self.battle("1", "3", "b")
        out = self.call("undo")
        self.assertEqual(out["undone"]["b"], "3")
        self.assertEqual(self.call("get_items", category="scenes"), before)
        # item 3 had only the undone battle -> rating cleared, item 1 restored
        changed = {c["id"]: c["rating100"] for c in out["changed"]}
        self.assertEqual(changed, {"1": 53, "3": None})

    def test_undo_empty_log_is_an_error(self):
        self.assertIn("nothing to undo", self.call_err("undo"))

    def test_recent_log_newest_first_with_names(self):
        self.battle("1", "2", "a")
        self.battle("3", "4", "draw", category="images")
        log = self.call("recent_log", limit=10)
        self.assertEqual([e["seq"] for e in log], [2, 1])
        self.assertEqual(log[0]["aName"], "Item 3")
        self.assertEqual(len(self.call("recent_log", category="scenes")), 1)

    def test_seq_keeps_increasing_after_undo(self):
        self.battle("1", "2", "a")
        self.call("undo")
        self.assertEqual(self.battle("1", "2", "a")["entry"]["seq"], 2)


class TestSummaryAndReset(BackendTestCase):
    def test_summary_counts(self):
        self.battle("1", "2", "a")
        self.battle("1", "2", "draw")
        self.battle("1", "3", "skip")
        self.battle("5", "6", "b", category="performers")
        s = self.call("summary", tzOffset=-180)
        self.assertEqual(s["totals"]["battles"], 3)
        self.assertEqual(s["totals"]["draws"], 1)
        self.assertEqual(s["totals"]["skips"], 1)
        self.assertEqual(s["categories"]["scenes"], {"battles": 2, "draws": 1, "skips": 1, "items": 2})
        self.assertEqual(sum(d["battles"] for d in s["daily"].values()), 3)

    def test_local_day_uses_timezone_offset(self):
        # 22:30 UTC is already the next day in Finland (UTC+3 -> offset -180)
        self.assertEqual(self.vb.local_day("2026-10-26T22:30:00+00:00", -180), "2026-10-27")
        self.assertEqual(self.vb.local_day("2026-10-26T22:30:00+00:00", 0), "2026-10-26")

    def test_reset_category_keeps_others_and_backs_up(self):
        self.battle("1", "2", "a")
        self.battle("5", "6", "a", category="performers")
        out = self.call("reset", category="scenes")
        self.assertTrue(out["backup"])
        self.assertTrue(os.path.exists(os.path.join(self.tmp.name, out["backup"])))
        self.assertEqual(self.call("get_items", category="scenes"), [])
        self.assertEqual(len(self.call("get_items", category="performers")), 2)
        self.assertEqual({c["rating100"] for c in out["changed"]}, {None})

    def test_reset_all_keeps_settings(self):
        self.call("save_settings", settings={"elo": {"k": 20}, "ui": {"accent": "#fff"}})
        self.battle("1", "2", "a")
        self.call("reset")
        self.assertEqual(self.call("ping")["battles"], 0)
        settings = self.call("get_settings")
        self.assertEqual(settings["elo"]["k"], 20)
        self.assertEqual(settings["ui"], {"accent": "#fff"})


class TestValidationAndStorage(BackendTestCase):
    def test_invalid_input_is_reported(self):
        self.assertIn("unknown operation", self.call_err("nope"))
        self.assertIn("unknown category", self.call_err("get_items", category="cars"))
        self.assertIn("result must be", self.call_err(
            "record", category="scenes", a={"id": "1"}, b={"id": "2"}, result="win"))
        self.assertIn("itself", self.call_err(
            "record", category="scenes", a={"id": "1"}, b={"id": "1"}, result="a"))
        self.assertIn("must be an object", self.call_err(
            "record", category="scenes", a="[]", b={"id": "2"}, result="a"))

    def test_json_string_args_are_accepted(self):
        out = self.call("record", category="scenes", a=json.dumps({"id": 1}), b=json.dumps({"id": 2}), result="a")
        self.assertEqual(out["entry"]["a"], "1")

    def test_settings_are_validated_and_merged(self):
        self.call("save_settings", settings={"elo": {"k": 20}})
        out = self.call("save_settings", settings={"elo": {"initial": "abc", "provisionalK": -5}})
        elo = out["settings"]["elo"]
        self.assertEqual(elo["k"], 20)  # earlier value kept
        self.assertEqual(elo["initial"], 1500)  # invalid -> default
        self.assertEqual(elo["provisionalK"], 48)

    def test_corrupt_file_is_moved_aside_not_overwritten(self):
        path = os.path.join(self.tmp.name, "vibings-battles-data.json")
        with open(path, "w") as f:
            f.write("{broken")
        self.battle("1", "2", "a")
        aside = [n for n in os.listdir(self.tmp.name) if ".corrupt-" in n]
        self.assertEqual(len(aside), 1)
        with open(os.path.join(self.tmp.name, aside[0])) as f:
            self.assertEqual(f.read(), "{broken")
        self.assertEqual(self.call("ping")["battles"], 1)

    def test_concurrent_records_are_not_lost(self):
        # Separate processes, like Stash spawning one per request.
        payload = json.dumps({"args": {"operation": "record", "category": "scenes",
                                       "a": {"id": "1"}, "b": {"id": "2"}, "result": "a"}})
        env = {**os.environ, "VIBINGS_BATTLES_DATA_DIR": self.tmp.name}

        def run():
            subprocess.run([sys.executable, BACKEND], input=payload, text=True,
                           capture_output=True, env=env, check=True)

        threads = [threading.Thread(target=run) for _ in range(12)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(self.call("ping")["battles"], 12)

    def test_cli_round_trip(self):
        env = {**os.environ, "VIBINGS_BATTLES_DATA_DIR": self.tmp.name}
        proc = subprocess.run([sys.executable, BACKEND], input='{"args":{"operation":"ping"}}',
                              text=True, capture_output=True, env=env, check=True)
        self.assertEqual(json.loads(proc.stdout), {"output": {"ok": True, "dataVersion": 4, "battles": 0}})


if __name__ == "__main__":
    unittest.main()
