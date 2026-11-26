import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 20, p: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
})

export const LogoMark = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 19 L10 13 L14 16 L20 7" />
    <path d="M15 7 H20 V12" />
  </svg>
)
export const ArrowRight = ({ size, ...p }: P) => (
  <svg {...base(size ?? 18, p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
export const Sparkle = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
  </svg>
)
export const Sparkles = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
  </svg>
)
export const UserIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
)
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size ?? 16, p)} strokeWidth={2.2}>
    <path d="M5 12l5 5 9-10" />
  </svg>
)
export const Plus = ({ size, ...p }: P) => (
  <svg {...base(size ?? 18, p)} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const Search = ({ size, ...p }: P) => (
  <svg {...base(size ?? 16, p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
)
export const Chat = ({ size, ...p }: P) => (
  <svg {...base(size ?? 18, p)}>
    <path d="M4 5h16v11H8l-4 4z" />
  </svg>
)
export const Lock = ({ size, ...p }: P) => (
  <svg {...base(size ?? 16, p)}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)
export const Trash = ({ size, ...p }: P) => (
  <svg {...base(size ?? 16, p)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
)
export const Menu = ({ size, ...p }: P) => (
  <svg {...base(size ?? 22, p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)
export const Grad = ({ size, ...p }: P) => (
  <svg {...base(size ?? 28, p)} strokeWidth={1.8}>
    <path d="M2 9l10-5 10 5-10 5z" />
    <path d="M6 11v5c3 2 9 2 12 0v-5" />
  </svg>
)
export const Briefcase = ({ size, ...p }: P) => (
  <svg {...base(size ?? 28, p)} strokeWidth={1.8}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
)
export const Building = ({ size, ...p }: P) => (
  <svg {...base(size ?? 28, p)} strokeWidth={1.8}>
    <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" />
  </svg>
)
export const Globe = ({ size, ...p }: P) => (
  <svg {...base(size ?? 18, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12h8" />
  </svg>
)
