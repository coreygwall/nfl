import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, props: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const Check = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);
export const Lock = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 018 0v3" />
  </svg>
);
export const ChevronLeft = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </svg>
);
export const ChevronRight = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </svg>
);
export const ChevronUp = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5.5 14.5L12 8l6.5 6.5" />
  </svg>
);
export const ChevronDown = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5.5 9.5L12 16l6.5-6.5" />
  </svg>
);
export const Grip = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={0} fill="currentColor">
    <circle cx="9" cy="6" r="1.7" />
    <circle cx="15" cy="6" r="1.7" />
    <circle cx="9" cy="12" r="1.7" />
    <circle cx="15" cy="12" r="1.7" />
    <circle cx="9" cy="18" r="1.7" />
    <circle cx="15" cy="18" r="1.7" />
  </svg>
);
export const Trophy = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M8 4h8v5a4 4 0 01-8 0V4z" />
    <path d="M8 6H5a3 3 0 003 3M16 6h3a3 3 0 01-3 3" />
    <path d="M12 13v4M8.5 20h7M10 17h4" />
  </svg>
);
export const Football = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5.5 18.5c-2-2-2-8 3-13s11-5 13-3-2 8-7 13-7 5-9 3z" />
    <path d="M8 16l8-8M10 13l1.5 1.5M13 10l1.5 1.5" />
  </svg>
);
export const House = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 11.2 12 4l8 7.2" />
    <path d="M6 10v9h12v-9" />
    <path d="M10 19v-5h4v5" />
  </svg>
);
export const Sun = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </svg>
);
export const Moon = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M20 15.2A8.5 8.5 0 018.8 4a8.5 8.5 0 1011.2 11.2z" />
  </svg>
);
export const Device = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="4" width="16" height="12" rx="2" />
    <path d="M9 20h6M12 16v4" />
  </svg>
);
export const User = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20c.9-3.5 3.7-5.4 7.2-5.4s6.3 1.9 7.2 5.4" />
  </svg>
);
export const Key = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="8" cy="8" r="3.8" />
    <path d="M10.7 10.7L20 20M17 17l-2 2M20 14l-2 2" />
  </svg>
);
export const Bank = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3.5 9.5L12 4.5l8.5 5M5.5 9.5v8M18.5 9.5v8M10 9.5v8M14 9.5v8M3.5 20.5h17" />
  </svg>
);
export const Palette = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17" />
  </svg>
);
export const CircleHelp = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.7 9a2.5 2.5 0 014.8.9c0 1.8-2.5 2.1-2.5 3.6M12 17.5h.01" />
  </svg>
);
export const Swap = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
);
export const X = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
/// An envelope, for the row that writes to Tally.
export const Mail = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </svg>
);
/// A shield, for the privacy row. Drawn rather than pulled in, the same as everything else here.
export const Shield = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3l7 3v5.5c0 4.2-2.9 7.9-7 9.5-4.1-1.6-7-5.3-7-9.5V6l7-3z" />
  </svg>
);
export const Pencil = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 20l4.5-1L19 8.5a2.1 2.1 0 00-3-3L5.5 16 4 20z" />
  </svg>
);
export const Flame = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3c1 3 4 4.5 4 9a4 4 0 01-8 0c0-1.5.5-2.5 1.5-3.5.2 1.2.8 2 1.8 2.5C12 8.5 11 6 12 3z" />
  </svg>
);
export const Sparkle = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
  </svg>
);
export const MoreHorizontal = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
export const LinkIcon = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M10 13a4 4 0 006 .5l2-2a4 4 0 00-5.7-5.7L11 7" />
    <path d="M14 11a4 4 0 00-6-.5l-2 2A4 4 0 0011.7 18l1.3-1.3" />
  </svg>
);
export const Rows = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const Cards = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </svg>
);
export const Share = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 4v11M8 8l4-4 4 4" />
    <path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
  </svg>
);
export const Megaphone = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 13V9l12-5v14L4 13z" />
    <path d="M16 8a4 4 0 010 6M7 14l1 6h4l-2-5" />
  </svg>
);

/** A flag on a stick: the hole you are standing on, and the Round tab of a golf card. */
export const Flag = ({ size = 20, ...p }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M6 21V3" />
    <path d="M6 4h11l-2.2 3.5L17 11H6" />
  </svg>
);

/** A square grid: the scorecard, hole by hole. */
export const Grid = ({ size = 20, ...p }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M9 4v16" />
  </svg>
);

/** A QR code, as a sign rather than a scannable thing: three finders and some noise. */
export const QrIcon = ({ size = 18, ...p }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM19 19h2M14 21h2M21 14v3" />
  </svg>
);
