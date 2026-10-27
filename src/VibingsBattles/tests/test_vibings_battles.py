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


class TestPerformerBonus(BackendTestCase):
    def scene(self, sid, *perf_ids):
        return {"id": sid, "name": f"Scene {sid}", "performers": [{"id": p, "name": f"P{p}"} for p in perf_ids]}

    def record(self, a, b, result, category="scenes"):
        return self.call("record", category=category, a=a, b=b, result=result)

    def performers(self):
        return {it["id"]: it for it in self.call("get_items", category="performers")}

    def test_winner_performers_get_default_25_percent(self):
        out = self.record(self.scene("1", "10", "11"), self.scene("2", "20"), "a")
        self.assertEqual(out["entry"]["perf"], {"a": ["10", "11"], "b": ["20"]})
        perf = self.performers()
        self.assertEqual(set(perf), {"10", "11"})  # loser bonus is 0% by default
        self.assertEqual(perf["10"]["rating"], 1506.0)  # 24 * 25%
        self.assertEqual(perf["10"]["bonus"], 6.0)
        self.assertEqual(perf["10"]["battles"], 0)
        self.assertEqual(perf["10"]["name"], "P10")
        self.assertEqual(perf["10"]["rating100"], 51)  # 50 + 6/8 rounds to 51
        changed = {(c["category"], c["id"]) for c in out["changed"]}
        self.assertIn(("performers", "10"), changed)

    def test_loser_bonus_and_disabled(self):
        self.call("save_settings", settings={"performerBonus": {"loserPct": 50}})
        self.record(self.scene("1", "10"), self.scene("2", "20"), "a")
        self.assertEqual(self.performers()["20"]["rating"], 1488.0)  # -24 * 50%
        out = self.call("save_settings", settings={"performerBonus": {"enabled": False}})
        self.assertEqual(self.performers(), {})
        self.assertEqual({c["rating100"] for c in out["changed"]}, {None})

    def test_draw_and_skip_give_no_bonus(self):
        self.record(self.scene("1", "10"), self.scene("2", "20"), "draw")
        self.record(self.scene("1", "10"), self.scene("3", "30"), "skip")
        self.assertEqual(self.performers(), {})

    def test_bonus_adds_to_real_performer_battles_and_undo_removes_it(self):
        self.battle("10", "20", "a", category="performers")  # P10 -> 1524
        self.record(self.scene("1", "10"), self.scene("2"), "a")
        self.assertEqual(self.performers()["10"]["rating"], 1530.0)
        self.call("undo")
        self.assertEqual(self.performers()["10"]["rating"], 1524.0)

    def test_performers_ignored_for_other_categories(self):
        out = self.record(self.scene("1", "10"), self.scene("2"), "a", category="studios")
        self.assertNotIn("perf", out["entry"])

    def test_ratings_lists_every_ranked_item(self):
        self.record(self.scene("1", "10"), self.scene("2"), "a")
        rows = self.call("ratings")
        self.assertEqual({(r["category"], r["id"]) for r in rows},
                         {("scenes", "1"), ("scenes", "2"), ("performers", "10")})


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
        self.assertEqual(s["categories"]["scenes"], {"battles": 2, "draws": 1, "skips": 1, "arenas": 0, "items": 2})
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
        out = json.loads(proc.stdout)["output"]
        self.assertEqual({k: out[k] for k in ("ok", "dataVersion", "battles", "dataBytes", "corruptBackups")},
                         {"ok": True, "dataVersion": 4, "battles": 0, "dataBytes": 0, "corruptBackups": 0})
        self.assertEqual(out["version"], self.vb.VERSION)

    def test_ping_reports_set_aside_files(self):
        with open(os.path.join(self.tmp.name, "vibings-battles-data.json"), "w") as f:
            f.write("{broken")
        self.call("ping")  # moves the broken file aside
        self.assertEqual(self.call("ping")["corruptBackups"], 1)

    def test_version_matches_settings_yml(self):
        with open(os.path.join(HERE, "..", "settings.yml")) as f:
            version = next(line.split(":", 1)[1].strip() for line in f if line.startswith("version:"))
        self.assertEqual(self.vb.VERSION, version)


class TestNewSettings(BackendTestCase):
    def test_filters_are_validated_and_merged_per_category(self):
        out = self.call("save_settings", settings={"filters": {
            "scenes": {"blacklist": [{"id": 1, "name": "A"}, {"id": "1"}, {"name": "no id"}], "whitelistOn": "yes"},
            "cars": {"blacklist": [{"id": "9"}]},
        }})
        self.assertEqual(out["settings"]["filters"], {
            "scenes": {"blacklist": [{"id": "1", "name": "A"}], "whitelist": [], "whitelistOn": False}})
        out = self.call("save_settings", settings={"filters": {"images": {"whitelist": [{"id": "5"}], "whitelistOn": True}}})
        self.assertEqual(set(out["settings"]["filters"]), {"scenes", "images"})
        out = self.call("save_settings", settings={"filters": {"scenes": {"blacklist": []}}})
        self.assertEqual(set(out["settings"]["filters"]), {"images"})  # emptied category disappears

    def test_arena_and_pairing_defaults_and_ranges(self):
        s = self.call("get_settings")
        self.assertEqual(s["arena"]["fighters"], 8)
        self.assertFalse(s["pairing"]["noDuplicatePerformer"])
        out = self.call("save_settings", settings={"arena": {"fighters": 99, "winBonus": 30, "selection": "x"},
                                                   "pairing": {"noDuplicatePerformer": True}})
        self.assertEqual(out["settings"]["arena"]["fighters"], 8)
        self.assertEqual(out["settings"]["arena"]["winBonus"], 30)
        self.assertEqual(out["settings"]["arena"]["selection"], "random")
        self.assertTrue(out["settings"]["pairing"]["noDuplicatePerformer"])

    def test_ui_is_merged(self):
        self.call("save_settings", settings={"ui": {"a": 1}})
        self.assertEqual(self.call("save_settings", settings={"ui": {"b": 2}})["settings"]["ui"], {"a": 1, "b": 2})


