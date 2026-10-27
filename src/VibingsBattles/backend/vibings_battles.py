#!/usr/bin/env python3
"""
Vibings Battles backend (data format v4).

Stash runs this script for every runPluginOperation call (interface: raw).
Input on stdin:  {"server_connection": {...}, "args": {"operation": "...", ...}}
Output on stdout: {"output": <result>} or {"error": "<message>"}

Design:
- The battle log is the single source of truth. Ratings, streaks and
  counters are derived by replaying the log, so undo and algorithm changes
  are always consistent.
- Every read-modify-write holds an exclusive file lock.
- Writes are atomic (tmp file + fsync + rename).
- A corrupt data file is moved aside, never overwritten.

Standard library only.
"""
import copy
import fcntl
import json
import os
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

VERSION = "2.2.0"  # plugin version; must match settings.yml (checked by tests)
DATA_VERSION = 4
DATA_DIR = os.environ.get("VIBINGS_BATTLES_DATA_DIR") or os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DATA_DIR, "vibings-battles-data.json")
LOCK_FILE = DATA_FILE + ".lock"

CATEGORIES = ("scenes", "images", "performers", "studios", "groups", "galleries")
BONUS_CATEGORIES = ("scenes", "images")  # items that have performers
RESULTS = ("a", "b", "draw", "skip")
MAX_RECENT_LOG = 500
MAX_FILTER_ITEMS = 2000  # per list, per category
MAX_ARENA_FIGHTERS = 32
ARENA_SELECTIONS = ("random", "top", "close")
BACKUP_TAGS = ("reset", "corrupt", "compact")

DEFAULT_SETTINGS = {
    "elo": {
        "initial": 1500,
        "k": 32,
        "provisionalK": 48,
        "provisionalBattles": 10,
    },
    # rating100 = 50 + (elo - initial) / scale, clamped to 1..100 ("linear"),
    # or the item's rank within its category scaled to 1..100 ("percentile").
    "ratingMap": {
        "mode": "linear",
        "scale": 8,
    },
    # In scene and image battles, performers of the winning (and optionally
    # losing) item get this percentage of that item's Elo change.
    "performerBonus": {
        "enabled": True,
        "winnerPct": 25,
        "loserPct": 0,
    },
    "pairing": {
        # Scene/image/gallery battles never put the same performer on both sides.
        "noDuplicatePerformer": False,
    },
    # category -> {"blacklist": [{id, name}], "whitelist": [{id, name}], "whitelistOn": bool}
    # Blacklisted items never battle; with whitelistOn only whitelisted items do.
    "filters": {},
    # Arena: automatic free-for-all between performers.
    "arena": {
        "fighters": 8,
        "winBonus": 20,  # Elo for the winner
        "lossPenalty": 10,  # Elo taken from the first knocked out, scaled down by placement
        "eloInfluence": 50,  # % how much Elo affects a fighter's strength
        "selection": "random",  # random | top | close
        "speed": 1,
        "record": True,  # False = exhibition, ratings are not touched
    },
    # Free-form UI settings; the backend stores them as-is.
    "ui": {},
}


class OpError(Exception):
    """Error that is reported back to the UI as a GraphQL error."""


def log(msg):
    print(f"[Vibings Battles] {msg}", file=sys.stderr)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def default_data():
    return {
        "version": DATA_VERSION,
        "settings": copy.deepcopy(DEFAULT_SETTINGS),
        "names": {},  # category -> id -> display name
        "log": [],
        "nextSeq": 1,
    }


# ---------------------------------------------------------------- Storage

@contextmanager
def locked():
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LOCK_FILE, "a") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


def load_data():
    if not os.path.exists(DATA_FILE):
        return default_data()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or data.get("version") != DATA_VERSION:
            raise ValueError(f"unexpected data version: {data.get('version') if isinstance(data, dict) else type(data)}")
    except (ValueError, OSError) as e:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        aside = f"{DATA_FILE}.corrupt-{stamp}"
        try:
            os.replace(DATA_FILE, aside)
            log(f"data file unreadable ({e}); moved to {aside}")
        except OSError as e2:
            raise OpError(f"data file unreadable and could not be moved aside: {e2}")
        return default_data()

    data["settings"] = merge_settings(data.get("settings"))
    data.setdefault("names", {})
    data.setdefault("log", [])
    data.setdefault("nextSeq", len(data["log"]) + 1)
    return data


