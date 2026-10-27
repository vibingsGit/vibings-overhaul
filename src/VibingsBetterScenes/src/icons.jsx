// Inline SVG icons (stroke icons follow the text colour).

const PluginApi = window.PluginApi;
const React = PluginApi.React;

function Svg({ children, size = "1em", fill = "none", stroke = "currentColor", ...rest }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="vbs-icon" {...rest}>
      {children}
    </svg>
  );
}

const solid = { fill: "currentColor", stroke: "none" };

export const Icons = {
  Play: (p) => <Svg {...p} {...solid}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" /></Svg>,
  Pause: (p) => <Svg {...p} {...solid}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></Svg>,
  Prev: (p) => <Svg {...p} {...solid}><path d="M18 5v14a1 1 0 0 1-1.6.8L8 13v6H6V5h2v6l8.4-6.8A1 1 0 0 1 18 5z" /></Svg>,
  Next: (p) => <Svg {...p} {...solid}><path d="M6 5v14a1 1 0 0 0 1.6.8L16 13v6h2V5h-2v6L7.6 4.2A1 1 0 0 0 6 5z" /></Svg>,
  Back: (p) => <Svg {...p}><path d="M11 17l-5-5 5-5" /><path d="M18 17l-5-5 5-5" /></Svg>,
  Forward: (p) => <Svg {...p}><path d="M13 17l5-5-5-5" /><path d="M6 17l5-5-5-5" /></Svg>,
  Volume: (p) => <Svg {...p}><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></Svg>,
  VolumeLow: (p) => <Svg {...p}><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></Svg>,
  Mute: (p) => <Svg {...p}><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" /><path d="M22 9l-6 6M16 9l6 6" /></Svg>,
  Expand: (p) => <Svg {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></Svg>,
  Shrink: (p) => <Svg {...p}><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" /></Svg>,
  Theater: (p) => <Svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 15h20" /></Svg>,
  Pip: (p) => <Svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="11" width="8" height="7" rx="1" fill="currentColor" stroke="none" /></Svg>,
  Gear: (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>,
  Loop: (p) => <Svg {...p}><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></Svg>,
  List: (p) => <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>,
  Queue: (p) => <Svg {...p}><path d="M3 6h12M3 12h12M3 18h8" /><path d="M17 15l5 3-5 3z" fill="currentColor" stroke="none" /></Svg>,
  Drop: (p) => <Svg {...p} {...solid}><path d="M12 2.5c-.4 0-.8.2-1 .6C9.3 6 5.5 11 5.5 15a6.5 6.5 0 0 0 13 0c0-4-3.8-9-5.5-11.9-.2-.4-.6-.6-1-.6z" /></Svg>,
  Plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  Close: (p) => <Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>,
  Trash: (p) => <Svg {...p}><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2" /></Svg>,
  Up: (p) => <Svg {...p}><path d="M18 15l-6-6-6 6" /></Svg>,
  Down: (p) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>,
  Shuffle: (p) => <Svg {...p}><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></Svg>,
  Repeat: (p) => <Svg {...p}><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></Svg>,
  Star: (p) => <Svg {...p} {...solid}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></Svg>,
  StarOff: (p) => <Svg {...p}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></Svg>,
  Check: (p) => <Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>,
  Eye: (p) => <Svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Svg>,
  Link: (p) => <Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>,
  Info: (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></Svg>,
  Keyboard: (p) => <Svg {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></Svg>,
  Trophy: (p) => <Svg {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></Svg>,
  Chart: (p) => <Svg {...p}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></Svg>,
  Copy: (p) => <Svg {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>,
  External: (p) => <Svg {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></Svg>,
  Clock: (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Svg>,
  Bookmark: (p) => <Svg {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Svg>,
  Sliders: (p) => <Svg {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></Svg>,
  File: (p) => <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></Svg>,
  Camera: (p) => <Svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></Svg>,
  FrameBack: (p) => <Svg {...p}><path d="M6 5v14" /><path d="M18 6l-8 6 8 6z" fill="currentColor" stroke="none" /></Svg>,
  FrameForward: (p) => <Svg {...p}><path d="M18 5v14" /><path d="M6 6l8 6-8 6z" fill="currentColor" stroke="none" /></Svg>,
  Moon: (p) => <Svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>,
  Flame: (p) => <Svg {...p}><path d="M12 2c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.2 1-3.6 2-4.5 0 1.5.8 2.6 2 3 0-3.5-1-6 1-9z" /></Svg>,
  Pencil: (p) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>,
  Save: (p) => <Svg {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></Svg>,
  Group: (p) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>,
  Panel: (p) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></Svg>,
};
