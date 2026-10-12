import { CARDS, type Card, type CardId } from '../core/cards';
import { Glyph } from './icons';

type Props = {
  card: Card | { id: CardId; instanceId: string };
  eyebrow?: string;
  disabled?: boolean;
  disabledReason?: string;
  selected?: boolean;
  preview?: boolean;
  onAction?: () => void;
  onInspect: (id: CardId) => void;
};

export function CardTile({ card, eyebrow, disabled = false, disabledReason, selected = false, preview = false, onAction, onInspect }: Props) {
  const data = CARDS[card.id];
  return <article className={`game-card rarity-${data.rarity} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''} ${preview ? 'is-preview' : ''}`} data-card-id={card.id}>
    <button className="card-main" type="button" disabled={disabled || !onAction} onClick={onAction} title={disabledReason} aria-label={`${eyebrow || ''} ${data.name}：${data.detail}${disabledReason ? `；${disabledReason}` : ''}`}>
      <span className="card-overline">{eyebrow || (data.reaction ? '反应卡' : data.rarity === 'common' ? '普通卡' : data.rarity === 'rare' ? '稀有卡' : '传奇卡')}</span>
      <span className="card-art"><Glyph name={card.id} size={64} /></span>
      <strong className="card-name">{data.name}</strong>
      <span className="card-summary">{data.detail}</span>
      {disabledReason && <span className="card-disabled-reason">{disabledReason}</span>}
    </button>
    <button className="card-inspect" type="button" onClick={() => onInspect(card.id)} aria-label={`查看${data.name}完整效果`}>效果详情</button>
  </article>;
}
