import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACTIVE_CARD_IDS, CARDS, IMPLEMENTED_CARDS } from '../core/cards';
import { CardTile } from './CardTile';
import { Glyph, MAP_LEGEND } from './icons';

describe('UI visual vocabulary', () => {
  it('renders the formal elbow card and preserves 24 distinct legacy drawings', () => {
    expect(ACTIVE_CARD_IDS).toEqual(['laoda_elbow']);
    expect(CARDS.laoda_elbow.name).toBe('牢大肘击');
    expect(IMPLEMENTED_CARDS).toHaveLength(24);
    const ids = [...ACTIVE_CARD_IDS, ...IMPLEMENTED_CARDS];
    const drawings = ids.map(id => {
      const html = renderToStaticMarkup(<CardTile card={{ id, instanceId: id }} onInspect={() => {}} />);
      expect(html).toContain(CARDS[id].name);
      expect(html).toContain(CARDS[id].detail);
      expect(html).toContain(`rarity-${CARDS[id].rarity}`);
      expect(html).toContain('<svg');
      expect(html).not.toMatch(/🍌|🎁|❄|♛/);
      return renderToStaticMarkup(<Glyph name={id} />);
    });
    expect(new Set(drawings).size).toBe(25);
  });
  it('gives every displayed map element a vector legend glyph', () => {
    expect(MAP_LEGEND.map(item => item.name)).toEqual(['crown', 'spring', 'banana', 'ice', 'launch_trap', 'time_bomb', 'gravity_well', 'wall', 'gift', 'shop']);
    for (const item of MAP_LEGEND) {
      expect(item.label.length).toBeGreaterThan(3);
      expect(renderToStaticMarkup(<Glyph name={item.name} />)).toContain('<svg');
    }
  });
});
