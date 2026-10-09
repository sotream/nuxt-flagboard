/**
 * The icon set: 16 px grid, 1.5 px stroke, round caps and joins (set once by `AppIcon`). Only shapes live here; colour
 * comes from `currentColor`. Shared brand shapes: the pole and swallowtail pennant (flag) and the split (rollout).
 */
export const ICON_PATHS = {
  flag: '<path d="M3.5 2v12.5"/><path d="M3.5 3h8.5l-2 2.75 2 2.75H3.5"/>',
  projects:
    '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  key: '<circle cx="5.5" cy="10.5" r="2.75"/><path d="M7.5 8.5l6-6"/><path d="M11.5 4.5L13 6"/><path d="M9.5 6.5L11 8"/>',
  audit: '<path d="M3.5 4h.01M3.5 8h.01M3.5 12h.01"/><path d="M6.5 4h7M6.5 8h7M6.5 12h4.5"/>',
  kill: '<path d="M8 2v5.5"/><path d="M4.7 4.6a5.5 5.5 0 1 0 6.6 0"/>',
  sun: '<circle cx="8" cy="8" r="2.75"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>',
  moon: '<path d="M13 9.6A5.5 5.5 0 1 1 6.4 3a4.4 4.4 0 0 0 6.6 6.6z"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  chevron: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-1A1.5 1.5 0 0 0 9 3H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 11h1.5"/>',
  warning: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.75v3"/><path d="M8 11.6h.01"/>',
  user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.5-2.5 2.5-4 5-4s4.5 1.5 5 4"/>',
  logout:
    '<path d="M6.5 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2.5"/><path d="M10 5l3 3-3 3M13 8H6"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  archive:
    '<rect x="2.5" y="3" width="11" height="3" rx="1"/><path d="M3.5 6v6.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6M6.5 9h3"/>',
  live: '<circle cx="8" cy="8" r="1.5"/><path d="M4.75 4.75a4.6 4.6 0 0 0 0 6.5M11.25 4.75a4.6 4.6 0 0 1 0 6.5"/>',
  rollout: '<rect x="2.5" y="5.5" width="11" height="5" rx="1.5"/><path d="M8 5.5v5"/>',
  layers:
    '<path d="M2.5 5L8 2.5 13.5 5 8 7.5z"/><path d="M2.5 8L8 10.5 13.5 8M2.5 11L8 13.5 13.5 11"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;
