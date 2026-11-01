import {PET_SEED} from './limits';
// Everyone who joins in the lobby gets a pet: a dot whose colour, eyes, mood (how it moves), shape and accessory all come from their id, so the host screen and their phone draw the same one. Latecomers get a plain dot.
const colours=[['var(--green)','lime'],['var(--orange)','tangerine'],['var(--purple)','lilac'],['#ff95c7','bubblegum'],['var(--paper)','vanilla'],['#82dce5','aqua'],['#ffe078','butter']];
const moods=['bouncy','wobbly','sleepy','jittery','floaty'],eyeTypes=[['beady','beady eyes'],['googly','googly eyes'],['happy','happy eyes'],['cyclops','one big eye']],extras=[['',''],['antenna',' and an antenna'],['blush',' and rosy cheeks']];
export type Pet=ReturnType<typeof pet>;
export function pet(id:string){let s=parseInt(id.slice(0,PET_SEED),16)||0;const next=()=>{s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296},pick=<T>(a:T[])=>a[Math.floor(next()*a.length)];
 const [colour,hue]=pick(colours),mood=pick(moods),[eyes,look]=pick(eyeTypes),[extra,also]=pick(extras),shape=Math.floor(next()*3),roam=Math.floor(next()*3),size=.85+next()*.3,tempo=.8+next()*.5,phase=next();
 return {colour,mood,eyes,extra,shape,roam,size,tempo,phase,className:`pet m-${mood} e-${eyes}${extra&&' x-'+extra} sh${shape}`,style:{'--c':colour,'--z':size.toFixed(2),'--t':tempo.toFixed(2),'--d':phase.toFixed(2)},about:`a ${mood} ${hue} dot with ${look}${also}`};
}
