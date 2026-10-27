#!/usr/bin/env python3
"""
Vibings Play Tracking Fix backend (data format v1).

Stash runs this script for every runPluginOperation call (interface: raw).
Input on stdin:  {"server_connection": {...}, "args": {"operation": "...", ...}}
Output on stdout: {"output": <result>} or {"error": "<message>"}

Design:
- Stash stays the source of truth for play counts, play history and play
  time. This file keeps what Stash cannot tell apart:
  * installedAt: when tracking by this plugin started. Plays dated before it
    are "earlier" (pre-plugin) plays.
  * scenes: play time and plays this plugin has saved per scene, so the
    earlier play time is a scene's play_duration minus this plugin's part.
  * estimates: estimated earlier play counts kept apart from Stash's own
    counts (the "hybrid" mode).
  * originals: the earlier play history of each scene whose play count was
    replaced with an estimate (the "replace" mode), so it can be undone.
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
FORMAT = "vibings-play-tracking"
DATA_DIR = os.environ.get("VIBINGS_PLAY_TRACKING_DATA_DIR") or os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DATA_DIR, "vibings-play-tracking-data.json")
LOCK_FILE = DATA_FILE + ".lock"

BACKUP_TAGS = ("auto", "manual", "restore", "compact", "estimate", "corrupt")
ROUNDING = ("nearest", "down", "up")
MAX_SECONDS = 7 * 24 * 3600  # sanity limit for one save of play time
MAX_PLAYS = 100000  # sanity limit for one estimated count

DEFAULT_SETTINGS = {
    # Track play time and plays (off = Stash's own tracking is used).
    "enabled": True,
    # Share of the video (percent) that must play in one viewing to count a play.
    "minPercent": 25,
    "estimate": {
        "rounding": "nearest",  # how earlier play time / length is rounded
        "skipWithoutTime": True,  # leave scenes without earlier play time as they are
    },
    "backup": {
        "auto": True,
        "intervalHours": 24,
        "keep": 10,  # automatic backups to keep
    },
}
MERGED_SETTINGS = ("estimate", "backup")


class OpError(Exception):
    """Error that is reported back to the UI as a GraphQL error."""


def log(msg):
    print(f"[Vibings Play Tracking Fix] {msg}", file=sys.stderr)


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
    """Canonical form, the same Stash uses for play history: 2026-10-24T10:10:10Z."""
    return parse_ts(value).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_ts():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def require_ts(value, key):
    try:
        return norm_ts(value)
    except (ValueError, TypeError, OverflowError):
        raise OpError(f"argument '{key}' is not a valid timestamp: {value!r}")


# ---------------------------------------------------------------- Storage

def default_data():
    return {
        "version": DATA_VERSION,
        "installedAt": now_ts(),
        "settings": copy.deepcopy(DEFAULT_SETTINGS),
        "scenes": {},
        "estimates": {},
        "estimate": None,  # {"at", "rounding"} of the last hybrid/replace run
        "originals": {},
    }


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
    for key in ("scenes", "estimates", "originals"):
        if not isinstance(data.get(key), dict):
            data[key] = {}
    try:
        data["installedAt"] = norm_ts(data.get("installedAt"))
    except (ValueError, TypeError, OverflowError):
        data["installedAt"] = now_ts()
    if not isinstance(data.get("estimate"), dict):
        data["estimate"] = None
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


def ensure_data():
    """The data file, created on first use so installedAt stays fixed."""
    if os.path.exists(DATA_FILE):
        return load_data()
    with locked():
        data = load_data()
        if not os.path.exists(DATA_FILE):
            save_data(data, auto_backup=False)
    return data


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


def merge_settings(raw, base=None):
    """Valid values from raw; anything missing or invalid comes from base
    (the current settings) or the defaults."""
    s = copy.deepcopy(base if isinstance(base, dict) else DEFAULT_SETTINGS)
    if not isinstance(raw, dict):
        return s
    s["enabled"] = _bool(raw, "enabled", s["enabled"])
    s["minPercent"] = _num(raw.get("minPercent"), 0, 100, s["minPercent"])
    est = raw.get("estimate") if isinstance(raw.get("estimate"), dict) else {}
    if est.get("rounding") in ROUNDING:
        s["estimate"]["rounding"] = est["rounding"]
    s["estimate"]["skipWithoutTime"] = _bool(est, "skipWithoutTime", s["estimate"]["skipWithoutTime"])
    backup = raw.get("backup") if isinstance(raw.get("backup"), dict) else {}
    d = s["backup"]
    s["backup"]["auto"] = _bool(backup, "auto", d["auto"])
    s["backup"]["intervalHours"] = _num(backup.get("intervalHours"), 1, 24 * 30, d["intervalHours"])
    s["backup"]["keep"] = int(_num(backup.get("keep"), 1, 100, d["keep"]))
    return s


# ---------------------------------------------------------------- Helpers

def arg_json(args, key, default=None):
    """Stash passes Map args as JSON objects; strings are accepted too."""
    v = args.get(key, default)
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            raise OpError(f"argument '{key}' is not valid JSON")
    return v


def scene_id(value):
    if value in (None, "") or not str(value).isdigit():
        raise OpError(f"not a numeric scene id: {value!r}")
    return str(int(str(value)))


def id_map(args, key):
    v = arg_json(args, key)
    if not isinstance(v, dict):
        raise OpError(f"argument '{key}' must be an object keyed by scene id")
    return {scene_id(k): val for k, val in v.items()}


def history_list(value):
    """A play history: valid timestamps, newest first."""
    if not isinstance(value, list):
        raise OpError("a play history must be a list of timestamps")
    out = []
    for h in value:
        try:
            out.append(norm_ts(h))
        except (ValueError, TypeError, OverflowError):
            continue
    return sorted(out, reverse=True)


def mode(data):
    if data["originals"]:
        return "replace"
    if data["estimates"]:
        return "hybrid"
    return None


def counts(data):
    scenes = data["scenes"].values()
    return {
        "scenes": len(data["scenes"]),
        "seconds": round(sum(v.get("s", 0) for v in scenes), 2),
        "plays": sum(v.get("p", 0) for v in scenes),
        "estimatedScenes": len(data["estimates"]),
        "estimatedPlays": sum(data["estimates"].values()),
        "replacedScenes": len(data["originals"]),
    }


def summary(data):
    return {
        "installedAt": data["installedAt"],
        "mode": mode(data),
        "estimate": data["estimate"],
        "counts": counts(data),
    }


# ---------------------------------------------------------------- Operations

def op_ping(args):
    data = ensure_data()
    return {
        "ok": True,
        "version": VERSION,
        "dataVersion": DATA_VERSION,
        **summary(data),
        "dataBytes": data_bytes(),
        "corruptBackups": sum(1 for b in list_backups() if b["tag"] == "corrupt"),
        "python": sys.version.split()[0],
    }


def op_get_settings(args):
    return ensure_data()["settings"]


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
        data["settings"] = merge_settings(combined, base=data["settings"])
        save_data(data)
    return data["settings"]


def op_get_all(args):
    data = ensure_data()
    return {
        **summary(data),
        "settings": data["settings"],
        "scenes": data["scenes"],
        "estimates": data["estimates"],
        # Earlier play counts before the replacement, per scene.
        "originals": {sid: len(o.get("history", [])) for sid, o in data["originals"].items()},
    }


def op_get_scene(args):
    """One scene: this plugin's play time and plays, its estimate and original."""
    sid = scene_id(args.get("sceneId"))
    data = ensure_data()
    original = data["originals"].get(sid)
    return {
        "sceneId": sid,
        "installedAt": data["installedAt"],
        "mode": mode(data),
        "tracked": data["scenes"].get(sid, {"s": 0, "p": 0}),
        "estimate": data["estimates"].get(sid),
        "originalPlays": len(original["history"]) if original else None,
    }


