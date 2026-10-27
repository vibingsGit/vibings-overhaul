// Shared components, charts and formatters.

import { useDataset, load } from "./store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button } = PluginApi.libraries.Bootstrap;
const { faRotateRight } = PluginApi.libraries.FontAwesomeSolid;

export function Icon({ icon, className }) {
  return <PluginApi.components.Icon icon={icon} className={className} />;
}

// ---------------------------------------------------------------- Formatters

export const fmtNumber = (v) => (v == null ? "–" : Number(v).toLocaleString());

export function fmtBytes(bytes) {
  if (bytes == null) return "–";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = Number(bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Seconds as "3 d 4 h", "2 h 15 min" or "12 min". */
export function fmtDuration(seconds) {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}

export const fmtPct = (part, total, digits = 0) =>
  part == null || !total ? "–" : `${((part / total) * 100).toFixed(digits)}%`;

export function fmtDate(value) {
  if (!value) return "–";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

export function timeAgo(value) {
  if (!value) return "–";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} h ago`;
  const days = Math.floor(hr / 24);
  if (days < 60) return `${days} d ago`;
  return fmtDate(value);
}

const ROUTES = { scenes: "/scenes", images: "/images", galleries: "/galleries", groups: "/groups", performers: "/performers", studios: "/studios", tags: "/tags" };
export const itemHref = (entity, id) => `${ROUTES[entity]}/${id}`;

/** A list page of Stash filtered by a criterion, e.g. scenes missing a studio. */
export function filterHref(entity, criterion) {
  return `${ROUTES[entity]}?c=${encodeURIComponent(JSON.stringify(criterion))}`;
}

// ---------------------------------------------------------------- Cards and panels

function Skeleton({ rows = 4 }) {
  return (
    <div className="vs-skel-rows">
      {Array.from({ length: rows }, (_, i) => <span key={i} className="vs-skel vs-skel-row" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

/** Loading / error / freshness of a dataset, for panel headers. */
export function DatasetState({ name, ds }) {
  if (ds.loading) {
    const p = ds.progress;
    return <span className="vs-panel-state"><span className="vs-spin" />{p && p.total ? `${Math.round((p.done / p.total) * 100)}%` : ds.data ? "Updating" : "Loading"}</span>;
  }
  if (ds.error) {
    return (
      <span className="vs-panel-state">
        <span className="vs-error" title={ds.error}>Failed</span>
        <Button size="sm" variant="link" className="p-0" onClick={() => load(name, { force: true }).catch(() => {})}>Retry</Button>
      </span>
    );
  }
  return null;
}

/**
 * A panel showing data from one dataset. `children(data)` renders once the
 * dataset has arrived; until then a skeleton keeps the layout stable.
 */
export function Panel({ title, dataset, span = 6, rows = 4, extra, children }) {
  const ds = useDataset(dataset);
  return (
    <section className={`vs-panel vs-span-${span}`}>
      <div className="vs-panel-head">
        <h3>{title}</h3>
        {extra}
        <DatasetState name={dataset} ds={ds} />
      </div>
      {ds.data ? <div className="vs-fade">{children(ds.data)}</div> : ds.error ? <p className="vs-empty">Could not load: {ds.error}</p> : (
        <>
          <Skeleton rows={rows} />
          {ds.progress?.total ? <div className="vs-progress"><div style={{ width: `${(ds.progress.done / ds.progress.total) * 100}%` }} /></div> : null}
        </>
      )}
    </section>
  );
}

export function StatCard({ label, value, note, hero, href, loading }) {
  const body = (
    <>
      <div className="vs-card-label">{label}</div>
      {loading ? <span className="vs-skel vs-skel-value" /> : <div className="vs-card-value vs-fade" title={typeof value === "string" ? value : undefined}>{value}</div>}
      {!loading && note && <div className="vs-card-note" title={typeof note === "string" ? note : undefined}>{note}</div>}
    </>
  );
  const cls = `vs-card${hero ? " hero" : ""}`;
  return href ? <a className={cls} href={href}>{body}</a> : <div className={cls}>{body}</div>;
}

/** Cards that all come from one dataset: cards(data) -> [{ label, value, note, href }]. */
export function DatasetCards({ dataset, count, cards }) {
  const ds = useDataset(dataset);
  const list = ds.data ? cards(ds.data) : Array.from({ length: count }, (_, i) => ({ label: "", key: i }));
  return (
    <div className="vs-cards">
      {list.map((c, i) => <StatCard key={c.label || i} {...c} loading={!ds.data} />)}
    </div>
  );
}

export function Toggle({ options, value, onChange }) {
  return (
    <span className="vs-toggle">
      {options.map(([v, label]) => (
        <button key={v} type="button" className={v === value ? "active" : ""} onClick={() => onChange(v)}>{label}</button>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- Charts

/** Horizontal bars: data = [{ label, value, id? }]; `entity` makes labels links. */
export function Bars({ data, format = fmtNumber, entity, ranked, empty = "No data", max }) {
  const rows = (data || []).filter((d) => d.value != null);
  if (!rows.length || rows.every((d) => !d.value)) return <p className="vs-empty">{empty}</p>;
  const top = max ?? Math.max(...rows.map((d) => d.value));
  return (
    <div className="vs-bars">
      {rows.map((d, i) => (
        <div key={`${d.label ?? d.name}-${i}`} className="vs-bar-row">
          <span className="vs-bar-label" title={d.label ?? d.name}>
            {ranked && <span className="vs-rank">{i + 1}.</span>}
            {entity && d.id ? <a href={itemHref(entity, d.id)}>{d.label ?? d.name}</a> : d.label ?? d.name}
          </span>
          <span className="vs-bar-track"><span className="vs-bar-fill" style={{ width: `${top ? (d.value / top) * 100 : 0}%`, display: "block" }} /></span>
          <span className="vs-bar-value">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical columns for a series: data = [{ label, value }]. */
export function Columns({ data, format = fmtNumber, labelFormat = (l) => l }) {
  if (!data?.length) return <p className="vs-empty">No data</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="vs-chart-max">max {format(max)}</div>
      <div className="vs-cols">
        {data.map((d) => (
          <div key={d.label} className="vs-col">
            <div style={{ height: `${(d.value / max) * 100}%` }} />
            <span className="vs-col-tip">{labelFormat(d.label)}: {format(d.value)}</span>
          </div>
        ))}
      </div>
      <div className="vs-col-axis"><span>{labelFormat(data[0].label)}</span><span>{labelFormat(data[data.length - 1].label)}</span></div>
    </div>
  );
}

const SPLIT_COLORS = ["#f5a623", "#58a6ff", "#3fb950", "#d2a8ff", "#f85149", "#79c0ff", "#ffa657", "#8b949e"];

/** One bar split into shares, with a legend. */
export function Split({ data, format = fmtNumber }) {
  const rows = (data || []).filter((d) => d.value > 0);
  const total = rows.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="vs-empty">No data</p>;
  return (
    <>
      <div className="vs-split">
        {rows.map((d, i) => <div key={d.label} style={{ width: `${(d.value / total) * 100}%`, background: SPLIT_COLORS[i % SPLIT_COLORS.length] }} title={`${d.label}: ${format(d.value)}`} />)}
      </div>
      <div className="vs-legend">
        {rows.map((d, i) => (
          <span key={d.label}><i style={{ background: SPLIT_COLORS[i % SPLIT_COLORS.length] }} />{d.label} <b>{fmtPct(d.value, total)}</b> <span className="vs-muted">({format(d.value)})</span></span>
        ))}
      </div>
    </>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday × hour heatmap. grid[weekday][hour] = count. */
export function Heatmap({ grid, unit }) {
  const max = Math.max(0, ...grid.flat());
  if (!max) return <p className="vs-empty">No history yet</p>;
  return (
    <div className="vs-heat" role="img" aria-label={`${unit} by weekday and hour`}>
      <span />
      {Array.from({ length: 24 }, (_, h) => <span key={h} className="vs-heat-hour">{h % 6 === 0 ? h : ""}</span>)}
      {grid.map((row, d) => (
        <React.Fragment key={d}>
          <span className="vs-heat-day">{WEEKDAYS[d]}</span>
          {row.map((v, h) => (
            <span key={h} className="vs-heat-cell" style={{ opacity: v ? 0.15 + (v / max) * 0.85 : 0.06 }}
              title={`${WEEKDAYS[d]} ${String(h).padStart(2, "0")}:00 — ${v} ${unit}`} />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

/** Share of items that have something (1 - missing / total). */
export function Meter({ label, have, total, href }) {
  const pct = total ? (have / total) * 100 : 0;
  const cls = pct >= 80 ? "good" : pct >= 40 ? "mid" : "bad";
  return (
    <div className="vs-meter-row">
      <span className="vs-bar-label" title={label}>{href ? <a href={href}>{label}</a> : label}</span>
      <span className="vs-bar-track"><span className={`vs-bar-fill ${cls}`} style={{ width: `${pct}%`, display: "block" }} /></span>
      <span className="vs-bar-value">{total ? `${Math.round(pct)}%` : "–"}</span>
    </div>
  );
}

/** Key/value list: rows = [[label, value]]. */
export function KeyValues({ rows }) {
  return (
    <dl className="vs-kv">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
      ))}
    </dl>
  );
}

export function RefreshButton({ onClick, busy, label = "Refresh" }) {
  return (
    <Button size="sm" variant="secondary" disabled={busy} onClick={onClick}>
      <Icon icon={faRotateRight} className={busy ? "fa-spin" : undefined} /> {label}
    </Button>
  );
}
