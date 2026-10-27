// Blacklist / whitelist editor for one category at a time. Works on the
// settings draft: `filters` is { category: { blacklist, whitelist, whitelistOn } }.

import { CATEGORIES, CATEGORY_BY_ID, searchItems } from "./api.js";
import { Icon, useItemMedia } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Form } = PluginApi.libraries.Bootstrap;
const { faBan, faCheck, faXmark } = PluginApi.libraries.FontAwesomeSolid;

const EMPTY = { blacklist: [], whitelist: [], whitelistOn: false };

function SmallThumb({ cat, item }) {
  const { image, fallback } = useItemMedia(cat, item, { thumb: true });
  return image
    ? <img className={`vb-thumb${cat.contain && !fallback ? " contain" : ""}`} src={image} alt="" loading="lazy" />
    : <div className="vb-thumb" />;
}

function Chips({ cat, list, onRemove, empty }) {
  if (!list.length) return <p className="vb-muted vb-help">{empty}</p>;
  return (
    <div className="vb-chips">
      {list.map((r) => (
        <span key={r.id} className="vb-chip">
          <a href={cat.href(r.id)} target="_blank" rel="noreferrer">{r.name || `#${r.id}`}</a>
          <button type="button" title="Remove" onClick={() => onRemove(r.id)}><Icon icon={faXmark} /></button>
        </span>
      ))}
    </div>
  );
}

export function FiltersEditor({ filters, onChange }) {
  const [catId, setCatId] = React.useState("scenes");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const cat = CATEGORY_BY_ID[catId];
  const f = { ...EMPTY, ...(filters?.[catId] || {}) };

  React.useEffect(() => {
    setResults([]);
    if (query.trim().length < 2) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const list = await searchItems(cat, query.trim());
        if (!cancelled) setResults(list);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, catId]);

  const update = (patch) => onChange({ ...(filters || {}), [catId]: { ...f, ...patch } });
  const without = (list, id) => list.filter((r) => String(r.id) !== String(id));
  // An item is on one list at a time.
  const add = (listName, item) => {
    const other = listName === "blacklist" ? "whitelist" : "blacklist";
    const entry = { id: String(item.id), name: cat.title(item) };
    update({ [listName]: [...without(f[listName], item.id), entry], [other]: without(f[other], item.id) });
  };
  const state = (id) =>
    f.blacklist.some((r) => String(r.id) === String(id)) ? "black" : f.whitelist.some((r) => String(r.id) === String(id)) ? "white" : null;
  const counts = (c) => {
    const x = filters?.[c.id];
    return x ? ` (${x.blacklist?.length || 0}/${x.whitelist?.length || 0}${x.whitelistOn ? ", whitelist on" : ""})` : "";
  };

  return (
    <div className="vb-filters">
      <div className="vb-row">
        <Form.Control as="select" value={catId} onChange={(e) => { setCatId(e.target.value); setQuery(""); }} style={{ width: "auto" }}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}{counts(c)}</option>)}
        </Form.Control>
        <Form.Check type="switch" id={`vb-whitelist-${catId}`} checked={f.whitelistOn}
          onChange={(e) => update({ whitelistOn: e.target.checked })} label="Whitelist only" />
      </div>
      <span className="vb-help">
        Blacklisted items never battle. With "Whitelist only" on, only whitelisted items battle in this category
        (performer lists also apply to the arena). The ⊘ button on a battle card blacklists that item.
      </span>

      <Form.Control className="vb-filter-search" type="search" placeholder={`Search ${cat.label.toLowerCase()}…`}
        value={query} onChange={(e) => setQuery(e.target.value)} />
      {searching && <p className="vb-muted vb-help">Searching…</p>}
      {results.length > 0 && (
        <div className="vb-search-results">
          {results.map((it) => {
            const st = state(it.id);
            return (
              <div key={it.id} className="vb-search-row">
                <SmallThumb cat={cat} item={it} />
                <span className="vb-search-name" title={cat.title(it)}>{cat.title(it)}</span>
                <Button size="sm" variant={st === "black" ? "danger" : "outline-danger"} title="Blacklist"
                  onClick={() => (st === "black" ? update({ blacklist: without(f.blacklist, it.id) }) : add("blacklist", it))}>
                  <Icon icon={faBan} />
                </Button>
                <Button size="sm" variant={st === "white" ? "success" : "outline-success"} title="Whitelist"
                  onClick={() => (st === "white" ? update({ whitelist: without(f.whitelist, it.id) }) : add("whitelist", it))}>
                  <Icon icon={faCheck} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="vb-filter-lists">
        <div>
          <div className="vb-side-heading">Blacklist ({f.blacklist.length})</div>
          <Chips cat={cat} list={f.blacklist} empty="Nothing blacklisted." onRemove={(id) => update({ blacklist: without(f.blacklist, id) })} />
        </div>
        <div>
          <div className="vb-side-heading">Whitelist ({f.whitelist.length}){!f.whitelistOn && f.whitelist.length > 0 ? " — off" : ""}</div>
          <Chips cat={cat} list={f.whitelist} empty="Nothing whitelisted." onRemove={(id) => update({ whitelist: without(f.whitelist, id) })} />
        </div>
      </div>
    </div>
  );
}
