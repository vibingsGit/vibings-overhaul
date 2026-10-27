#!/usr/bin/env python3
"""
Vibings Scene Heatmap backend (data format v1).

Stash runs this script for every runPluginOperation call (interface: raw).
Input on stdin:  {"server_connection": {...}, "args": {"operation": "...", ...}}
Output on stdout: {"output": <result>} or {"error": "<message>"}

Design:
- Per scene, the video is split into BINS equal parts; each part holds the
  seconds that were watched in it (rewatching counts again, skipped parts
  stay low). The curve on the timeline is these values, smoothed and scaled
  to the highest one.
- The player sends watched segments ([start, end] in video seconds); they
  are spread over the bins they cover.
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
FORMAT = "vibings-scene-heatmap"
DATA_DIR = os.environ.get("VIBINGS_SCENE_HEATMAP_DATA_DIR") or os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DATA_DIR, "vibings-scene-heatmap-data.json")
LOCK_FILE = DATA_FILE + ".lock"

BINS = 200
BACKUP_TAGS = ("auto", "manual", "restore", "compact", "import", "corrupt")
SHOW = ("hover", "always")
MAX_SECONDS = 24 * 3600  # sanity limit for a video length

DEFAULT_SETTINGS = {
    "enabled": True,  # record watched parts
    "native": True,  # show the curve on Stash's own player
    "show": "hover",  # "hover": over the timeline while the pointer is on the controls; "always"
    "height": 36,  # curve height in pixels
    "smoothing": 3,  # neighbouring bins averaged on each side
    "backup": {
        "auto": True,
        "intervalHours": 24,
        "keep": 10,
    },
}
MERGED_SETTINGS = ("backup",)


class OpError(Exception):
    """Error that is reported back to the UI as a GraphQL error."""


def log(msg):
    print(f"[Vibings Scene Heatmap] {msg}", file=sys.stderr)


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


# ---------------------------------------------------------------- Storage

def default_data():
    return {"version": DATA_VERSION, "settings": copy.deepcopy(DEFAULT_SETTINGS), "scenes": {}}


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
    if not isinstance(data.get("scenes"), dict):
        data["scenes"] = {}
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


def merge_settings(raw, base=None):
    """Valid values from raw; anything missing or invalid comes from base
    (the current settings) or the defaults."""
    s = copy.deepcopy(base if isinstance(base, dict) else DEFAULT_SETTINGS)
    if not isinstance(raw, dict):
        return s
    s["enabled"] = _bool(raw, "enabled", s["enabled"])
    s["native"] = _bool(raw, "native", s["native"])
    if raw.get("show") in SHOW:
        s["show"] = raw["show"]
    s["height"] = int(_num(raw.get("height"), 12, 80, s["height"]))
    s["smoothing"] = int(_num(raw.get("smoothing"), 0, 10, s["smoothing"]))
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


def seconds(value):
    if isinstance(value, bool):
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v != v or v < 0 or v > MAX_SECONDS:
        return None
    return v


def add_segment(bins, duration, start, end):
    """Spread the watched seconds of [start, end] over the bins it covers."""
    if duration <= 0 or end <= start:
        return 0.0
    start, end = max(0.0, start), min(duration, end)
    if end <= start:
        return 0.0
    width = duration / len(bins)
    i = int(start // width)
    added = 0.0
    while i < len(bins) and i * width < end:
        lo, hi = max(start, i * width), min(end, (i + 1) * width)
        if hi > lo:
            bins[i] = round(bins[i] + (hi - lo), 3)
            added += hi - lo
        i += 1
    return added


def rescale(bins, new_len):
    """Bins of another length (the video file changed): spread proportionally."""
    out = [0.0] * new_len
    if not bins:
        return out
    for i, v in enumerate(bins):
        pos = (i + 0.5) / len(bins)
        out[min(new_len - 1, int(pos * new_len))] += v
    return [round(v, 3) for v in out]


def scene_row(data, sid, duration=None):
    row = data["scenes"].get(sid)
    if row is None or not isinstance(row.get("bins"), list) or len(row["bins"]) != BINS:
        row = {"d": duration or 0, "bins": rescale((row or {}).get("bins") or [], BINS), "w": (row or {}).get("w", 0)}
        data["scenes"][sid] = row
    if duration and abs(row.get("d", 0) - duration) > 1:
        row["d"] = duration  # bins stay as parts of the video
    return row


def counts(data):
    scenes = data["scenes"].values()
    return {"scenes": len(data["scenes"]), "seconds": round(sum(r.get("w", 0) for r in scenes), 1)}


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
        data["settings"] = merge_settings(combined, base=data["settings"])
        save_data(data)
    return data["settings"]


def op_get_scene(args):
    sid = scene_id(args.get("sceneId"))
    row = load_data()["scenes"].get(sid)
    return {"sceneId": sid, "d": row.get("d", 0) if row else 0, "w": row.get("w", 0) if row else 0, "bins": row["bins"] if row else None}


def op_get_scenes(args):
    """Several scenes at once: {ids: [...]} -> {id: {d, w, bins}}."""
    ids = arg_json(args, "ids")
    if not isinstance(ids, list):
        raise OpError("argument 'ids' must be a list")
    data = load_data()
    return {scene_id(i): data["scenes"].get(scene_id(i)) for i in ids if data["scenes"].get(scene_id(i))}


def op_record(args):
    """{scenes: {id: {d: duration, segments: [[start, end], ...]}}}"""
    incoming = arg_json(args, "scenes")
    if not isinstance(incoming, dict):
        raise OpError("argument 'scenes' must be an object keyed by scene id")
    with locked():
        data = load_data()
        total = 0.0
        for raw_id, v in incoming.items():
            sid = scene_id(raw_id)
            if not isinstance(v, dict):
                continue
            d = seconds(v.get("d"))
            if not d:
                continue
            row = scene_row(data, sid, d)
            for seg in v.get("segments") or []:
                if not isinstance(seg, (list, tuple)) or len(seg) != 2:
                    continue
                a, b = seconds(seg[0]), seconds(seg[1])
                if a is None or b is None:
                    continue
                added = add_segment(row["bins"], row["d"], a, b)
                row["w"] = round(row.get("w", 0) + added, 2)
                total += added
        save_data(data)
    return {"added": round(total, 2), "counts": counts(data)}


def op_clear_scene(args):
    sid = scene_id(args.get("sceneId"))
    with locked():
        data = load_data()
        if data["scenes"].pop(sid, None) is not None:
            save_data(data)
    return {"counts": counts(data)}


def op_export(args):
    data = load_data()
    return {"format": FORMAT, "version": DATA_VERSION, "pluginVersion": VERSION, "exportedAt": now_ts(), "bins": BINS, "scenes": data["scenes"]}


def op_import(args):
    """mode "merge" adds the imported seconds to the current ones; "replace" swaps all."""
    raw = arg_json(args, "data")
    if not isinstance(raw, dict) or raw.get("format") != FORMAT or not isinstance(raw.get("scenes"), dict):
        raise OpError("unrecognised import file: expected a Vibings Scene Heatmap export")
    mode = args.get("mode") or "merge"
    if mode not in ("merge", "replace"):
        raise OpError("argument 'mode' must be 'merge' or 'replace'")
    with locked():
        data = load_data()
        backup = backup_data("import")
        if mode == "replace":
            data["scenes"] = {}
        n = 0
        for raw_id, r in raw["scenes"].items():
            if not str(raw_id).isdigit() or not isinstance(r, dict) or not isinstance(r.get("bins"), list):
                continue
            bins = rescale([seconds(x) or 0 for x in r["bins"]], BINS)
            row = scene_row(data, scene_id(raw_id), seconds(r.get("d")) or 0)
            row["bins"] = [round(a + b, 3) for a, b in zip(row["bins"], bins)]
            row["w"] = round(row.get("w", 0) + (seconds(r.get("w")) or sum(bins)), 2)
            n += 1
        save_data(data, auto_backup=False)
    return {"scenes": n, "mode": mode, "backup": backup, "counts": counts(data)}


def op_db_info(args):
    data = load_data()
    backups = list_backups()
    return {
        "bytes": data_bytes(),
        "counts": counts(data),
        "backups": backups,
        "backupBytes": sum(b["bytes"] for b in backups),
        "ids": sorted(data["scenes"], key=int),
    }


def op_backup_now(args):
    with locked():
        if not os.path.exists(DATA_FILE):
            save_data(load_data(), auto_backup=False)
        name = backup_data("manual")
    return {"backup": name, "backups": list_backups()}


def op_restore_backup(args):
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
    """existing = {id: true | false} (false = deleted from Stash): rows of
    deleted scenes and empty rows go; keepBackups keeps the newest N backups."""
    existing = arg_json(args, "existing") or {}
    if not isinstance(existing, dict):
        raise OpError("argument 'existing' must be an object")
    gone = {scene_id(k) for k, v in existing.items() if v is False}
    keep = args.get("keepBackups")
    keep = None if keep is None else int(_num(keep, 0, 1000, 10))
    with locked():
        data = load_data()
        before = data_bytes()
        backup = backup_data("compact")
        removed = 0
        for sid in list(data["scenes"]):
            row = data["scenes"][sid]
            if sid in gone or not any(row.get("bins") or []):
                del data["scenes"][sid]
                removed += 1
        save_data(data, auto_backup=False)
        removed_backups = 0
        if keep is not None:
            ordered = sorted(list_backups(), key=lambda b: b["name"] != backup)
            for b in ordered[keep:]:
                try:
                    os.remove(os.path.join(DATA_DIR, b["name"]))
                    removed_backups += 1
                except OSError as err:
                    log(f"could not remove backup {b['name']}: {err}")
    return {"bytesBefore": before, "bytesAfter": data_bytes(), "removedRows": removed, "removedBackups": removed_backups, "counts": counts(data)}


def op_reset(args):
    if args.get("confirm") is not True:
        raise OpError("reset needs confirm: true")
    with locked():
        data = load_data()
        backup = backup_data("manual")
        data["scenes"] = {}
        save_data(data, auto_backup=False)
    return {"backup": backup, "counts": counts(data)}


OPERATIONS = {
    "ping": op_ping,
    "get_settings": op_get_settings,
    "save_settings": op_save_settings,
    "get_scene": op_get_scene,
    "get_scenes": op_get_scenes,
    "record": op_record,
    "clear_scene": op_clear_scene,
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
