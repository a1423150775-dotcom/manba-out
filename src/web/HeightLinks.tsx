import {DIRS,add,equal,key,type Hex} from '../core/hex';
import type {ArenaMap} from '../realtime/maps';
import {boardProjection,type RenderStyle} from './boardProjection';
/** Editor-only visualization of legal stairs and one-way drops; no gameplay state. */
export function HeightLinks({map,style}:{map:ArenaMap;style:RenderStyle}){
 const project=boardProjection(style,map.floors),links:{a:Hex;b:Hex;drop:boolean}[]=[];
 for(const a of map.floors)for(const dir of DIRS){const b=map.floors.find(f=>equal(f,add(a,dir)));if(!b)continue;const delta=(a.height||0)-(b.height||0);if(delta>=1||(delta>0&&delta<=.5))links.push({a,b,drop:delta>=1});}
 return <g data-height-links pointerEvents="none">{links.map(({a,b,drop})=>{const from=project.point(a),to=project.point(b),dx=(to.x-from.x)*.32,dy=(to.y-from.y)*.32,x=(from.x+to.x)/2,y=(from.y+to.y)/2,angle=Math.atan2(dy,dx)*180/Math.PI;return <g key={key(a)+'>'+key(b)} transform={`translate(${x} ${y}) rotate(${angle})`}><path d={`M${-Math.hypot(dx,dy)} 0H${Math.hypot(dx,dy)}m-8-5l8 5-8 5`} fill="none" stroke={drop?'#ed9f30':'#25885e'} strokeWidth="4"/><text y="-7" textAnchor="middle" fontSize="10" fill={drop?'#9c590d':'#14663e'}>{drop?'跳':'梯'}</text></g>;})}</g>;
}
