import type { ResourceId } from "@revolt/rules";

// Code-drawn placeholder icons (GDD §7). Purely decorative: labels come from i18n.
const PATHS: Readonly<Record<ResourceId, string>> = {
  food: '<path d="M12 21V9" stroke="#5d4a1f" stroke-width="2"/><ellipse cx="12" cy="7" rx="3" ry="5" fill="#e3c25a"/><ellipse cx="7.5" cy="11" rx="2.5" ry="4" transform="rotate(-30 7.5 11)" fill="#d6b24a"/><ellipse cx="16.5" cy="11" rx="2.5" ry="4" transform="rotate(30 16.5 11)" fill="#d6b24a"/>',
  materiel: '<rect x="3" y="10" width="18" height="10" rx="1.5" fill="#7a5a32"/><rect x="3" y="10" width="18" height="3" fill="#5f4425"/><rect x="10" y="4" width="4" height="8" fill="#8f9298"/>',
  funds: '<circle cx="12" cy="12" r="8.5" fill="#f2d65c" stroke="#a88a2a" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#a88a2a" stroke-width="1.6"/>',
  support: '<circle cx="8" cy="8" r="3.2" fill="#e8d9c0"/><circle cx="16" cy="8" r="3.2" fill="#e8d9c0"/><path d="M2.5 20c0-4 2.5-6.5 5.5-6.5s5.5 2.5 5.5 6.5z" fill="#c9a46a"/><path d="M10.5 20c0-4 2.5-6.5 5.5-6.5s5.5 2.5 5.5 6.5z" fill="#b5402f"/>',
};

export const resourceIcon = (id: ResourceId): string =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[id]}</svg>`;