def save_data(data):
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, DATA_FILE)


def backup_data(tag):
    if not os.path.exists(DATA_FILE):
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = f"{DATA_FILE}.{tag}-{stamp}"
    with open(DATA_FILE, "rb") as src, open(path, "wb") as dst:
        dst.write(src.read())
    return os.path.basename(path)


# ---------------------------------------------------------------- Settings

def _num(value, lo, hi, fallback):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return fallback
    if v != v or v < lo or v > hi:  # NaN or out of range
        return fallback
    return int(v) if float(v).is_integer() else v


# Sections a partial save merges into instead of replacing. "filters" merges
# per category, so saving one category's lists keeps the others.
MERGED_SETTINGS = ("elo", "ratingMap", "performerBonus", "pairing", "filters", "arena", "ui")


def merge_settings(raw):
    s = copy.deepcopy(DEFAULT_SETTINGS)
    if not isinstance(raw, dict):
        return s
    elo = raw.get("elo") if isinstance(raw.get("elo"), dict) else {}
    d = DEFAULT_SETTINGS["elo"]
    s["elo"]["initial"] = _num(elo.get("initial"), 100, 5000, d["initial"])
    s["elo"]["k"] = _num(elo.get("k"), 1, 200, d["k"])
    s["elo"]["provisionalK"] = _num(elo.get("provisionalK"), 1, 400, d["provisionalK"])
    s["elo"]["provisionalBattles"] = int(_num(elo.get("provisionalBattles"), 0, 100, d["provisionalBattles"]))

    rm = raw.get("ratingMap") if isinstance(raw.get("ratingMap"), dict) else {}
    if rm.get("mode") in ("linear", "percentile"):
        s["ratingMap"]["mode"] = rm["mode"]
    s["ratingMap"]["scale"] = _num(rm.get("scale"), 1, 100, DEFAULT_SETTINGS["ratingMap"]["scale"])

    pb = raw.get("performerBonus") if isinstance(raw.get("performerBonus"), dict) else {}
    dpb = DEFAULT_SETTINGS["performerBonus"]
    if isinstance(pb.get("enabled"), bool):
        s["performerBonus"]["enabled"] = pb["enabled"]
    s["performerBonus"]["winnerPct"] = _num(pb.get("winnerPct"), 0, 100, dpb["winnerPct"])
    s["performerBonus"]["loserPct"] = _num(pb.get("loserPct"), 0, 100, dpb["loserPct"])

    pr = raw.get("pairing") if isinstance(raw.get("pairing"), dict) else {}
    if isinstance(pr.get("noDuplicatePerformer"), bool):
        s["pairing"]["noDuplicatePerformer"] = pr["noDuplicatePerformer"]

    fl = raw.get("filters") if isinstance(raw.get("filters"), dict) else {}
    for cat in CATEGORIES:
        f = fl.get(cat)
        if not isinstance(f, dict):
            continue
        entry = {
            "blacklist": _ref_list(f.get("blacklist")),
            "whitelist": _ref_list(f.get("whitelist")),
            "whitelistOn": f.get("whitelistOn") is True,
        }
        if entry["blacklist"] or entry["whitelist"] or entry["whitelistOn"]:
            s["filters"][cat] = entry

    ar = raw.get("arena") if isinstance(raw.get("arena"), dict) else {}
    da = DEFAULT_SETTINGS["arena"]
    s["arena"]["fighters"] = int(_num(ar.get("fighters"), 2, MAX_ARENA_FIGHTERS, da["fighters"]))
    s["arena"]["winBonus"] = _num(ar.get("winBonus"), 0, 400, da["winBonus"])
    s["arena"]["lossPenalty"] = _num(ar.get("lossPenalty"), 0, 400, da["lossPenalty"])
    s["arena"]["eloInfluence"] = _num(ar.get("eloInfluence"), 0, 100, da["eloInfluence"])
    if ar.get("selection") in ARENA_SELECTIONS:
        s["arena"]["selection"] = ar["selection"]
    s["arena"]["speed"] = _num(ar.get("speed"), 0.25, 8, da["speed"])
    if isinstance(ar.get("record"), bool):
        s["arena"]["record"] = ar["record"]

    if isinstance(raw.get("ui"), dict):
        s["ui"] = raw["ui"]
    return s