class TestArena(BackendTestCase):
    def fight(self, *ids, kills=None):
        args = {"ranking": [{"id": i, "name": f"P{i}"} for i in ids]}
        if kills is not None:
            args["kills"] = kills
        return self.call("record_arena", **args)

    def test_deltas_by_placement(self):
        self.assertEqual(self.vb.arena_deltas(5, 20, 10), [20.0, -2.5, -5.0, -7.5, -10.0])
        self.assertEqual(self.vb.arena_deltas(2, 20, 10), [20.0, -10.0])

    def test_record_updates_performers_and_undo_reverts(self):
        out = self.fight("1", "2", "3", kills=[2, 0, 0])
        self.assertEqual(out["entry"]["type"], "arena")
        self.assertEqual(out["entry"]["kills"], [2, 0, 0])
        self.assertEqual(len(out["changed"]), 3)
        perf = {it["id"]: it for it in self.call("get_items", category="performers")}
        self.assertEqual(perf["1"]["rating"], 1520.0)
        self.assertEqual(perf["3"]["rating"], 1490.0)
        self.assertEqual((perf["1"]["arenaWins"], perf["1"]["arenaPlayed"], perf["1"]["battles"]), (1, 1, 0))
        item = self.call("get_item", category="performers", id="2")
        self.assertEqual(item["recent"][0]["names"], ["P1", "P2", "P3"])
        self.assertEqual(self.call("summary")["totals"]["arenas"], 1)
        self.call("undo")
        self.assertEqual(self.call("get_items", category="performers"), [])

    def test_settings_change_does_not_rewrite_past_arenas(self):
        self.fight("1", "2")
        self.call("save_settings", settings={"arena": {"winBonus": 100}})
        perf = {it["id"]: it for it in self.call("get_items", category="performers")}
        self.assertEqual(perf["1"]["rating"], 1520.0)

    def test_invalid_arena(self):
        self.assertIn("needs", self.call_err("record_arena", ranking=[{"id": "1"}]))
        self.assertIn("once", self.call_err("record_arena", ranking=[{"id": "1"}, {"id": "1"}]))


class TestCompact(BackendTestCase):
    def test_db_info(self):
        self.battle("1", "2", "a")
        self.battle("1", "3", "skip")
        self.call("record_arena", ranking=[{"id": "7"}, {"id": "8"}])
        info = self.call("db_info")
        self.assertEqual((info["entries"], info["battles"], info["skips"], info["arenas"]), (3, 1, 1, 1))
        self.assertEqual(info["ids"]["scenes"], ["1", "2", "3"])
        self.assertEqual(info["orphanNames"], 0)

    def test_compact_removes_deleted_items_skips_names_and_backups(self):
        self.battle("1", "2", "a")
        self.battle("1", "3", "skip")
        self.battle("2", "4", "b")
        self.call("record_arena", ranking=[{"id": "7"}, {"id": "8"}, {"id": "9"}], kills=[1, 1, 0])
        self.call("reset", category="groups")  # makes a reset backup
        out = self.call("compact", removeItems={"scenes": ["4"], "performers": ["8"]}, dropSkips=True, keepBackups=1)
        self.assertEqual(out["removedEntries"], 2)
        self.assertEqual(out["removedNames"], 2)  # scenes 3 and 4
        self.assertEqual(out["removedBackups"], 1)  # the reset backup; the compact backup is newest
        self.assertIn({"category": "scenes", "id": "4", "rating100": None}, out["changed"])
        self.assertTrue(out["backup"].startswith("vibings-battles-data.json.compact-"))
        log = self.call("recent_log", limit=10)
        self.assertEqual(len(log), 2)
        self.assertEqual(log[0]["ranking"], ["7", "9"])
        self.assertEqual(log[0]["kills"], [1, 0])
        self.assertEqual(self.call("db_info")["orphanNames"], 0)

    def test_arena_with_one_fighter_left_is_dropped(self):
        self.call("record_arena", ranking=[{"id": "7"}, {"id": "8"}])
        out = self.call("compact", removeItems={"performers": ["8"]})
        self.assertEqual(out["removedEntries"], 1)
        self.assertEqual(self.call("db_info")["entries"], 0)


if __name__ == "__main__":
    unittest.main()