def op_record(args):
    """Add play time and plays saved by the tracker: {scenes: {id: {s, p}}}."""
    incoming = id_map(args, "scenes")
    with locked():
        data = load_data()
        for sid, v in incoming.items():
            if not isinstance(v, dict):
                continue
            s = _num(v.get("s"), 0, MAX_SECONDS, 0)
            p = int(_num(v.get("p"), 0, 1000, 0))
            if not s and not p:
                continue
            row = data["scenes"].setdefault(sid, {"s": 0, "p": 0})
            row["s"] = round(row.get("s", 0) + s, 2)
            row["p"] = row.get("p", 0) + p
        save_data(data)
    return summary(data)


def op_set_installed_at(args):
    """When tracking by this plugin started; plays before it are earlier plays."""
    at = require_ts(args.get("at"), "at")
    with locked():
        data = load_data()
        if data["originals"]:
            raise OpError("undo the replaced play counts before changing the start date")
        data["installedAt"] = at
        save_data(data)
    return summary(data)


def op_set_estimates(args):
    """Hybrid mode: keep estimated earlier play counts apart from Stash's counts."""
    incoming = id_map(args, "estimates")
    with locked():
        data = load_data()
        if data["originals"]:
            raise OpError("undo the replaced play counts before using the hybrid mode")
        backup = backup_data("estimate")
        data["estimates"] = {sid: int(_num(n, 0, MAX_PLAYS, 0)) for sid, n in incoming.items() if int(_num(n, 0, MAX_PLAYS, 0)) > 0}
        data["estimate"] = {"at": now_ts(), "rounding": data["settings"]["estimate"]["rounding"], "mode": "hybrid"}
        save_data(data, auto_backup=False)
    return {**summary(data), "backup": backup}


