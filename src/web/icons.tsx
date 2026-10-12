import type { ReactNode } from 'react';
import type { CardId } from '../core/cards';

type GlyphName = CardId | 'crown' | 'spring' | 'shop' | 'gift' | 'out' | 'coin' | 'clock' | 'move' | 'target' | 'wall' | 'star' | 'rules';

const S = ({ children }: { children: ReactNode }) => <g fill="none" stroke="currentColor" strokeWidth="3.7" strokeLinecap="round" strokeLinejoin="round">{children}</g>;
export function Glyph({ name, size = 36, className = '' }: { name: GlyphName; size?: number; className?: string }) {
  let drawing: ReactNode;
  switch (name) {
    case 'laoda_elbow': drawing = <><path d="M8 49 19 40l13-4 8-12q3-5 8-2t1 8L39 45l-13 7-9 6z"/><path d="M19 40 10 28l6-5 11 9m5 4 7 9M45 16l5-8m2 21 9-1M48 41l7 6"/><circle cx="38" cy="32" r="3"/></>; break;
    case 'punch': drawing = <><path d="M17 30v-9q0-4 4-4t4 4v-5q0-4 4-4t4 4v-1q0-4 4-4t4 4v3q0-4 4-4t4 4v17q0 7-7 11l-3 3H25q-11-7-13-17l-1-7q-1-5 3-6t5 4l3 8"/><path d="M24 48v6h19v-6M24 27h25"/></>; break;
    case 'hook': drawing = <><path d="M13 13l13 13m-8-14 12 12M26 26l9 8"/><path d="M35 34q-7 9-2 16 6 8 15 1l6-6-8-7-5 5-5-5 5-5-7-7-8 8"/><circle cx="15" cy="12" r="5"/></>; break;
    case 'rocket_boots': drawing = <><path d="M16 10h18v18q0 6 10 8l6 2v10H15v-9q4-3 4-10V10M16 21h18M15 48h38"/><path d="M20 53l-5 7m14-7v8m10-8 6 7M26 15h3"/></>; break;
    case 'banana': drawing = <><path d="M31 34q-13-4-17-20 15 1 24 18M31 34q-7 5-20 2-1 13 20 14M31 34q5-15 20-18 5 20-12 27M31 34q12 0 20 16-16 7-24-5"/><path d="M29 34l5 5"/></>; break;
    case 'ice': drawing = <><path d="M32 7v50M9 20l46 24M9 44l46-24M32 7l-6 6m6-6 6 6m-6 44-6-6m6 6 6-6M9 20l8-1m-8 1 3 7m43 17-8 1m8-1-3-7"/></>; break;
    case 'shield': drawing = <><path d="M32 7 51 15v14q0 16-19 28Q13 45 13 29V15z"/><path d="m23 32 7 7 13-16"/></>; break;
    case 'dodge': drawing = <><circle cx="24" cy="15" r="5"/><path d="m22 23 11 5 9-8m-13 8-9 13-11 2m20-14 6 12 12 4M13 55h39M14 17l-6-3m7 11-8 1"/></>; break;
    case 'barricade': case 'wall': drawing = <><path d="M8 14h48v39H8zM8 26h48M8 39h48M23 14v12m18-12v12M16 26v13m16-13v13m16-13v13M23 39v14m18-14v14"/></>; break;
    case 'dismantle': drawing = <><path d="m13 15 11 11m5-2 16 16m-9-24 7-7 11 11-7 7M12 46l20-20 7 7-20 20-9 2z"/><path d="m10 10 4 4m34 35 6 6M7 31l5-2m34-20 2-5"/></>; break;
    case 'supply_dash': drawing = <><path d="M10 30h26m-18-9 18 9-18 9M39 13h12v13H39zM43 13V8h5v5M39 48h12v10H39zM45 48V37"/><path d="M9 50h25"/></>; break;
    case 'swap': drawing = <><circle cx="16" cy="20" r="7"/><circle cx="48" cy="44" r="7"/><path d="M29 15h21l-6-6m6 6-6 6M35 49H14l6 6m-6-6 6-6"/></>; break;
    case 'magnet': drawing = <><path d="M17 14v23q0 15 15 15t15-15V14H36v23q0 4-4 4t-4-4V14z"/><path d="M17 14h11m8 0h11M7 34l-3-3m53 3 3-3"/></>; break;
    case 'air_cannon': drawing = <><path d="M10 45h18l8-8-8-8H10zM12 29v16M37 32q8 5 0 10M43 23q18 14 0 28M50 14q25 18 0 42"/><circle cx="18" cy="37" r="3"/></>; break;
    case 'launch_trap': drawing = <><path d="M11 48h42v8H11zM18 48l8-16 7 16m1 0 9-16 5 16M32 28V8m-8 8 8-8 8 8"/></>; break;
    case 'time_bomb': drawing = <><circle cx="32" cy="37" r="20"/><path d="M32 37V24m0 13 10 7M25 8h14M32 8v9m16 1 5-5M11 9l5 5"/><circle cx="32" cy="37" r="2"/></>; break;
    case 'mirror': drawing = <><path d="m14 11 32 5-6 36-32-5zM20 18l-5 23m15-22-11 15M45 41l9 6-10 2m10-2-7 8"/><path d="m50 13 5-3"/></>; break;
    case 'gravity_well': drawing = <><circle cx="32" cy="32" r="7"/><path d="M32 6q25 0 26 26M58 32l-5-6m5 6-7 3M32 58Q6 58 6 32m0 0 6 5m-6-5 6-5M13 14q10-9 20-8M51 50q-9 9-19 8"/></>; break;
    case 'friend_delivery': drawing = <><path d="M12 25h39v28H12zM8 25l24-15 24 15M32 11v42M12 35h39"/><path d="m42 8 12 3-5 11M54 11 40 23"/></>; break;
    case 'remote': drawing = <><rect x="18" y="10" width="28" height="44" rx="6"/><circle cx="32" cy="35" r="8"/><path d="M26 20h12M32 30v10M27 35h10M9 18q-5 13 0 26m46-26q5 13 0 26"/></>; break;
    case 'teleport': drawing = <><ellipse cx="32" cy="32" rx="20" ry="26"/><ellipse cx="32" cy="32" rx="10" ry="17"/><path d="M7 24l8 3m42 10-8-3M24 32h16m-6-6 6 6-6 6"/></>; break;
    case 'tornado': drawing = <><path d="M9 18q10-11 23-5 15 8 24-2M7 27q14-7 26 0 13 7 24-2M12 37q11-6 21 0 11 6 17 0M20 46q9-4 16 0m-8 8h8"/></>; break;
    case 'quake': drawing = <><path d="m32 8 5 13 15-3-8 12 12 9-17 1-7 16-8-15-17-2 12-10-8-11 15 3z"/><path d="m29 22-5 12 9-2-4 13"/></>; break;
    case 'swap_storm': drawing = <><circle cx="16" cy="25" r="6"/><circle cx="48" cy="39" r="6"/><path d="M27 16q18-9 26 7l-8-2m8 2-1-9M37 48q-18 9-26-7l8 2m-8-2 1 9M30 29l4 6"/></>; break;
    case 'gathering': drawing = <><circle cx="32" cy="32" r="7"/><circle cx="12" cy="14" r="5"/><circle cx="52" cy="14" r="5"/><circle cx="12" cy="51" r="5"/><circle cx="52" cy="51" r="5"/><path d="m16 18 10 10m22-10L38 28M16 48l10-11m22 11L38 37"/></>; break;
    case 'crown': drawing = <><path d="m7 20 10 10 14-20 15 20 11-10-5 28H12zM13 54h39M25 40h14"/><circle cx="7" cy="18" r="2"/><circle cx="57" cy="18" r="2"/></>; break;
    case 'spring': drawing = <><path d="M12 53h40M19 48h26l-7-8-12 0 12-9-12 0 12-9H25M22 15h20M32 14V5m-7 6 7-6 7 6"/></>; break;
    case 'shop': drawing = <><path d="M10 26h44v30H10zM7 26l6-15h38l6 15-7 7-9-7-9 7-9-7-9 7zM26 56V37h13v19"/></>; break;
    case 'gift': drawing = <><path d="M9 26h46v29H9zM6 21h52v8H6zM32 21v34M32 21q-21-2-17-12 6-11 17 12Zm0 0q21-2 17-12-6-11-17 12Z"/></>; break;
    case 'out': drawing = <><circle cx="32" cy="32" r="23"/><path d="M16 48 48 16M20 21h11m-11 8h8m8 8h9m-9 8h9"/></>; break;
    case 'coin': drawing = <><circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="17"/><path d="M40 24q-4-5-12-2-7 3-3 8 2 3 9 4 9 2 5 9-5 7-15 1M32 17v30"/></>; break;
    case 'clock': drawing = <><circle cx="32" cy="32" r="23"/><path d="M32 16v17l11 7"/></>; break;
    case 'move': drawing = <><path d="M8 47h48M13 39l13-18 12 10 13-19m-8 1h8v8M13 55h38"/></>; break;
    case 'target': drawing = <><circle cx="32" cy="32" r="23"/><circle cx="32" cy="32" r="13"/><circle cx="32" cy="32" r="3"/><path d="M32 4v11m0 34v11M4 32h11m34 0h11"/></>; break;
    case 'star': drawing = <><path d="m32 6 7 17 18 2-14 12 4 19-15-10-15 10 4-19L7 25l18-2z"/></>; break;
    case 'rules': drawing = <><path d="M10 10h20q8 0 8 8v36H18q-8 0-8-8zm44 0H34q-8 0-8 8v36h20q8 0 8-8zM16 21h12m-12 8h12m8-8h12m-12 8h12"/></>; break;
  }
  return <svg className={`glyph ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false"><S>{drawing}</S></svg>;
}

export const MAP_LEGEND = [
  { name: 'crown', label: '王座 · 每轮3分' }, { name: 'spring', label: '固定弹簧 · 定向弹射' },
  { name: 'banana', label: '香蕉皮 · 滑行' }, { name: 'ice', label: '冰面 · 下回合减AP' },
  { name: 'launch_trap', label: '弹射陷阱 · 定向弹射' }, { name: 'time_bomb', label: '定时炸弹 · 下轮爆炸' },
  { name: 'gravity_well', label: '引力井 · 下轮拉人' }, { name: 'wall', label: '路障 · 不可通行' },
  { name: 'gift', label: '盲盒 · 停在这里领取' }, { name: 'shop', label: '商店 · 靠近购买' },
] as const;
