#!/usr/bin/env python3
"""
Vibings Better Os backend (data format v1).

Stash runs this script for every runPluginOperation call (interface: raw).
Input on stdin:  {"server_connection": {...}, "args": {"operation": "...", ...}}
Output on stdout: {"output": <result>} or {"error": "<message>"}

Design:
- Stash stays the source of truth for how many Os there are: a scene's
  o_history and an image's o_counter. This file only adds detail to them:
  the video position of a scene O, and how long an image was open before
  its O. Os without that detail are "classic" Os.
- A scene O is keyed by its o_history timestamp (UTC, whole seconds), so
  removing an O anywhere in Stash removes its detail on the next sync.
- Every read-modify-write holds an exclusive file lock; writes are atomic
  (tmp file + fsync + rename); a corrupt data file is moved aside.
- Automatic backups are taken before writes, at most once per interval.

Standard library only.
"""
import copy
import fcntl
import json
import os
import shutil
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timezone

VERSION = "1.0.0"  # plugin version; must match settings.yml (checked by tests)
DATA_VERSION = 1
FORMAT = "vibings-better-os"
DATA_DIR = os.environ.get("VIBINGS_BETTER_OS_DATA_DIR") or os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DATA_DIR, "vibings-better-os-data.json")
LOCK_FILE = DATA_FILE + ".lock"

BACKUP_TAGS = ("auto", "manual", "import", "restore", "compact", "corrupt")
SCENE_SOURCES = ("player", "stash", "panel", "manual", "import")
IMAGE_SOURCES = ("stash", "import")
MATCH_TOLERANCE = 2  # seconds between a stored O and its o_history entry
MAX_SECONDS = 7 * 24 * 3600  # sanity limit for video positions and view times

DEFAULT_SETTINGS = {
    # Store the video position when an O is added on a scene page.
    "recordPosition": True,
    # Store how long an image was open when its O was added.
    "imageSessions": True,
    "player": {
        "button": True,  # O button in the video player's control bar
        "markers": True,  # O markers on the player's timeline
        "popup": True,  # animation when an O is added
    },
    "backup": {
        "auto": True,
        "intervalHours": 24,
        "keep": 10,  # automatic backups to keep
    },
    # Free-form UI settings; the backend stores them as-is.
    "ui": {},
}
MERGED_SETTINGS = ("player", "backup", "ui")


class OpError(Exception):
    """Error that is reported back to the UI as a GraphQL error."""


def log(msg):
    print(f"[Vibings Better Os] {msg}", file=sys.stderr)


def default_data():
    return {"version": DATA_VERSION, "settings": copy.deepcopy(DEFAULT_SETTINGS), "scenes": {}, "images": {}}


# ---------------------------------------------------------------- Time

def parse_ts(value):
    """ISO 8601 (Z, offset or naive UTC; fractions allowed) or epoch seconds
    -> aware UTC datetime truncated to whole seconds."""
    if isinstance(value, bool):
        raise ValueError("not a timestamp")
    if isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(float(value), tz=timezone.utc)
    elif isinstance(value, str) and value.strip():
        s = value.strip()
        if s.endswith("Z") or s.endswith("z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt = dt.astimezone(timezone.utc)
    else:
        raise ValueError("not a timestamp")
    return dt.replace(microsecond=0)


def norm_ts(value):
    """Canonical form, the same Stash uses for o_history: 2026-10-24T10:10:10Z."""
    return parse_ts(value).strftime("%Y-%m-%dT%H:%M:%SZ")


def ts_epoch(at):
    return parse_ts(at).timestamp()


def now_ts():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
    for key in ("scenes", "images"):
        if not isinstance(data.get(key), dict):
            data[key] = {}
    return data


def save_data(data, auto_backup=True):
    if auto_backup:
        maybe_auto_backup(data["settings"])
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, DATA_FILE)


def data_bytes():
    return os.path.getsize(DATA_FILE) if os.path.exists(DATA_FILE) else 0


# ---------------------------------------------------------------- Backups

def backup_data(tag):
    """Copy the data file aside; returns the backup's name or None."""
    if not os.path.exists(DATA_FILE):
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = f"{DATA_FILE}.{tag}-{stamp}"
    path, n = base, 1
    while os.path.exists(path):  # several backups within one second
        n += 1
        path = f"{base}-{n}"
    shutil.copyfile(DATA_FILE, path)
    return os.path.basename(path)


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