def _ref_list(raw):
    """[{id, name}] with unique string ids; malformed entries are dropped."""
    out, seen = [], set()
    for r in raw if isinstance(raw, list) else []:
        if not isinstance(r, dict) or r.get("id") in (None, ""):
            continue
        item_id = str(r["id"])
        if item_id in seen:
            continue
        seen.add(item_id)
        out.append({"id": item_id, "name": str(r.get("name") or "")[:200]})
        if len(out) >= MAX_FILTER_ITEMS:
            break
    return out


# ---------------------------------------------------------------- Rating engine

def new_item(item_id, initial):
    return {
        "id": item_id,
        "rating": float(initial),
        "battles": 0,  # decided battles incl. draws (skips excluded)
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "skips": 0,
        "streak": 0,  # +n = n wins in a row, -n = n losses in a row
        "bestStreak": 0,
        "worstStreak": 0,
        "firstBattled": None,
        "lastBattled": None,
        "bonus": 0.0,  # Elo received through the performer bonus
        "arenaPlayed": 0,
        "arenaWins": 0,
        "arenaElo": 0.0,  # Elo won or lost in the arena
    }


def expected(ra, rb):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))


def k_for(item, elo):
    return elo["provisionalK"] if item["battles"] < elo["provisionalBattles"] else elo["k"]


def is_ranked(item):
    return item["battles"] > 0 or item.get("bonus", 0) != 0 or item.get("arenaPlayed", 0) > 0


def is_arena(entry):
    return entry.get("type") == "arena"


def entry_ids(entry):
    """Item ids taking part in a log entry."""
    return entry["ranking"] if is_arena(entry) else [entry["a"], entry["b"]]


def apply_performer_bonus(items, entry, deltas, settings):
    pb = settings["performerBonus"]
    perf = entry.get("perf")
    if not pb["enabled"] or not perf or entry["result"] not in ("a", "b"):
        return
    initial = settings["elo"]["initial"]
    win, lose = ("a", "b") if entry["result"] == "a" else ("b", "a")
    delta = {"a": deltas[0], "b": deltas[1]}
    performers = items.setdefault("performers", {})
    for side, pct in ((win, pb["winnerPct"]), (lose, pb["loserPct"])):
        amount = delta[side] * pct / 100.0
        if not amount:
            continue
        for pid in perf.get(side) or []:
            p = performers.get(pid) or performers.setdefault(pid, new_item(pid, initial))
            p["rating"] += amount
            p["bonus"] += amount


def apply_entry(items, entry, settings):
    """Apply one log entry to the item map (mutates). Returns (a, b, deltas)."""
    elo = settings["elo"]
    cat = items.setdefault(entry["category"], {})
    a = cat.get(entry["a"]) or cat.setdefault(entry["a"], new_item(entry["a"], elo["initial"]))
    b = cat.get(entry["b"]) or cat.setdefault(entry["b"], new_item(entry["b"], elo["initial"]))
    ts = entry["ts"]

    if entry["result"] == "skip":
        a["skips"] += 1
        b["skips"] += 1
        return a, b, (0.0, 0.0)

    score_a = {"a": 1.0, "b": 0.0, "draw": 0.5}[entry["result"]]
    ea = expected(a["rating"], b["rating"])
    da = k_for(a, elo) * (score_a - ea)
    db = k_for(b, elo) * ((1.0 - score_a) - (1.0 - ea))
    a["rating"] += da
    b["rating"] += db

    for item, score in ((a, score_a), (b, 1.0 - score_a)):
        item["battles"] += 1
        if item["firstBattled"] is None:
            item["firstBattled"] = ts
        item["lastBattled"] = ts
        if score == 1.0:
            item["wins"] += 1
            item["streak"] = item["streak"] + 1 if item["streak"] > 0 else 1
        elif score == 0.0:
            item["losses"] += 1
            item["streak"] = item["streak"] - 1 if item["streak"] < 0 else -1
        else:
            item["draws"] += 1
            item["streak"] = 0
        item["bestStreak"] = max(item["bestStreak"], item["streak"])
        item["worstStreak"] = max(item["worstStreak"], -item["streak"])
    apply_performer_bonus(items, entry, (da, db), settings)
    return a, b, (da, db)


