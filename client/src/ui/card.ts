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

// ─── Splendor card element ────────────────────────────────────────────────────

export function renderCard(card: Card, opts: CardOptions = {}): HTMLElement {
  const { size = 'sz-md', interactive = false, affordable = true, selected = false, onClick } = opts;

  const el = document.createElement('div');
  el.className = `splendor-card tier-${card.tier} ${size}${interactive ? ' interactive' : ''}${!affordable ? ' unaffordable' : ''}${selected ? ' selected' : ''}`;
  el.dataset.cardId = card.id;

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

export function renderNobleTile(noble: Noble, size: 'sz-md' | 'sz-sm' = 'sz-md'): HTMLElement {
  const el = document.createElement('div');
  el.className = `noble-tile ${size}`;

  const vp = document.createElement('div');
  vp.className = 'noble-vp';
  vp.textContent = String(noble.points);

  const req = document.createElement('div');
  req.className = 'noble-req';

  for (const color of GEM_COLORS) {
    const n = noble.requirement[color];
    for (let i = 0; i < n; i++) {
      const pip = document.createElement('div');
      pip.className = `card-cost-pip ${color}`;
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