def backup_path(name):
    """Full path of an existing backup; refuses anything else."""
    if not isinstance(name, str) or name not in {b["name"] for b in list_backups()}:
        raise OpError(f"no such backup: {name!r}")
    return os.path.join(DATA_DIR, name)


def prune_backups(tag, keep, protect=None):
    removed = 0
    for b in [b for b in list_backups() if b["tag"] == tag and b["name"] != protect][max(0, keep - (1 if protect else 0)):]:
        try:
            os.remove(os.path.join(DATA_DIR, b["name"]))
            removed += 1
        except OSError as err:
            log(f"could not remove backup {b['name']}: {err}")
    return removed


def maybe_auto_backup(settings):
    """Before a write: back up the current file if the newest automatic
    backup is older than the interval."""
    cfg = settings["backup"]
    if not cfg["auto"] or not os.path.exists(DATA_FILE):
        return None
    autos = [b for b in list_backups() if b["tag"] == "auto"]
    if autos and time.time() - autos[0]["mtime"] < cfg["intervalHours"] * 3600:
        return None
    name = backup_data("auto")
    prune_backups("auto", cfg["keep"], protect=name)
    return name


# ---------------------------------------------------------------- Settings

def _num(value, lo, hi, fallback):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return fallback
    if v != v or v < lo or v > hi:  # NaN or out of range
        return fallback
    return int(v) if float(v).is_integer() else v


def _bool(raw, key, fallback):
    v = raw.get(key)
    return v if isinstance(v, bool) else fallback


def merge_settings(raw):
    s = copy.deepcopy(DEFAULT_SETTINGS)
    if not isinstance(raw, dict):
        return s
    s["recordPosition"] = _bool(raw, "recordPosition", s["recordPosition"])
    s["imageSessions"] = _bool(raw, "imageSessions", s["imageSessions"])
    player = raw.get("player") if isinstance(raw.get("player"), dict) else {}
    for key in s["player"]:
        s["player"][key] = _bool(player, key, s["player"][key])
    backup = raw.get("backup") if isinstance(raw.get("backup"), dict) else {}
    d = DEFAULT_SETTINGS["backup"]
    s["backup"]["auto"] = _bool(backup, "auto", d["auto"])
    s["backup"]["intervalHours"] = _num(backup.get("intervalHours"), 1, 24 * 30, d["intervalHours"])
    s["backup"]["keep"] = int(_num(backup.get("keep"), 1, 100, d["keep"]))
    if isinstance(raw.get("ui"), dict):
        s["ui"] = raw["ui"]
    return s


# ---------------------------------------------------------------- Events

def arg_json(args, key, default=None):
    """Stash passes Map args as JSON objects; strings are accepted too."""
    v = args.get(key, default)
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            raise OpError(f"argument '{key}' is not valid JSON")
    return v


def require_id(args, key):
    v = args.get(key)
    if v in (None, "") or not str(v).isdigit():
        raise OpError(f"argument '{key}' must be a numeric id")
    return str(int(str(v)))


def require_ts(value, key):
    try:
        return norm_ts(value)
    except (ValueError, TypeError, OverflowError):
        raise OpError(f"argument '{key}' is not a valid timestamp: {value!r}")