def arena_deltas(n, win_bonus, loss_penalty):
    """Elo change per placement (winner first). The first knocked out loses the
    full penalty, later placements proportionally less."""
    out = [float(win_bonus)]
    for place in range(1, n):
        out.append(-loss_penalty * place / (n - 1))
    return [round(d, 2) for d in out]


def apply_arena(items, entry, settings):
    """Apply an arena entry. Its Elo changes are stored in the entry, so later
    arena setting changes do not rewrite history."""
    cat = items.setdefault(entry["category"], {})
    initial = settings["elo"]["initial"]
    for place, (item_id, delta) in enumerate(zip(entry["ranking"], entry["delta"])):
        it = cat.get(item_id) or cat.setdefault(item_id, new_item(item_id, initial))
        it["rating"] += delta
        it["arenaElo"] += delta
        it["arenaPlayed"] += 1
        if place == 0:
            it["arenaWins"] += 1


def replay(data):
    """Derive all item states from the log."""
    items = {}
    for entry in data["log"]:
        if is_arena(entry):
            apply_arena(items, entry, data["settings"])
        else:
            apply_entry(items, entry, data["settings"])
    return items


def rating100_map(items, settings):
    """Return {category: {id: rating100}} for every ranked item (battled or bonus)."""
    rm = settings["ratingMap"]
    initial = settings["elo"]["initial"]
    out = {}
    for cat, cat_items in items.items():
        rated = [it for it in cat_items.values() if is_ranked(it)]
        res = {}
        if rm["mode"] == "percentile":
            rated.sort(key=lambda it: it["rating"])
            n = len(rated)
            for i, it in enumerate(rated):
                res[it["id"]] = 100 if n == 1 else int(round(1 + 99 * i / (n - 1)))
        else:
            for it in rated:
                v = 50 + (it["rating"] - initial) / rm["scale"]
                res[it["id"]] = int(min(100, max(1, round(v))))
        out[cat] = res
    return out


def diff_rating100(before, after):
    """List of {category, id, rating100} whose rating100 changed or appeared.

    Items that disappeared (e.g. undo of their only battle) get rating100 None,
    which the UI should treat as "clear the Stash rating".
    """
    changed = []
    for cat in set(before) | set(after):
        b, a = before.get(cat, {}), after.get(cat, {})
        for item_id in set(b) | set(a):
            if b.get(item_id) != a.get(item_id):
                changed.append({"category": cat, "id": item_id, "rating100": a.get(item_id)})
    changed.sort(key=lambda c: (c["category"], c["id"]))
    return changed


def public_item(item, names, r100):
    out = dict(item)
    out["rating"] = round(item["rating"], 1)
    out["bonus"] = round(item.get("bonus", 0.0), 1)
    out["arenaElo"] = round(item.get("arenaElo", 0.0), 1)
    out["name"] = names.get(item["id"], "")
    out["rating100"] = r100.get(item["id"])
    return out


# ---------------------------------------------------------------- Helpers

def arg_json(args, key, default=None):
    """Stash passes Map args as JSON objects, older UI code sent strings."""
    v = args.get(key, default)
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            raise OpError(f"argument '{key}' is not valid JSON")
    return v


def require_category(args):
    cat = args.get("category")
    if cat not in CATEGORIES:
        raise OpError(f"unknown category: {cat!r}")
    return cat


def parse_ref(raw, key):
    if not isinstance(raw, dict) or raw.get("id") in (None, ""):
        raise OpError(f"argument '{key}' must be an object with an id")
    return str(raw["id"]), str(raw.get("name") or "")


