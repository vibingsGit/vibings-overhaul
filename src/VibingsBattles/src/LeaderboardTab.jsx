// Leaderboard tab: ranked items per category, with an item detail modal.

import { backend, fetchItemsSafe, CATEGORY_BY_ID } from "./api.js";
import { Icon, CategoryPills, StatCard, describeEntry, formatDelta, formatStreak, timeAgo, winRate } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Modal, Form } = PluginApi.libraries.Bootstrap;
const { faUpRightFromSquare } = PluginApi.libraries.FontAwesomeSolid;

const PAGE_SIZE = 50;

const SORTS = {
  rating: { label: "Elo", fn: (a, b) => b.rating - a.rating },
  battles: { label: "Battles", fn: (a, b) => b.battles - a.battles || b.rating - a.rating },
  winrate: { label: "Win %", fn: (a, b) => (winRate(b) ?? -1) - (winRate(a) ?? -1) || b.battles - a.battles },
  recent: { label: "Last battled", fn: (a, b) => String(b.lastBattled || "").localeCompare(String(a.lastBattled || "")) },
};

function Thumb({ cat, item }) {
  const src = item ? (cat.thumb || cat.image)(item) : null;
  return src ? <img className={`vb-thumb${cat.contain ? " contain" : ""}`} src={src} alt="" loading="lazy" /> : <div className="vb-thumb" />;
}