def opt_seconds(value):
    """Video position / duration / view time: a non-negative number or None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v != v or v < 0 or v > MAX_SECONDS:
        return None
    return round(v, 2)


def scene_event(at, t, d, src):
    ev = {"at": at, "t": opt_seconds(t)}
    dur = opt_seconds(d)
    if dur:
        ev["d"] = dur
    ev["src"] = src if src in SCENE_SOURCES else "stash"
    return ev


def image_event(at, view, src):
    return {"at": at, "view": opt_seconds(view), "src": src if src in IMAGE_SOURCES else "stash"}


def sort_events(events):
    events.sort(key=lambda e: e["at"])
    return events


def upsert(events, ev):
    """Insert ev, replacing an event with the same timestamp."""
    out = [e for e in events if e["at"] != ev["at"]]
    out.append(ev)
    return sort_events(out)


def match_history(events, history):
    """Pair stored scene events with o_history entries.

    Exact timestamps match first; then the nearest unclaimed entry within
    MATCH_TOLERANCE seconds (older data rounded differently). Returns
    (kept events re-keyed to their entry, number dropped)."""
    hist = []
    for h in history or []:
        try:
            hist.append(norm_ts(h))
        except (ValueError, TypeError, OverflowError):
            continue
    free = set(hist)
    kept, pending = [], []
    for e in events:
        if e["at"] in free:
            free.discard(e["at"])
            kept.append(e)
        else:
            pending.append(e)
    for e in pending:
        t = ts_epoch(e["at"])
        best = min(free, key=lambda h: abs(ts_epoch(h) - t), default=None)
        if best is not None and abs(ts_epoch(best) - t) <= MATCH_TOLERANCE:
            free.discard(best)
            kept.append({**e, "at": best})
    return sort_events(kept), len(events) - len(kept)


def trim_images(events, o_counter):
    """An image cannot have more detailed Os than its o_counter: drop the newest."""
    n = max(0, int(o_counter))
    events = sort_events(list(events))
    return (events[:n], len(events) - n) if len(events) > n else (events, 0)


def counts(data):
    scenes = data["scenes"].values()
    images = data["images"].values()
    return {
        "scenes": sum(1 for v in scenes if v),
        "sceneOs": sum(len(v) for v in scenes),
        "timedOs": sum(1 for v in scenes for e in v if e.get("t") is not None),
        "images": sum(1 for v in images if v),
        "imageOs": sum(len(v) for v in images),
        "sessionOs": sum(1 for v in images for e in v if e.get("view") is not None),
    }


def set_list(data, kind, item_id, events):
    if events:
        data[kind][item_id] = events
    else:
        data[kind].pop(item_id, None)


# ---------------------------------------------------------------- Import

def convert_import(raw):
    """Accepts this plugin's export, its data file, and the older O-timestamp
    format ({"version": 2, "scenes": {id: [{seconds, createdAt, source}]}}).
    Returns {"scenes": {...}, "images": {...}, "settings": dict|None}."""
    if not isinstance(raw, dict):
        raise OpError("import data must be a JSON object")
    if raw.get("format") == FORMAT or raw.get("version") == DATA_VERSION and "images" in raw:
        out = {"scenes": {}, "images": {}, "settings": raw.get("settings") if isinstance(raw.get("settings"), dict) else None}
        for sid, events in (raw.get("scenes") or {}).items():
            if not str(sid).isdigit() or not isinstance(events, list):
                continue
            for e in events:
                if isinstance(e, dict):
                    try:
                        ev = scene_event(norm_ts(e.get("at")), e.get("t"), e.get("d"), e.get("src"))
                    except (ValueError, TypeError, OverflowError):
                        continue
                    out["scenes"].setdefault(str(int(sid)), []).append(ev)
        for iid, events in (raw.get("images") or {}).items():
            if not str(iid).isdigit() or not isinstance(events, list):
                continue
            for e in events:
                if isinstance(e, dict):
                    try:
                        ev = image_event(norm_ts(e.get("at")), e.get("view"), e.get("src"))
                    except (ValueError, TypeError, OverflowError):
                        continue
                    out["images"].setdefault(str(int(iid)), []).append(ev)
        return out
    if isinstance(raw.get("scenes"), dict) and "images" not in raw:
        out = {"scenes": {}, "images": {}, "settings": None}
        for sid, events in raw["scenes"].items():
            if not str(sid).isdigit() or not isinstance(events, list):
                continue
            for e in events:
                # Older entries without a position or creation time carry no detail.
                if not isinstance(e, dict) or opt_seconds(e.get("seconds")) is None or not e.get("createdAt"):
                    continue
                try:
                    ev = scene_event(norm_ts(e["createdAt"]), e["seconds"], None, "import")
                except (ValueError, TypeError, OverflowError):
                    continue
                out["scenes"].setdefault(str(int(sid)), []).append(ev)
        return out
    raise OpError("unrecognised import file: expected a Vibings Better Os export")


# ---------------------------------------------------------------- Operations

def op_ping(args):
    data = load_data()
    return {
        "ok": True,
        "version": VERSION,
        "dataVersion": DATA_VERSION,
        "counts": counts(data),
        "dataBytes": data_bytes(),
        "corruptBackups": sum(1 for b in list_backups() if b["tag"] == "corrupt"),
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
        combined = copy.deepcopy(data["settings"])
        for key, value in incoming.items():
            if key in MERGED_SETTINGS and isinstance(value, dict):
                combined[key] = {**combined.get(key, {}), **value}
            else:
                combined[key] = value
        data["settings"] = merge_settings(combined)
        save_data(data)
    return data["settings"]


def op_get_scene(args):
    sid = require_id(args, "sceneId")
    return {"sceneId": sid, "events": load_data()["scenes"].get(sid, [])}


def op_record_scene(args):
    """Add (or replace) the detail of one scene O."""
    sid = require_id(args, "sceneId")
    at = require_ts(args.get("at"), "at")
    with locked():
        data = load_data()
        events = upsert(data["scenes"].get(sid, []), scene_event(at, args.get("t"), args.get("d"), args.get("src")))
        set_list(data, "scenes", sid, events)
        save_data(data)
    return {"sceneId": sid, "events": events}


def op_clear_scene_time(args):
    """Forget the detail of one scene O; the O itself stays in Stash (classic)."""
    sid = require_id(args, "sceneId")
    at = require_ts(args.get("at"), "at")
    with locked():
        data = load_data()
        before = data["scenes"].get(sid, [])
        events = [e for e in before if e["at"] != at]
        if len(events) != len(before):
            set_list(data, "scenes", sid, events)
            save_data(data)
    return {"sceneId": sid, "events": events}


def op_sync_scene(args):
    """Drop details whose O is gone from the scene's o_history."""
    sid = require_id(args, "sceneId")
    history = arg_json(args, "history")
    if not isinstance(history, list):
        raise OpError("argument 'history' must be a list")
    with locked():
        data = load_data()
        before = data["scenes"].get(sid, [])
        events, removed = match_history(before, history)
        if events != before:
            set_list(data, "scenes", sid, events)
            save_data(data)
    return {"sceneId": sid, "events": events, "removed": removed}


