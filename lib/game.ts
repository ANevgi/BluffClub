import {randomBytes,randomInt} from 'node:crypto';
import {drawingBrief,writingBrief} from './player-style';
import {demoMode,imageAI,textAI,sameMeaning,unsuitable,judge,safeError} from './ai';
import {MAX_PLAYERS,MAX_AUDIENCE,CROWD_REWARD} from './limits';
import {bluffs,drawings,pitches,bag} from './prompts';
const nextBluff=bag(bluffs),nextDrawing=bag(drawings),nextPitch=bag(pitches);
// The room or session no longer exists (expired, or the server restarted): the page drops its session.
export class Gone extends Error{}
export type Kind='bluff'|'draw'|'caption'|'pitch'|'prompt';
type Phase='lobby'|'generating'|'submit'|'vote'|'judging'|'reveal'|'finished';
type Player={id:string;token:string;name:string;score:number;shown?:string};
type Entry={id:string;owner:string;text?:string;image?:string;points?:number;match?:number;reason?:string;crowd?:number;favourite?:boolean};
type Round={kind:Kind;title:string;prompt:string;answer?:string;image?:string;imagePrompt?:string;fixture?:string};
const rounds:Round[]=[
 {kind:'bluff',title:'Human or Hallucination?',prompt:'In our fictional museum, the most heavily guarded exhibit is a _____.',answer:'rubber duck'},
 {kind:'draw',title:'Who Drew That?',prompt:'A pigeon being fired from its office job.'},
 {kind:'caption',title:'Caption Trap',prompt:'Write the caption this pigeon deserves.',image:'/assets/pigeon-bye.png'},
 {kind:'pitch',title:'Pitch, Please',prompt:'Noise-cancelling headphones… for houseplants.'},
 {kind:'prompt',title:'Prompt Gone Wrong',prompt:'Guess the innocent short prompt behind this very literal image.',answer:'tiger prawn soup',image:'/assets/mystery-bowl.png',fixture:'Pre-generated with Image Gen; deliberately staged misunderstanding.'}
];
const mysteries=[{answer:'butterfly cake',imagePrompt:'A gorgeous realistic birthday cake with little rectangular butter pats flying around it on insect wings. A deliberately literal misunderstanding of butterfly cake. Whimsical food photography, no text.'},{answer:'hot dog stand',imagePrompt:'A cheerful fluffy dog wearing sunglasses stands upright beside a hot street-food stall, gently fanning itself on a sunny day. Deliberate literal misinterpretation of hot dog stand, playful photorealism. No food hot dogs, no distress, no text.'},{answer:'mouse pad',imagePrompt:'A tiny real mouse relaxing in its own miniature stylish apartment, beanbag and miniature lamp. Deliberate misinterpretation of mouse pad as a mouse home. Photorealistic whimsical diorama, no text.'}];
export type Room={code:string;hostToken:string;players:Player[];audience:Map<string,Player>;audienceVotes:Record<string,string>;crowdLeaders:{name:string;score:number}[];images:Map<string,Buffer>;adult:boolean;closing:boolean;narratorKeys:number;narratorAt:number;botScore:number;phase:Phase;index:number;round:Round|null;entries:Entry[];votes:Record<string,string>;pending:Set<string>;error:string|null;busy:boolean;created:number;touched:number;deadline:number|null;generation:number;plan:Kind[];freshImages:boolean;demo:boolean;skipped:string[]};
const globalStore=globalThis as typeof globalThis & {bluffRooms?:Map<string,Room>};
const rooms=globalStore.bluffRooms??=new Map();
const token=()=>randomBytes(24).toString('hex');
const id=()=>randomBytes(8).toString('hex');
function shuffle<T>(a:T[]){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function cleanName(value:unknown){if(typeof value!=='string')throw new Error('Enter a nickname.');const n=value.trim().slice(0,20);if(!n||['ai','bluffbot','truth'].includes(n.toLowerCase()))throw new Error('Choose a different nickname.');return n}
export function createRoom(password:unknown,plan:unknown,freshImages:unknown,adult:unknown){if(process.env.HOST_PASSWORD&&password!==process.env.HOST_PASSWORD)throw new Error('Incorrect host password.');if(!demoMode()&&!process.env.OPENAI_API_KEY)throw new Error('Set OPENAI_API_KEY in .env.local and restart the server.');
 for(const [code,r] of rooms)if(Date.now()-r.touched>3*60*60*1000)rooms.delete(code);if(rooms.size>=30)throw new Error('Server room limit reached. Restart to clear old rooms.');
 const chosen=Array.isArray(plan)?plan.filter((x):x is Kind=>rounds.some(r=>r.kind===x)):[];if(!chosen.length)throw new Error('Select at least one round.');
 let code='';do{code=Array.from({length:5},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ'[randomInt(24)]).join('')}while(rooms.has(code));
 const r:Room={code,hostToken:token(),players:[],audience:new Map(),audienceVotes:{},crowdLeaders:[],images:new Map(),adult:adult===true,closing:false,narratorKeys:0,narratorAt:0,botScore:0,phase:'lobby',index:-1,round:null,entries:[],votes:{},pending:new Set(),error:null,busy:false,created:Date.now(),touched:Date.now(),deadline:null,generation:0,plan:[...new Set(chosen)],freshImages:!!freshImages,demo:demoMode(),skipped:[]};rooms.set(code,r);return {code,token:r.hostToken,role:'host'};
}
// Rooms with people who were here in the last 2 minutes and haven't finished. A deploy restarts the server and ends them, so ship.sh waits for 0.
export function liveRooms(){let n=0;for(const r of rooms.values())if(r.phase!=='finished'&&Date.now()-r.touched<2*60*1000&&(r.players.length||r.audience.size))n++;return n}
export function roomFor(code:string){const r=rooms.get(code.toUpperCase());if(!r||Date.now()-r.touched>3*60*60*1000)throw new Gone('Room expired or not found. Ask the host for a new code.');r.touched=Date.now();return r}
// Everything a player types or draws passes the rude filter (OpenAI Decisions) before anyone else sees it. Audience nicknames
// are only shown on the final crowd board, so only the five that get there are checked (in reveal), not 300 at join.
const refused=(r:Room,what:string)=>r.adult?`Even in an 18+ room, that ${what} crosses the line. Try another.`:`The rude filter turned that ${what} down. Keep it family-friendly and try another.`;
const filter=(r:Room,content:{text?:string;image?:string})=>unsuitable(content,r.adult).catch(()=>{throw new Error('The rude filter could not check that just now. Try again in a moment.')});
export async function joinRoom(r:Room,name:unknown,as:unknown){const n=cleanName(name);if(as==='audience'){if(r.audience.size>=MAX_AUDIENCE)throw new Error('The audience is full.');const a={id:id(),token:token(),name:n,score:0};r.audience.set(a.token,a);return {code:r.code,token:a.token,role:'audience'}}
 const seat=()=>{if(r.phase!=='lobby')throw new Error('This game has started. Join the audience instead.');if(r.players.length>=MAX_PLAYERS)throw new Error(`All ${MAX_PLAYERS} player seats are taken. Join the audience instead.`);if(r.players.some(p=>p.name.toLowerCase()===n.toLowerCase()))throw new Error('That nickname is taken.')};
 seat();if(await filter(r,{text:n}))throw new Error(refused(r,'nickname'));seat();const p={id:id(),token:token(),name:n,score:0};r.players.push(p);return {code:r.code,token:p.token,role:'player'}}
// Host only: at most 10 narrator keys per room, 10 s apart. Each opens a Realtime session on our key.
export function narratorTicket(r:Room,t:string){hostOnly(r,t);if(r.narratorKeys>=10)throw new Error('This room has used its narrator allowance. Start a new room.');if(Date.now()-r.narratorAt<10_000)throw new Error('Wait a few seconds before reconnecting the narrator.');r.narratorKeys++;r.narratorAt=Date.now()}
function auth(r:Room,t:string){if(t===r.hostToken)return {role:'host' as const};const p=r.players.find(p=>p.token===t);if(p)return {role:'player' as const,p};const a=r.audience.get(t);if(a)return {role:'audience' as const,p:a};throw new Gone('Session not found. Rejoin with your room code.')}
export function hostOnly(r:Room,t:string){if(t!==r.hostToken)throw new Error('Only the host can do that.')}
// Images live here and are served from /img/<code>-<key>.png, so polls stay small and Cloudflare can cache each image once.
function storeImage(r:Room,dataUrl:string){const key=id();r.images.set(key,Buffer.from(dataUrl.slice(dataUrl.indexOf(',')+1),'base64'));return `/img/${r.code}-${key}.png`}
export function imageFor(code:string,key:string){return rooms.get(code)?.images.get(key)}
export function snapshot(r:Room,t:string){const v=auth(r,t),p=v.role==='host'?undefined:v.p,revealed=['reveal','finished'].includes(r.phase),myVote=p&&(v.role==='audience'?r.audienceVotes:r.votes)[p.id];return {code:r.code,role:v.role,me:p?.id,you:p?{name:p.name,score:p.score}:null,phase:r.phase,index:r.index,total:r.plan.length,round:r.round?{kind:r.round.kind,title:r.round.title,prompt:r.round.prompt,image:r.round.kind==='prompt'&&r.phase==='generating'?undefined:r.round.image,fixture:r.round.fixture,...(revealed?{answer:r.round.answer}:{})}:null,players:r.players.map(x=>({id:x.id,name:x.name,score:x.score,submitted:r.entries.some(e=>e.owner===x.id),voted:!!r.votes[x.id]})),audience:r.audience.size,audienceVoted:Object.keys(r.audienceVotes).length,botScore:r.botScore,entries:['vote','reveal','finished'].includes(r.phase)?r.entries.map(e=>({id:e.id,text:e.text,image:e.image,own:e.owner===p?.id,...(revealed?{owner:e.owner==='AI'?'Bluffbot':e.owner==='Truth'?'The truth':r.players.find(x=>x.id===e.owner)?.name,ai:e.owner==='AI',truth:e.owner==='Truth',points:e.points,match:e.match,reason:e.reason,votes:Object.values(r.votes).filter(v=>v===e.id).length,crowd:e.crowd,favourite:e.favourite}:{})})):[],submitted:v.role==='player'&&r.entries.some(e=>e.owner===v.p.id),voted:!!myVote,myVote:myVote||null,crowdLeaders:r.phase==='finished'?r.crowdLeaders:[],error:r.error,busy:r.busy,deadline:r.deadline,demo:r.demo,adult:r.adult,skipped:r.skipped};}
export async function prepare(r:Room,retry=false){if(r.busy)throw new Error('Already working.');if(!retry){r.index++;if(r.index>=r.plan.length){r.phase='finished';return}r.round={...rounds.find(x=>x.kind===r.plan[r.index])!};if(r.round.kind==='bluff')Object.assign(r.round,nextBluff());else if(r.round.kind==='draw')r.round.prompt=nextDrawing();else if(r.round.kind==='pitch')r.round.prompt=nextPitch();if(r.round.kind==='prompt'&&r.freshImages)r.round={...r.round,...mysteries[randomInt(mysteries.length)],image:undefined,fixture:undefined};r.entries=[];r.votes={};r.audienceVotes={};r.pending.clear();r.images.clear();r.closing=false}
 r.phase='generating';r.error=null;r.busy=true;r.deadline=null;const job=++r.generation;const current=r.round!;
 try{let bot:Entry|undefined;
 if(current.kind==='prompt'){if(!current.image)current.image=r.demo?'/assets/mystery-bowl.png':storeImage(r,await imageAI(current.imagePrompt!));if(r.demo&&current.imagePrompt){current.answer='tiger prawn soup';current.fixture='Offline pre-generated image.'}}
 else if(current.kind==='draw'){const image=r.demo?'/assets/pigeon-desk.png':storeImage(r,await imageAI(drawingBrief(current.prompt,randomInt(3))));bot={id:id(),owner:'AI',image}}
 else {const fixtures={bluff:'a spoon',caption:'hr said i had to fly',pitch:'so it cant hear you singing'};const text=r.demo?fixtures[current.kind as keyof typeof fixtures]:await textAI(writingBrief(current.kind,current.answer,randomInt(3)),current.prompt);bot={id:id(),owner:'AI',text:text.trim().split(/\s+/).slice(0,12).join(' ').slice(0,80)}}
 if(job!==r.generation)return;if(bot)r.entries=[bot];if(current.kind==='bluff')r.entries.push({id:id(),owner:'Truth',text:current.answer});r.phase='submit';r.deadline=Date.now()+(current.kind==='draw'?60:45)*1000;
 }catch(e){if(job===r.generation)r.error=safeError(e)}finally{if(job===r.generation)r.busy=false}
}
export async function submit(r:Room,t:string,value:unknown){const v=auth(r,t);if(v.role==='host')throw new Error('Join on a player device to submit.');if(v.role==='audience')throw new Error('The audience votes; only players submit.');const p=v.p;if(r.phase!=='submit'||r.closing)throw new Error('Submissions are closed.');if(r.entries.some(e=>e.owner===p.id)||r.pending.has(p.id))throw new Error('Already submitted.');if(typeof value!=='string')throw new Error('Invalid submission.');const round=r.round!,text=value.trim();if(!text)throw new Error('Enter something first.');const draw=round.kind==='draw';if(draw){if(text.length>1_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(text))throw new Error('Drawing is invalid or too large.')}else if(text.length>180)throw new Error('Keep it under 180 characters.');r.pending.add(p.id);const generation=r.generation;
 try{const [rude,same]=await Promise.all([filter(r,draw?{image:text}:{text}),round.kind==='bluff'?sameMeaning(text,round.answer!):false]);if(rude)throw new Error(refused(r,draw?'drawing':'entry'));if(same)throw new Error('That matches the real answer. Invent a different bluff!');if(!draw&&r.entries.some(e=>e.text?.toLowerCase()===text.toLowerCase()))throw new Error('That entry is already taken. Try another.');if(r.phase!=='submit'||generation!==r.generation)throw new Error('The host closed submissions.');r.entries.push(draw?{id:id(),owner:p.id,image:storeImage(r,text)}:{id:id(),owner:p.id,text})}finally{r.pending.delete(p.id);autoAdvance(r)}
}
function autoAdvance(r:Room){
 if(r.busy||r.closing||r.pending.size||!r.players.length)return;
 if(r.phase==='submit'&&r.players.every(p=>r.entries.some(e=>e.owner===p.id))){
  r.deadline=null;
  if(r.round!.kind==='prompt'){void reveal(r);return}
  r.entries=shuffle(r.entries);r.phase='vote';return;
 }
 if(r.phase==='vote'&&r.players.every(p=>!!r.votes[p.id]))void reveal(r);
}
export async function advance(r:Room,t:string){hostOnly(r,t);if(r.busy||r.closing||(r.pending.size&&r.phase!=='submit'))throw new Error('Wait for current requests to finish.');if(r.phase==='lobby'){if(!r.players.length)throw new Error('At least one player must join.');void prepare(r);return}
 if(r.phase==='reveal'){void prepare(r);return}
 // Closing refuses new entries, then gives checks already in flight up to 5 s to land; any later are turned away.
 if(r.phase==='submit'){r.closing=true;for(let i=0;r.pending.size&&i<50;i++)await new Promise(res=>setTimeout(res,100));const human=r.entries.filter(e=>r.players.some(p=>p.id===e.owner));if(!human.length){r.closing=false;throw new Error('Wait for at least one player submission.')}r.deadline=null;r.closing=false;if(r.round!.kind==='prompt'){void reveal(r);return}r.entries=shuffle(r.entries);r.phase='vote';return}
 if(r.phase==='vote'){void reveal(r);return}throw new Error('Cannot advance right now.')}
export function vote(r:Room,t:string,entry:unknown){const v=auth(r,t);if(v.role==='host')throw new Error('Host cannot vote.');if(r.phase!=='vote')throw new Error('Voting is closed.');const votes=v.role==='audience'?r.audienceVotes:r.votes;if(votes[v.p.id])throw new Error('Already voted.');const e=r.entries.find(e=>e.id===entry);if(!e||e.owner===v.p.id)throw new Error('Choose another player’s entry.');votes[v.p.id]=e.id;autoAdvance(r)}
async function reveal(r:Room){r.busy=true;r.error=null;const oldPhase=r.phase;r.phase='judging';try{const delta:Record<string,number>={};const add=(owner:string,n:number)=>{delta[owner]=(delta[owner]||0)+n};const kind=r.round!.kind;if(kind==='prompt'){const results=await judge(r.round!.answer!,r.entries.map(e=>({id:e.id,text:e.text!})));const best=Math.max(...results.map(x=>x.score));for(const result of results){const e=r.entries.find(e=>e.id===result.id)!;e.match=result.score;e.reason=result.reason;e.points=result.score*10+(result.score===best&&best>0?500:0);add(e.owner,e.points)}}else{
 // One vote for e: the author's reward, plus the voter's when they found the truth or the bot. The crowd's top pick counts as one voterless vote.
 const found=(e:Entry)=>kind==='bluff'?e.owner==='Truth':kind!=='pitch'&&e.owner==='AI';const count=(e:Entry,voter?:string)=>{if(found(e)){if(voter)add(voter,1000)}else if(kind==='pitch'||kind==='bluff')add(e.owner,500);else{add(e.owner,500);add('AI',500)}};
 for(const [voter,target] of Object.entries(r.votes))count(r.entries.find(e=>e.id===target)!,voter);
 const crowd:Record<string,number>={};for(const target of Object.values(r.audienceVotes))crowd[target]=(crowd[target]||0)+1;const top=Math.max(0,...Object.values(crowd));for(const e of r.entries){e.crowd=crowd[e.id]||0;e.favourite=top>0&&e.crowd===top;if(e.favourite)count(e)}
 for(const e of r.entries)e.points=delta[e.owner]||0;for(const a of r.audience.values()){const e=r.entries.find(e=>e.id===r.audienceVotes[a.id]);if(e&&found(e))a.score+=CROWD_REWARD}const board=[...r.audience.values()].filter(a=>a.score>0).sort((a,b)=>b.score-a.score).slice(0,5);await Promise.all(board.map(async a=>{a.shown??=await unsuitable({text:a.name},r.adult).then(bad=>bad?'Audience member':a.name,()=>'Audience member')}));r.crowdLeaders=board.map(a=>({name:a.shown!,score:a.score}))}
 for(const p of r.players)p.score+=delta[p.id]||0;r.botScore+=delta.AI||0;r.phase='reveal';
 }catch(e){r.error=safeError(e);r.phase=oldPhase}finally{r.busy=false}}
export async function action(r:Room,t:string,a:string,data:Record<string,unknown>){auth(r,t);if(a==='submit')return submit(r,t,data.value);if(a==='vote')return vote(r,t,data.entry);if(a==='advance')return advance(r,t);if(a==='retry'){hostOnly(r,t);if(r.phase!=='generating'||r.busy)throw new Error('No failed generation to retry.');void prepare(r,true);return}if(a==='skip'){hostOnly(r,t);if(r.phase==='lobby'||r.phase==='finished'||r.phase==='reveal'||(r.busy&&r.phase!=='generating'))throw new Error('Cannot skip right now.');r.generation++;r.busy=false;r.skipped.push(r.round!.title);r.entries=[];r.votes={};r.audienceVotes={};r.error=null;r.phase='reveal';return}throw new Error('Unknown action.')}
