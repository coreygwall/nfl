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