def op_record_image(args):
    iid = require_id(args, "imageId")
    at = require_ts(args.get("at") or now_ts(), "at")
    o_counter = args.get("oCounter")
    with locked():
        data = load_data()
        events = upsert(data["images"].get(iid, []), image_event(at, args.get("view"), args.get("src")))
        if isinstance(o_counter, int) and not isinstance(o_counter, bool):
            events, _ = trim_images(events, o_counter)
        set_list(data, "images", iid, events)
        save_data(data)
    return {"imageId": iid, "events": events}


def op_sync_image(args):
    """After a decrement or reset in Stash: keep at most oCounter details.
    removeNewest (a decrement) also forgets the newest detail: Os with
    details are always newer than classic ones, so a decrement undoes one."""
    iid = require_id(args, "imageId")
    o_counter = args.get("oCounter")
    if not isinstance(o_counter, int) or isinstance(o_counter, bool) or o_counter < 0:
        raise OpError("argument 'oCounter' must be a non-negative integer")
    with locked():
        data = load_data()
        events = sort_events(list(data["images"].get(iid, [])))
        popped = 1 if args.get("removeNewest") is True and events else 0
        events, removed = trim_images(events[:len(events) - popped], o_counter)
        removed += popped
        if removed:
            set_list(data, "images", iid, events)
            save_data(data)
    return {"imageId": iid, "events": events, "removed": removed}


def op_get_all(args):
    data = load_data()
    return {"scenes": data["scenes"], "images": data["images"], "counts": counts(data)}


def op_export(args):
    data = load_data()
    return {
        "format": FORMAT,
        "version": DATA_VERSION,
        "pluginVersion": VERSION,
        "exportedAt": now_ts(),
        "settings": data["settings"],
        "scenes": data["scenes"],
        "images": data["images"],
    }


def op_import(args):
    """mode "merge" (default) adds to the current data, an imported detail
    replacing the current one for the same O; "replace" swaps everything.
    withSettings also takes the file's settings. A backup is made first."""
    incoming = convert_import(arg_json(args, "data"))
    mode = args.get("mode") or "merge"
    if mode not in ("merge", "replace"):
        raise OpError("argument 'mode' must be 'merge' or 'replace'")
    with locked():
        data = load_data()
        backup = backup_data("import")
        if mode == "replace":
            data["scenes"], data["images"] = {}, {}
        added = updated = 0
        for kind in ("scenes", "images"):
            for item_id, events in incoming[kind].items():
                current = data[kind].get(item_id, [])
                have = {e["at"] for e in current}
                for ev in events:
                    if ev["at"] in have:
                        updated += 1
                    else:
                        added += 1
                        have.add(ev["at"])
                    current = upsert(current, ev)
                set_list(data, kind, item_id, current)
        if args.get("withSettings") is True and incoming["settings"]:
            data["settings"] = merge_settings(incoming["settings"])
        save_data(data, auto_backup=False)
    return {"added": added, "updated": updated, "mode": mode, "backup": backup, "counts": counts(data)}


def op_db_info(args):
    data = load_data()
    backups = list_backups()
    return {
        "bytes": data_bytes(),
        "counts": counts(data),
        "backups": backups,
        "backupBytes": sum(b["bytes"] for b in backups),
        "ids": {"scenes": sorted(data["scenes"], key=int), "images": sorted(data["images"], key=int)},
    }


