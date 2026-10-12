import {equal,key,type Hex} from '../core/hex';
import {boardProjection,type RenderStyle} from './boardProjection';
import type {ArenaMap} from '../realtime/maps';
import type {Visual} from '../realtime/engine';
import {Glyph} from './icons';
export function SpringModels({springs,floors,style,time=0,events=[]}:{springs:{at:Hex;direction:number}[];floors:ArenaMap['floors'];style:RenderStyle;time?:number;events?:Visual[]}){
 const p=boardProjection(style,floors);
 return <g data-layer="springs" pointerEvents="none">{[...springs].sort((a,b)=>p.point(a.at).y-p.point(b.at).y).map(s=>{const at=p.point(s.at),trigger=[...events].reverse().find(e=>e.kind==='spring'&&equal(e.at,s.at)),t=trigger?Math.max(0,(time-trigger.start)/600):1;
 const stretch=t>=1?1:t<.22?1-.55*t/.22:t<.55?.45+.8*(t-.22)/.33:1.25-.25*(t-.55)/.45;
 return <g key={key(s.at)} data-spring={key(s.at)} data-direction={s.direction} data-stretch={stretch.toFixed(3)} transform={`translate(${at.x} ${at.y})`}>
 {style==='2d'?<g transform="translate(-19 -19)"><Glyph name="spring" size={38}/></g>:<>
 <ellipse cy="5" rx="25" ry="12" fill="#203b46" opacity=".25"/>
 <path d="M-23-5L0-16L23-5V6L0 17L-23 6Z" fill="#51737d" stroke="#304b58" strokeWidth="2"/>
 <path d="M-23-5L0-16L23-5L0 7Z" fill="#aec8c5" stroke="#304b58" strokeWidth="2"/>
 <g data-spring-coil transform={`scale(1 ${stretch})`}>
 <path d="M-13-4C-26-11 26-11 13-18S-26-18-13-25S26-25 13-32S-26-32-13-39" fill="none" stroke="#304b58" strokeWidth="8" strokeLinecap="round"/>
 <path d="M-13-4C-26-11 26-11 13-18S-26-18-13-25S26-25 13-32S-26-32-13-39" fill="none" stroke="#f5c65d" strokeWidth="4" strokeLinecap="round"/>
 <ellipse cy="-40" rx="21" ry="8" fill="#f7d986" stroke="#846440" strokeWidth="3"/>
 </g></>}
 <g transform={`rotate(${p.directionAngle(s.direction)})`}><path d="M0-40L-7-28H-3V-21H3V-28H7Z" fill="#db6245" stroke="#fff1ce" strokeWidth="1.5"/></g>
 </g>;})}</g>;
}
