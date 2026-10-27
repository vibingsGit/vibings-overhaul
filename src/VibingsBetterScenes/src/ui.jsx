// Small shared pieces: a dialog and an error box that keeps a failing part
// from taking the whole page down.

import { LOG } from "./api.js";
import { Icons } from "./icons.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

export function Dialog({ title, onClose, wide, children }) {
  React.useEffect(() => {
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  return PluginApi.ReactDOM.createPortal(
    <div className="vbs-modal-back" onClick={onClose}>
      <div className={"vbs-modal" + (wide ? " vbs-modal-wide" : "")} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="vbs-modal-head"><h4>{title}</h4><button type="button" className="vbs-icon-btn" onClick={onClose} aria-label="Close"><Icons.Close /></button></div>
        {children}
      </div>
    </div>,
    document.fullscreenElement || document.body
  );
}

export class SafeBox extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(LOG, error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="vbs-empty">{this.props.message || "This part is not available"}: {String(this.state.error.message || this.state.error)}</div>;
  }
}