def op_backup_now(args):
    with locked():
        if not os.path.exists(DATA_FILE):
            save_data(load_data(), auto_backup=False)
        name = backup_data("manual")
    return {"backup": name, "backups": list_backups()}


def op_restore_backup(args):
    """Replace the data file with a backup; the current file is backed up first."""
    with locked():
        src = backup_path(args.get("name"))
        try:
            with open(src, "r", encoding="utf-8") as f:
                restored = json.load(f)
            if not isinstance(restored, dict) or restored.get("version") != DATA_VERSION:
                raise ValueError("unexpected data version")
        except (ValueError, OSError) as e:
            raise OpError(f"backup is not readable: {e}")
        safety = backup_data("restore")
        shutil.copyfile(src, DATA_FILE + ".tmp")
        os.replace(DATA_FILE + ".tmp", DATA_FILE)
        data = load_data()
    return {"restored": os.path.basename(src), "backup": safety, "counts": counts(data)}


def op_delete_backup(args):
    with locked():
        os.remove(backup_path(args.get("name")))
    return {"backups": list_backups()}


def op_compact(args):
    """Optimise the data file against Stash's current state.

    stash = {"scenes": {id: o_history | null}, "images": {id: o_counter | null}}
    (null = deleted from Stash). Details of deleted items and of Os that are
    gone are dropped, the rest is de-duplicated and sorted. keepBackups
    removes all but the newest N backups. A backup is made first."""
    stash = arg_json(args, "stash") or {}
    if not isinstance(stash, dict):
        raise OpError("argument 'stash' must be an object")
    scenes_state = stash.get("scenes") if isinstance(stash.get("scenes"), dict) else {}
    images_state = stash.get("images") if isinstance(stash.get("images"), dict) else {}
    keep = args.get("keepBackups")
    keep = None if keep is None else int(_num(keep, 0, 1000, 10))

    with locked():
        data = load_data()
        bytes_before = data_bytes()
        backup = backup_data("compact")
        before = counts(data)
        removed_items = 0
        for sid in list(data["scenes"]):
            if sid in scenes_state and scenes_state[sid] is None:
                del data["scenes"][sid]
                removed_items += 1
                continue
            events = {e["at"]: e for e in data["scenes"][sid]}.values()  # de-duplicate
            events = sort_events(list(events))
            if isinstance(scenes_state.get(sid), list):
                events, _ = match_history(events, scenes_state[sid])
            set_list(data, "scenes", sid, events)
        for iid in list(data["images"]):
            if iid in images_state and images_state[iid] is None:
                del data["images"][iid]
                removed_items += 1
                continue
            events = sort_events(list({e["at"]: e for e in data["images"][iid]}.values()))
            if isinstance(images_state.get(iid), int):
                events, _ = trim_images(events, images_state[iid])
            set_list(data, "images", iid, events)
        after = counts(data)
        save_data(data, auto_backup=False)

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
    return {
        "bytesBefore": bytes_before,
        "bytesAfter": data_bytes(),
        "removedItems": removed_items,
        "removedOs": before["sceneOs"] + before["imageOs"] - after["sceneOs"] - after["imageOs"],
        "removedBackups": removed_backups,
        "backup": backup if backup and os.path.exists(os.path.join(DATA_DIR, backup)) else None,
        "counts": after,
    }


def op_reset(args):
    """Forget every detail (Stash's Os are not touched). A backup is made first."""
    if args.get("confirm") is not True:
        raise OpError("reset needs confirm: true")
    with locked():
        data = load_data()
        backup = backup_data("manual")
        data["scenes"], data["images"] = {}, {}
        save_data(data, auto_backup=False)
    return {"backup": backup, "counts": counts(data)}


OPERATIONS = {
    "ping": op_ping,
    "get_settings": op_get_settings,
    "save_settings": op_save_settings,
    "get_scene": op_get_scene,
    "record_scene": op_record_scene,
    "clear_scene_time": op_clear_scene_time,
    "sync_scene": op_sync_scene,
    "record_image": op_record_image,
    "sync_image": op_sync_image,
    "get_all": op_get_all,
    "export": op_export,
    "import": op_import,
    "db_info": op_db_info,
    "backup_now": op_backup_now,
    "restore_backup": op_restore_backup,
    "delete_backup": op_delete_backup,
    "compact": op_compact,
    "reset": op_reset,
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
