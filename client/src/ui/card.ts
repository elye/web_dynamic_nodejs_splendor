import type { Card, Noble, GemColor, GemCost } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';

type CardSize = 'sz-md' | 'sz-sm' | 'sz-xs';

interface CardOptions {
  size?: CardSize;
  interactive?: boolean;
  affordable?: boolean;
  selected?: boolean;
  onClick?: (card: Card) => void;
}

interface NobleTileOptions {
  showRequirementNumbers?: boolean;
}

const RGBA_BY_COLOR: Record<GemColor, string> = {
  white: 'rgba(240,237,224,0.34)',
  blue: 'rgba(79,163,209,0.34)',
  green: 'rgba(90,171,109,0.34)',
  red: 'rgba(217,79,79,0.34)',
  black: 'rgba(50,50,50,0.38)',
};

function buildRequirementOverlayLayers(cost: GemCost): string[] {
  const layers: string[] = [];
  const used = GEM_COLORS.filter((color) => cost[color] > 0);

  if (used.length === 0) {
    return ['radial-gradient(circle at 50% 78%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.06) 62%, rgba(0,0,0,0.12) 100%)'];
  }

  for (const color of used) {
    const amount = cost[color];
    const index = GEM_COLORS.indexOf(color);
    const x = 16 + ((index * 17 + amount * 7) % 70);
    const y = 70 + ((amount * 6 + index * 5) % 20);
    const r = 18 + amount * 4;
    layers.push(`radial-gradient(circle at ${x}% ${y}%, ${RGBA_BY_COLOR[color]} 0%, rgba(0,0,0,0) ${r}%)`);
  }

  return layers;
}

function getCardBackgroundLayers(card: Card): string[] {
  const reqOverlay = buildRequirementOverlayLayers(card.cost);
  const artUrl = `/images/cards/tier${card.tier}_${card.bonus}.png`;
  return [
    'linear-gradient(rgba(255,255,255,0.05), rgba(20,12,6,0.18))',
    ...reqOverlay,
    `url("${artUrl}")`,
  ];
}

function getNobleArtUrl(noble: Noble): string {
  const match = noble.id.match(/(\d+)$/);
  const suffix = match ? match[1].padStart(2, '0') : '01';
  return `/images/noble/Noble${suffix}.png`;
}

// ─── Splendor card element ────────────────────────────────────────────────────

export function renderCard(card: Card, opts: CardOptions = {}): HTMLElement {
  const { size = 'sz-md', interactive = false, affordable = true, selected = false, onClick } = opts;

  const el = document.createElement('div');
  el.className = `splendor-card tier-${card.tier} ${size}${interactive ? ' interactive' : ''}${!affordable ? ' unaffordable' : ''}${selected ? ' selected' : ''}`;
  el.dataset.cardId = card.id;
  const backgroundLayers = getCardBackgroundLayers(card);
  const lastIndex = backgroundLayers.length - 1;
  el.style.backgroundImage = backgroundLayers.join(', ');
  el.style.backgroundSize = backgroundLayers.map((_, i) => (i === lastIndex ? '100% 100%' : 'auto')).join(', ');
  el.style.backgroundPosition = backgroundLayers.map(() => 'center').join(', ');
  el.style.backgroundRepeat = backgroundLayers.map(() => 'no-repeat').join(', ');
  el.style.backgroundBlendMode = backgroundLayers.map((_, i) => (i === 0 ? 'soft-light' : 'normal')).join(', ');

  // Header: VP + bonus gem dot
  const header = document.createElement('div');
  header.className = 'card-header';

  const vp = document.createElement('span');
  vp.className = `card-vp${card.points === 0 ? ' zero' : ''}`;
  vp.textContent = String(card.points);

  const bonusDot = document.createElement('div');
  bonusDot.className = `card-bonus ${card.bonus}`;

  header.appendChild(vp);
  header.appendChild(bonusDot);
  el.appendChild(header);

  // Cost rows
  const costEl = document.createElement('div');
  costEl.className = 'card-cost';

  for (const color of GEM_COLORS) {
    const n = card.cost[color];
    if (n === 0) continue;

    const row = document.createElement('div');
    row.className = 'card-cost-row';

    const pip = document.createElement('div');
    pip.className = `card-cost-pip ${color}`;

    const num = document.createElement('span');
    num.className = 'cost-num';
    num.textContent = String(n);

    row.appendChild(pip);
    row.appendChild(num);
    costEl.appendChild(row);
  }

  el.appendChild(costEl);

  if (interactive && onClick) {
    el.addEventListener('click', () => onClick(card));
  }

  return el;
}

// ─── Deck placeholder element ─────────────────────────────────────────────────

export function renderDeckPlaceholder(
  tier: 1 | 2 | 3,
  count: number,
  size: 'sz-md' | 'sz-sm' = 'sz-md',
  interactive = false,
  onClick?: () => void,
): HTMLElement {
  const el = document.createElement('div');
  el.className = `deck-placeholder tier-${tier} ${size}${interactive && count > 0 ? ' interactive' : ''}`;

  const countEl = document.createElement('div');
  countEl.className = 'deck-count';
  countEl.textContent = count > 0 ? String(count) : '—';

  const label = document.createElement('div');
  label.className = 'deck-label';
  label.textContent = `Tier ${tier}`;

  el.appendChild(countEl);
  el.appendChild(label);

  if (interactive && count > 0 && onClick) {
    el.addEventListener('click', onClick);
  }

  return el;
}

// ─── Noble tile element ────────────────────────────────────────────────────────

export function renderNobleTile(
  noble: Noble,
  size: 'sz-md' | 'sz-sm' = 'sz-md',
  opts: NobleTileOptions = {},
): HTMLElement {
  const { showRequirementNumbers = true } = opts;
  const el = document.createElement('div');
  el.className = `noble-tile ${size}`;
  const nobleArtUrl = getNobleArtUrl(noble);
  el.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.12), rgba(0,0,0,0.26)), url("${nobleArtUrl}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';

  const vp = document.createElement('div');
  vp.className = 'noble-vp';
  vp.textContent = String(noble.points);

  const req = document.createElement('div');
  req.className = 'noble-req';

  for (const color of GEM_COLORS) {
    const n = noble.requirement[color];
    if (n === 0) continue;

    const pip = document.createElement('div');
    pip.className = `card-cost-pip ${color}`;

    if (showRequirementNumbers) {
      const row = document.createElement('div');
      row.className = 'noble-req-row';

      const num = document.createElement('span');
      num.className = 'noble-req-num';
      num.textContent = String(n);

      row.appendChild(pip);
      row.appendChild(num);
      req.appendChild(row);
    } else {
      req.appendChild(pip);
    }
  }

  el.appendChild(vp);
  el.appendChild(req);

  return el;
}

// ─── Gem token element ────────────────────────────────────────────────────────

type GemColorOrGold = GemColor | 'gold';
type TokenSize = 'sz-lg' | 'sz-md' | 'sz-sm';

export function renderGemToken(
  color: GemColorOrGold,
  count?: number,
  size: TokenSize = 'sz-md',
  opts: { clickable?: boolean; selected?: boolean; disabled?: boolean; onClick?: () => void } = {},
): HTMLElement {
  const el = document.createElement('div');
  el.className = `gem-token ${color} ${size}${opts.clickable ? ' clickable' : ''}${opts.selected ? ' selected' : ''}`;
  if (opts.disabled) el.dataset.disabled = 'true';
  if (count !== undefined) el.textContent = String(count);

  if (opts.clickable && !opts.disabled && opts.onClick) {
    el.addEventListener('click', opts.onClick);
  }

  return el;
}
