import type {SkillId} from '../realtime/config';
import {Glyph} from './icons';
export function RealtimeArt({id,size=40}:{id:SkillId;size?:number}){
 if(id==='move'||id==='elbow'||id==='blink')return <Glyph name={id==='elbow'?'laoda_elbow':id==='blink'?'teleport':'move'} size={size}/>;
 return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" fill="#e7c98a" stroke="#263950" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
 {id==='charge'&&<><path d="M7 20H38V43H7ZM38 27H49L58 36V43H38Z" fill="#e77b51"/><path d="M43 29V36H54" fill="#c7edf3"/><circle cx="18" cy="45" r="7" fill="#46566e"/><circle cx="47" cy="45" r="7" fill="#46566e"/><path d="M3 13H23M1 29H7"/></>}
 {id==='fireball'&&<><path d="M15 47Q2 27 29 8Q21 26 37 26L47 13Q62 32 47 51Q26 65 15 47Z" fill="#f78b3f"/><path d="M24 46Q18 37 32 28Q28 37 39 34Q49 51 30 54Z" fill="#ffdf6b"/></>}
 {id==='cover'&&<><path d="M5 23L28 12L58 23L35 34Z" fill="#dae4e2"/><path d="M5 23V48L35 59V34ZM35 34L58 23V48L35 59Z" fill="#a5b8bc"/><path d="M5 36L35 47L58 36M20 29V41M44 29V41M20 43V54"/></>}
 {id==='mine'&&<><ellipse cx="32" cy="42" rx="25" ry="12" fill="#667e71"/><path d="M10 40L18 24H46L54 40Z" fill="#96af8d"/><ellipse cx="32" cy="24" rx="14" ry="6" fill="#e8ca67"/><path d="M32 13V5M14 17L8 11M50 17L56 11" stroke="#d94f4f"/><circle cx="32" cy="25" r="3" fill="#e65b4d"/></>}
 {id==='hook'&&<><path d="M8 55L34 29" stroke="#7896a5" strokeWidth="8"/><path d="M25 13L34 30L50 37L58 20L49 27L41 21L38 6Z" fill="#bacbd4"/><path d="M10 46L18 54M19 37L27 45"/></>}
 {id==='basic'&&<><path d="M7 45L40 13L49 9L54 18L22 51Z" fill="#d6e9f1"/><path d="M12 36L29 53M5 56L16 45" stroke="#d39c45" strokeWidth="6"/><path d="M43 43L50 50M46 34H57M32 51V59" stroke="#e58148"/></>}
 {id==='arrow'&&<><path d="M17 7Q57 32 17 57L29 32Z" fill="#c88b50"/><path d="M9 32H57M48 24L58 32L48 40" fill="none"/><path d="M10 26L19 32L10 38" fill="#72b8a9"/></>}
 </svg>;
}