function ItemModal({ cat, itemId, stashItem, onClose }) {
  const [item, setItem] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    backend("get_item", { category: cat.id, id: itemId })
      .then((out) => !cancelled && setItem(out))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [cat.id, itemId]);

  const name = item?.name || (stashItem && cat.title(stashItem)) || `#${itemId}`;
  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <p className="vb-error">{error}</p>}
        {!item && !error && <p className="vb-muted">Loading…</p>}
        {item && (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
              {stashItem && (
                <img
                  src={cat.image(stashItem)}
                  alt=""
                  style={{ width: 160, maxHeight: 220, objectFit: cat.contain ? "contain" : "cover", borderRadius: 8 }}
                />
              )}
              <div className="vb-cards" style={{ flex: 1, marginBottom: 0 }}>
                <StatCard label="Elo" value={Math.round(item.rating)} note={item.bonus ? `${formatDelta(item.bonus)} from performer bonus` : null} />
                <StatCard label="Stash rating" value={item.rating100 ?? "–"} />
                <StatCard label="W-L-D" value={`${item.wins}-${item.losses}-${item.draws}`} note={`${winRate(item) ?? "–"}% win rate`} />
                <StatCard label="Streak" value={formatStreak(item.streak)} note={`Best ${item.bestStreak}W · worst ${item.worstStreak}L`} />
                <StatCard label="Skipped" value={item.skips} />
                <StatCard label="First battle" value={timeAgo(item.firstBattled)} />
              </div>
            </div>
            <h5>Recent battles</h5>
            {item.recent.length === 0 ? (
              <p className="vb-muted">No battles yet{item.bonus ? " (rating comes from the performer bonus)" : ""}.</p>
            ) : (
              <table className="vb-table">
                <tbody>
                  {item.recent.map((e) => {
                    const d = describeEntry(e, itemId);
                    const delta = e.delta?.[e.a === itemId ? 0 : 1];
                    return (
                      <tr key={e.seq} style={{ cursor: "default" }}>
                        <td className="vb-muted">{timeAgo(e.ts)}</td>
                        <td className="vb-name">{d.text}</td>
                        <td>{d.outcome}</td>
                        <td className={`vb-num ${delta > 0 ? "vb-up" : delta < 0 ? "vb-down" : ""}`}>
                          {e.result === "skip" ? "" : formatDelta(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <a className="btn btn-secondary" href={cat.href(itemId)} target="_blank" rel="noreferrer">
          <Icon icon={faUpRightFromSquare} /> Open in Stash
        </a>
        <Button variant="primary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

export function LeaderboardTab({ active, refreshKey, notifyError }) {
  const [catId, setCatId] = React.useState(null);
  const [ranked, setRanked] = React.useState(null); // category -> ranked item count
  const [items, setItems] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [minBattles, setMinBattles] = React.useState(0);
  const [sort, setSort] = React.useState("rating");
  const [page, setPage] = React.useState(0);
  const [stashItems, setStashItems] = React.useState(new Map());
  const [selected, setSelected] = React.useState(null);

  // Ranked counts per category; also picks the busiest category by default.
  React.useEffect(() => {
    if (!active) return;
    backend("summary", { tzOffset: new Date().getTimezoneOffset() })
      .then((s) => {
        const counts = Object.fromEntries(Object.entries(s.categories).map(([k, v]) => [k, v.items]));
        setRanked(counts);
        setCatId((cur) => cur || Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "scenes");
      })
      .catch((e) => notifyError("Could not load summary", e));
  }, [active, refreshKey]);

  React.useEffect(() => {
    if (!active || !catId) return;
    let cancelled = false;
    backend("get_items", { category: catId })
      .then((list) => !cancelled && setItems(list || []))
      .catch((e) => notifyError("Could not load leaderboard", e));
    return () => { cancelled = true; };
  }, [active, catId, refreshKey]);

  const cat = catId ? CATEGORY_BY_ID[catId] : null;
  const rankOf = React.useMemo(() => new Map((items || []).map((it, i) => [it.id, i + 1])), [items]);

  const visible = React.useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => it.battles >= minBattles && (!q || (it.name || "").toLowerCase().includes(q)))
      .sort(SORTS[sort].fn);
  }, [items, query, minBattles, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageKey = pageItems.map((it) => it.id).join(",");

  React.useEffect(() => { setPage(0); }, [catId, query, minBattles, sort]);

  // Thumbnails and titles for the visible page come from Stash.
  React.useEffect(() => {
    if (!cat || !pageItems.length) return;
    let cancelled = false;
    fetchItemsSafe(cat, pageItems.map((it) => it.id))
      .then(({ items: found }) => !cancelled && setStashItems(found))
      .catch((e) => console.warn("[Vibings Battles] thumbnails failed", e));
    return () => { cancelled = true; };
  }, [catId, pageKey]);

  if (!active) return null;

  return (
    <div>
      <CategoryPills value={catId} ranked={ranked || {}} onChange={(id) => { setItems(null); setStashItems(new Map()); setCatId(id); }} />
      <div className="vb-toolbar">
        <Form.Control placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 220 }} />
        <Form.Control as="select" value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
        </Form.Control>
        <Form.Control as="select" value={minBattles} onChange={(e) => setMinBattles(Number(e.target.value))}>
          {[0, 1, 3, 5, 10, 20].map((n) => <option key={n} value={n}>{n ? `${n}+ battles` : "All ranked"}</option>)}
        </Form.Control>
        <span className="vb-muted">{visible.length} items</span>
      </div>

      {!items && <div className="vb-status vb-muted">Loading…</div>}
      {items && items.length === 0 && <div className="vb-status vb-muted">No ranked {cat?.label.toLowerCase()} yet. Start battling!</div>}
      {items && items.length > 0 && (
        <div className="vb-scroll">
          <table className="vb-table">
            <thead>
              <tr>
                <th>#</th>
                <th />
                <th>Name</th>
                <th className="vb-num">Elo</th>
                <th className="vb-num">Rating</th>
                <th className="vb-num">W-L-D</th>
                <th className="vb-num">Win %</th>
                <th className="vb-num">Streak</th>
                <th>Last battle</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((it) => {
                const stashItem = stashItems.get(String(it.id));
                const rank = rankOf.get(it.id);
                return (
                  <tr key={it.id} onClick={() => setSelected({ id: it.id, stashItem })}>
                    <td className={`vb-rank${rank <= 3 ? " top" : ""}`}>{rank}</td>
                    <td><Thumb cat={cat} item={stashItem} /></td>
                    <td className="vb-name" title={it.name}>
                      {(stashItem && cat.title(stashItem)) || it.name || `#${it.id}`}
                      {it.bonus ? <span className="vb-muted"> · bonus {formatDelta(it.bonus)}</span> : null}
                    </td>
                    <td className="vb-num">{Math.round(it.rating)}</td>
                    <td className="vb-num">{it.rating100 ?? "–"}</td>
                    <td className="vb-num">{it.wins}-{it.losses}-{it.draws}</td>
                    <td className="vb-num">{winRate(it) ?? "–"}</td>
                    <td className="vb-num">{formatStreak(it.streak)}</td>
                    <td className="vb-muted">{timeAgo(it.lastBattled)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="vb-pager">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="vb-muted">Page {page + 1} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {selected && cat && (
        <ItemModal cat={cat} itemId={selected.id} stashItem={selected.stashItem} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