def parse_performers(raw):
    """[{id, name}] -> list of (id, name); ignores malformed entries."""
    out = []
    for p in (raw or {}).get("performers") or []:
        if isinstance(p, dict) and p.get("id") not in (None, ""):
            out.append((str(p["id"]), str(p.get("name") or "")))
    return out


def with_names(entry, names):
    if is_arena(entry):
        return {**entry, "names": [names.get(i, "") for i in entry["ranking"]]}
    return {**entry, "aName": names.get(entry["a"], ""), "bName": names.get(entry["b"], "")}


def list_backups():
    """Backup files next to the data file, newest first."""
    prefix = os.path.basename(DATA_FILE) + "."
    out = []
    try:
        names = os.listdir(DATA_DIR)
    except OSError:
        return out
    for name in names:
        if not name.startswith(prefix):
            continue
        tag = name[len(prefix):].split("-", 1)[0]
        if tag not in BACKUP_TAGS:
            continue
        try:
            st = os.stat(os.path.join(DATA_DIR, name))
        except OSError:
            continue
        out.append({"name": name, "tag": tag, "bytes": st.st_size, "mtime": st.st_mtime})
    out.sort(key=lambda b: (b["mtime"], b["name"]), reverse=True)
    return out


def referenced_ids(log_entries):
    """{category: set(ids)} of every item a log mentions (incl. bonus performers)."""
    refs = {}
    for e in log_entries:
        refs.setdefault(e["category"], set()).update(entry_ids(e))
        for side in (e.get("perf") or {}).values():
            refs.setdefault("performers", set()).update(side)
    return refs


def local_day(ts, tz_offset_min):
    # tz_offset_min follows JS Date.getTimezoneOffset(): UTC - local, in minutes.
    dt = datetime.fromisoformat(ts) - timedelta(minutes=tz_offset_min)
    return dt.date().isoformat()


# ---------------------------------------------------------------- Operations

def op_ping(args):
    data = load_data()
    prefix = os.path.basename(DATA_FILE) + ".corrupt-"
    try:
        corrupt = sum(1 for name in os.listdir(DATA_DIR) if name.startswith(prefix))
    except OSError:
        corrupt = 0
    return {
        "ok": True,
        "version": VERSION,
        "dataVersion": DATA_VERSION,
        "battles": len(data["log"]),
        "dataBytes": os.path.getsize(DATA_FILE) if os.path.exists(DATA_FILE) else 0,
        "corruptBackups": corrupt,
        "python": sys.version.split()[0],
    }


def op_get_settings(args):
    return load_data()["settings"]


def op_save_settings(args):
    incoming = arg_json(args, "settings")
    if not isinstance(incoming, dict):
        raise OpError("argument 'settings' must be an object")
    with locked():
        data = load_data()
        before = rating100_map(replay(data), data["settings"])
        combined = copy.deepcopy(data["settings"])
        for key, value in incoming.items():
            if key in MERGED_SETTINGS and isinstance(value, dict):
                combined[key] = {**combined.get(key, {}), **value}
            else:
                combined[key] = value
        merged = merge_settings(combined)
        data["settings"] = merged
        after = rating100_map(replay(data), merged)
        save_data(data)
    return {"settings": merged, "changed": diff_rating100(before, after)}


def op_record(args):
    cat = require_category(args)
    a_raw, b_raw = arg_json(args, "a"), arg_json(args, "b")
    a_id, a_name = parse_ref(a_raw, "a")
    b_id, b_name = parse_ref(b_raw, "b")
    a_perf = parse_performers(a_raw) if cat in BONUS_CATEGORIES else []
    b_perf = parse_performers(b_raw) if cat in BONUS_CATEGORIES else []
    result = args.get("result")
    if result not in RESULTS:
        raise OpError(f"result must be one of {RESULTS}")
    if a_id == b_id:
        raise OpError("an item cannot battle itself")

    with locked():
        data = load_data()
        items = replay(data)
        before = rating100_map(items, data["settings"])

        entry = {
            "seq": data["nextSeq"],
            "ts": now_iso(),
            "category": cat,
            "a": a_id,
            "b": b_id,
            "result": result,
        }
        if a_perf or b_perf:
            entry["perf"] = {"a": [pid for pid, _ in a_perf], "b": [pid for pid, _ in b_perf]}
        a, b, (da, db) = apply_entry(items, entry, data["settings"])
        entry["delta"] = [round(da, 2), round(db, 2)]
        data["log"].append(entry)
        data["nextSeq"] += 1

        names = data["names"].setdefault(cat, {})
        if a_name:
            names[a_id] = a_name
        if b_name:
            names[b_id] = b_name
        perf_names = data["names"].setdefault("performers", {}) if (a_perf or b_perf) else {}
        for pid, pname in a_perf + b_perf:
            if pname:
                perf_names[pid] = pname

        after = rating100_map(items, data["settings"])
        save_data(data)

    r100 = after.get(cat, {})
    return {
        "entry": entry,
        "a": public_item(a, names, r100),
        "b": public_item(b, names, r100),
        "changed": diff_rating100(before, after),
    }