def op_clear_estimates(args):
    with locked():
        data = load_data()
        backup = backup_data("estimate")
        data["estimates"] = {}
        if not data["originals"]:
            data["estimate"] = None
        save_data(data, auto_backup=False)
    return {**summary(data), "backup": backup}


def op_save_originals(args):
    """Replace mode, before Stash is changed: keep each scene's earlier play
    history. A scene that already has an original keeps it (the first one is
    the real one). Clears hybrid estimates."""
    incoming = id_map(args, "scenes")
    with locked():
        data = load_data()
        backup = backup_data("estimate")
        stamp = now_ts()
        added = 0
        for sid, history in incoming.items():
            if sid in data["originals"]:
                continue
            data["originals"][sid] = {"history": history_list(history), "at": stamp}
            added += 1
        data["estimates"] = {}
        data["estimate"] = {"at": stamp, "rounding": data["settings"]["estimate"]["rounding"], "mode": "replace"}
        save_data(data, auto_backup=False)
    return {**summary(data), "added": added, "backup": backup}


def op_get_originals(args):
    data = ensure_data()
    ids = arg_json(args, "ids")
    if isinstance(ids, list):
        wanted = {scene_id(i) for i in ids}
        return {sid: o for sid, o in data["originals"].items() if sid in wanted}
    return data["originals"]


def op_drop_originals(args):
    """After undo restored these scenes in Stash."""
    ids = arg_json(args, "ids")
    if not isinstance(ids, list):
        raise OpError("argument 'ids' must be a list")
    with locked():
        data = load_data()
        for sid in {scene_id(i) for i in ids}:
            data["originals"].pop(sid, None)
        if not data["originals"] and not data["estimates"]:
            data["estimate"] = None
        save_data(data)
    return summary(data)


def op_db_info(args):
    data = ensure_data()
    backups = list_backups()
    ids = set(data["scenes"]) | set(data["estimates"]) | set(data["originals"])
    return {
        **summary(data),
        "bytes": data_bytes(),
        "backups": backups,
        "backupBytes": sum(b["bytes"] for b in backups),
        "ids": sorted(ids, key=int),
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
    return {"restored": os.path.basename(src), "backup": safety, **summary(data)}


def op_delete_backup(args):
    with locked():
        os.remove(backup_path(args.get("name")))
    return {"backups": list_backups()}


def op_compact(args):
    """Optimise the data file. existing = {id: true | false} for every stored
    scene id (false = deleted from Stash). Rows of deleted scenes are dropped
    (their replaced history too: there is nothing left to undo), empty rows
    removed. keepBackups removes all but the newest N backups. A backup is
    made first."""
    existing = arg_json(args, "existing") or {}
    if not isinstance(existing, dict):
        raise OpError("argument 'existing' must be an object")
    gone = {scene_id(k) for k, v in existing.items() if v is False}
    keep = args.get("keepBackups")
    keep = None if keep is None else int(_num(keep, 0, 1000, 10))

    with locked():
        data = load_data()
        bytes_before = data_bytes()
        backup = backup_data("compact")
        removed = 0
        for key in ("scenes", "estimates", "originals"):
            for sid in list(data[key]):
                if sid in gone:
                    del data[key][sid]
                    removed += 1
        for sid in list(data["scenes"]):
            row = data["scenes"][sid]
            if not row.get("s") and not row.get("p"):
                del data["scenes"][sid]
                removed += 1
            else:
                data["scenes"][sid] = {"s": round(row.get("s", 0), 2), "p": int(row.get("p", 0))}
        if not data["originals"] and not data["estimates"]:
            data["estimate"] = None
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
        "removedRows": removed,
        "removedBackups": removed_backups,
        "backup": backup if backup and os.path.exists(os.path.join(DATA_DIR, backup)) else None,
        **summary(data),
    }


def op_reset(args):
    """Forget this plugin's play time and estimates (Stash is not touched).
    Refused while replaced play counts can still be undone."""
    if args.get("confirm") is not True:
        raise OpError("reset needs confirm: true")
    with locked():
        data = load_data()
        if data["originals"]:
            raise OpError("undo the replaced play counts first")
        backup = backup_data("manual")
        data["scenes"], data["estimates"], data["estimate"] = {}, {}, None
        save_data(data, auto_backup=False)
    return {"backup": backup, **summary(data)}


OPERATIONS = {
    "ping": op_ping,
    "get_settings": op_get_settings,
    "save_settings": op_save_settings,
    "get_all": op_get_all,
    "get_scene": op_get_scene,
    "record": op_record,
    "set_installed_at": op_set_installed_at,
    "set_estimates": op_set_estimates,
    "clear_estimates": op_clear_estimates,
    "save_originals": op_save_originals,
    "get_originals": op_get_originals,
    "drop_originals": op_drop_originals,
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
