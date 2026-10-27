// Small shared components and formatters.

import { fetchFallbackMedia, isPlaceholder } from "./api.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Modal } = PluginApi.libraries.Bootstrap;

export function Icon({ icon, className }) {
  return <PluginApi.components.Icon icon={icon} className={className} />;
}

/**
 * { image, video } for an item: its own media, or — when Stash only has a
 * placeholder — a picture from the item's library (scenes, images).
 * `thumb` prefers the category's small thumbnail.
 */
export function useItemMedia(cat, item, { thumb = false } = {}) {
  const own = item ? ((thumb && cat.thumb) || cat.image)(item) : null;
  const ownVideo = item ? cat.video?.(item) : null;
  const needsFallback = !!item && !!cat.fallback && isPlaceholder(own);
  const [fallback, setFallback] = React.useState(null);

  React.useEffect(() => {
    setFallback(null);
    if (!needsFallback) return undefined;
    let cancelled = false;
    fetchFallbackMedia(cat, item.id).then((m) => !cancelled && setFallback(m));
    return () => { cancelled = true; };
  }, [cat.id, item?.id, needsFallback]);

  if (needsFallback && fallback) return { image: fallback.image, video: fallback.video, fallback: true };
  return { image: own, video: ownVideo, fallback: false };
}

export function formatDelta(d) {
  const r = Math.round(d);
  return r > 0 ? `+${r}` : String(r);
}

export function timeAgo(iso) {
  if (!iso) return "–";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function formatStreak(streak) {
  if (!streak) return "–";
  return streak > 0 ? `${streak}W` : `${-streak}L`;
}

export function winRate(it) {
  return it.battles ? Math.round(((it.wins + it.draws / 2) / it.battles) * 100) : null;
}

/** Text for a log entry from the point of view of `itemId` (or neutral). */
export function describeEntry(e, itemId) {
  const aName = e.aName || `#${e.a}`;
  const bName = e.bName || `#${e.b}`;
  if (e.result === "skip") return { text: `${aName} vs ${bName}`, outcome: "Skipped" };
  if (e.result === "draw") return { text: `${aName} vs ${bName}`, outcome: "Draw" };
  const winner = e.result === "a" ? aName : bName;
  const loser = e.result === "a" ? bName : aName;
  if (itemId == null) return { text: `${winner} beat ${loser}`, outcome: "" };
  const won = (e.result === "a" && e.a === itemId) || (e.result === "b" && e.b === itemId);
  return { text: `vs ${e.a === itemId ? bName : aName}`, outcome: won ? "Won" : "Lost" };
}

export function ConfirmModal({ show, title, children, confirmLabel = "Confirm", variant = "danger", busy, onConfirm, onCancel }) {
  return (
    <Modal show={show} onHide={busy ? undefined : onCancel} centered>
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{children}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button variant={variant} disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</Button>
      </Modal.Footer>
    </Modal>
  );
}

export function StatCard({ label, value, note }) {
  return (
    <div className="vb-statcard">
      <div className="vb-label">{label}</div>
      <div className="vb-value">{value}</div>
      {note && <div className="vb-note" title={note}>{note}</div>}
    </div>
  );
}