def op_undo(args):
    with locked():
        data = load_data()
        if not data["log"]:
            raise OpError("nothing to undo")
        before = rating100_map(replay(data), data["settings"])
        entry = data["log"].pop()
        after = rating100_map(replay(data), data["settings"])
        save_data(data)
    return {"undone": entry, "changed": diff_rating100(before, after)}


def op_get_items(args):
    cat = require_category(args)
    data = load_data()
    items = replay(data)
    r100 = rating100_map(items, data["settings"]).get(cat, {})
    names = data["names"].get(cat, {})
    out = [public_item(it, names, r100) for it in items.get(cat, {}).values()]
    out.sort(key=lambda it: -it["rating"])
    return out


def op_get_item(args):
    cat = require_category(args)
    item_id = str(args.get("id") or "")
    data = load_data()
    items = replay(data)
    item = items.get(cat, {}).get(item_id)
    if item is None:
        return None
    r100 = rating100_map(items, data["settings"]).get(cat, {})
    out = public_item(item, data["names"].get(cat, {}), r100)
    names = data["names"].get(cat, {})
    recent = [e for e in data["log"] if e["category"] == cat and item_id in entry_ids(e)][-20:][::-1]
    out["recent"] = [with_names(e, names) for e in recent]
    return out


def op_recent_log(args):
    limit = int(_num(args.get("limit"), 1, MAX_RECENT_LOG, 50))
    cat = args.get("category")
    data = load_data()
    entries = data["log"]
    if cat:
        entries = [e for e in entries if e["category"] == cat]
    out = []
    for e in entries[-limit:][::-1]:
        out.append(with_names(e, data["names"].get(e["category"], {})))
    return out


def op_summary(args):
    tz = int(_num(args.get("tzOffset"), -1440, 1440, 0))
    data = load_data()
    items = replay(data)

    per_cat = {c: {"battles": 0, "draws": 0, "skips": 0, "arenas": 0, "items": 0} for c in CATEGORIES}
    daily = {}
    for e in data["log"]:
        pc = per_cat.setdefault(e["category"], {"battles": 0, "draws": 0, "skips": 0, "arenas": 0, "items": 0})
        day = daily.setdefault(local_day(e["ts"], tz), {"battles": 0, "draws": 0, "skips": 0, "arenas": 0})
        if is_arena(e):
            pc["arenas"] += 1
            day["arenas"] += 1
        elif e["result"] == "skip":
            pc["skips"] += 1
            day["skips"] += 1
        else:
            pc["battles"] += 1
            day["battles"] += 1
            if e["result"] == "draw":
                pc["draws"] += 1
                day["draws"] += 1

    best_win, best_loss = None, None
    for cat, cat_items in items.items():
        names = data["names"].get(cat, {})
        per_cat[cat]["items"] = sum(1 for it in cat_items.values() if is_ranked(it))
        for it in cat_items.values():
            if it["bestStreak"] and (best_win is None or it["bestStreak"] > best_win["value"]):
                best_win = {"category": cat, "id": it["id"], "name": names.get(it["id"], ""), "value": it["bestStreak"]}
            if it["worstStreak"] and (best_loss is None or it["worstStreak"] > best_loss["value"]):
                best_loss = {"category": cat, "id": it["id"], "name": names.get(it["id"], ""), "value": it["worstStreak"]}

    decided = sum(pc["battles"] for pc in per_cat.values())
    return {
        "totals": {
            "battles": decided,
            "draws": sum(pc["draws"] for pc in per_cat.values()),
            "skips": sum(pc["skips"] for pc in per_cat.values()),
            "arenas": sum(pc["arenas"] for pc in per_cat.values()),
            "lastBattle": data["log"][-1]["ts"] if data["log"] else None,
            "highestWinStreak": best_win,
            "highestLossStreak": best_loss,
        },
        "categories": per_cat,
        "daily": dict(sorted(daily.items())),
    }


def op_reset(args):
    """Reset one category (args.category) or everything. Always backs up first."""
    cat = args.get("category")
    if cat is not None and cat not in CATEGORIES:
        raise OpError(f"unknown category: {cat!r}")
    with locked():
        data = load_data()
        before = rating100_map(replay(data), data["settings"])
        backup = backup_data("reset")
        if cat:
            data["log"] = [e for e in data["log"] if e["category"] != cat]
            data["names"].pop(cat, None)
        else:
            settings = data["settings"]
            data = default_data()
            data["settings"] = settings  # a stats reset keeps settings
        after = rating100_map(replay(data), data["settings"])
        save_data(data)
    return {"backup": backup, "changed": diff_rating100(before, after)}


def op_ratings(args):
    """Every ranked item's rating100, for a full re-sync to Stash."""
    data = load_data()
    current = rating100_map(replay(data), data["settings"])
    return diff_rating100({}, current)


def op_record_arena(args):
    """Store a finished arena fight. ranking = [{id, name}], winner first;
    kills (optional) = knockouts per fighter in the same order."""
    raw = arg_json(args, "ranking")
    if not isinstance(raw, list):
        raise OpError("argument 'ranking' must be a list")
    refs = [parse_ref(r, "ranking") for r in raw]
    ids = [item_id for item_id, _ in refs]
    if not 2 <= len(ids) <= MAX_ARENA_FIGHTERS:
        raise OpError(f"an arena needs 2-{MAX_ARENA_FIGHTERS} fighters")
    if len(set(ids)) != len(ids):
        raise OpError("a fighter can only appear once")
    kills = arg_json(args, "kills")

    with locked():
        data = load_data()
        items = replay(data)
        before = rating100_map(items, data["settings"])
        arena = data["settings"]["arena"]
        entry = {
            "seq": data["nextSeq"],
            "ts": now_iso(),
            "type": "arena",
            "category": "performers",
            "ranking": ids,
            "delta": arena_deltas(len(ids), arena["winBonus"], arena["lossPenalty"]),
        }
        if isinstance(kills, list) and len(kills) == len(ids) and all(isinstance(k, int) and k >= 0 for k in kills):
            entry["kills"] = kills
        apply_arena(items, entry, data["settings"])
        data["log"].append(entry)
        data["nextSeq"] += 1
        names = data["names"].setdefault("performers", {})
        for item_id, name in refs:
            if name:
                names[item_id] = name
        after = rating100_map(items, data["settings"])
        save_data(data)
    return {"entry": entry, "changed": diff_rating100(before, after)}


def op_db_info(args):
    """Size and contents of the data file, for the maintenance view."""
    data = load_data()
    refs = referenced_ids(data["log"])
    names = sum(len(v) for v in data["names"].values())
    orphan = sum(1 for cat, nm in data["names"].items() for i in nm if i not in refs.get(cat, ()))
    backups = list_backups()
    return {
        "bytes": os.path.getsize(DATA_FILE) if os.path.exists(DATA_FILE) else 0,
        "entries": len(data["log"]),
        "battles": sum(1 for e in data["log"] if not is_arena(e) and e["result"] != "skip"),
        "skips": sum(1 for e in data["log"] if not is_arena(e) and e["result"] == "skip"),
        "arenas": sum(1 for e in data["log"] if is_arena(e)),
        "names": names,
        "orphanNames": orphan,
        "backups": backups,
        "backupBytes": sum(b["bytes"] for b in backups),
        "ids": {cat: sorted(v) for cat, v in refs.items()},
    }


def op_compact(args):
    """Defragment the data file: drop entries of items deleted from Stash
    (removeItems = {category: [ids]}), optionally skip entries, names nobody
    references, and old backups (keepBackups = newest N to keep). A backup
    is made first."""
    remove_raw = arg_json(args, "removeItems") or {}
    if not isinstance(remove_raw, dict):
        raise OpError("argument 'removeItems' must be an object")
    remove = {cat: {str(i) for i in ids} for cat, ids in remove_raw.items() if cat in CATEGORIES and isinstance(ids, list)}
    drop_skips = args.get("dropSkips") is True
    keep = args.get("keepBackups")
    keep = None if keep is None else int(_num(keep, 0, 1000, 5))

    with locked():
        data = load_data()
        bytes_before = os.path.getsize(DATA_FILE) if os.path.exists(DATA_FILE) else 0
        before = rating100_map(replay(data), data["settings"])
        backup = backup_data("compact")
        gone_perf = remove.get("performers", set())
        new_log, removed_entries = [], 0
        for e in data["log"]:
            gone = remove.get(e["category"], set())
            if is_arena(e):
                if gone & set(e["ranking"]):
                    keep_idx = [i for i, item_id in enumerate(e["ranking"]) if item_id not in gone]
                    if len(keep_idx) < 2:
                        removed_entries += 1
                        continue
                    e = {**e, "ranking": [e["ranking"][i] for i in keep_idx], "delta": [e["delta"][i] for i in keep_idx]}
                    if "kills" in e:
                        e["kills"] = [e["kills"][i] for i in keep_idx]
                new_log.append(e)
                continue
            if (drop_skips and e["result"] == "skip") or e["a"] in gone or e["b"] in gone:
                removed_entries += 1
                continue
            if e.get("perf") and gone_perf:
                e = {**e, "perf": {side: [p for p in ids if p not in gone_perf] for side, ids in e["perf"].items()}}
            new_log.append(e)
        data["log"] = new_log

        refs = referenced_ids(new_log)
        removed_names = 0
        for cat in list(data["names"]):
            kept = {i: n for i, n in data["names"][cat].items() if i in refs.get(cat, ())}
            removed_names += len(data["names"][cat]) - len(kept)
            if kept:
                data["names"][cat] = kept
            else:
                del data["names"][cat]

        after = rating100_map(replay(data), data["settings"])
        save_data(data)

        removed_backups = 0
        if keep is not None:
            # The backup just made counts as the newest, even within the same second.
            ordered = sorted(list_backups(), key=lambda b: b["name"] != backup)
            for b in ordered[keep:]:
                try:
                    os.remove(os.path.join(DATA_DIR, b["name"]))
                    removed_backups += 1
                except OSError as err:
                    log(f"could not remove backup {b['name']}: {err}")
        bytes_after = os.path.getsize(DATA_FILE)
    return {
        "bytesBefore": bytes_before,
        "bytesAfter": bytes_after,
        "removedEntries": removed_entries,
        "removedNames": removed_names,
        "removedBackups": removed_backups,
        "backup": backup if os.path.exists(os.path.join(DATA_DIR, backup or "")) else None,
        "changed": diff_rating100(before, after),
    }


OPERATIONS = {
    "ping": op_ping,
    "get_settings": op_get_settings,
    "save_settings": op_save_settings,
    "record": op_record,
    "undo": op_undo,
    "get_items": op_get_items,
    "get_item": op_get_item,
    "recent_log": op_recent_log,
    "summary": op_summary,
    "reset": op_reset,
    "ratings": op_ratings,
    "record_arena": op_record_arena,
    "db_info": op_db_info,
    "compact": op_compact,
}


def handle(payload):
    args = (payload or {}).get("args") or {}
    operation = args.get("operation")
    fn = OPERATIONS.get(operation)
    if fn is None:
        return {"error": f"unknown operation: {operation!r}"}
    try:
        return {"output": fn(args)}
    except OpError as e:
        return {"error": str(e)}


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}
    try:
        result = handle(payload)
    except Exception as e:  # unexpected bug: report it instead of failing silently
        log(f"unexpected error: {e!r}")
        result = {"error": f"internal error: {e}"}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
