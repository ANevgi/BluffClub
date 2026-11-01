// Plays one full game against a running server: a host, 12 players and an audience, every one of them polling like a phone does.
// Checks seats, scoring and images, then prints latency and payload sizes. Run it against DEMO_MODE=true unless you mean to spend API credits.
//   node scripts/load-test.mjs [baseUrl=http://localhost:3000] [audience=188] [secondsPerPhase=5]
const base=(process.argv[2]||'http://localhost:3000').replace(/\/$/,''),AUDIENCE=+(process.argv[3]||188),HOLD=+(process.argv[4]||5)*1000,PLAYERS=12;
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const stats={polls:0,notModified:0,errors:0,latencies:[],maxBytes:0,bytes:0};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fail(message){console.error(`FAIL: ${message}`);process.exit(1)}
async function post(action,data={},token){const r=await fetch(`${base}/api/game`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({action,...data})});const body=await r.json();if(!r.ok)throw new Error(body.error);return body}
// One phone: polls with its ETag on the same interval as app/page.tsx and keeps the latest state.
function phone(code,token,role){const p={token,role,view:null,etag:'',stop:false};(async()=>{await sleep(Math.random()*1200);while(!p.stop){const t0=performance.now();try{const r=await fetch(`${base}/api/game?code=${code}`,{headers:{Authorization:`Bearer ${token}`,...(p.etag?{'If-None-Match':p.etag}:{})}});stats.polls++;if(r.status===304){stats.notModified++;await r.arrayBuffer()}else{const text=await r.text();if(!r.ok)throw new Error(text);stats.bytes+=text.length;stats.maxBytes=Math.max(stats.maxBytes,text.length);p.etag=r.headers.get('etag')||'';p.view=JSON.parse(text)}stats.latencies.push(performance.now()-t0)}catch(e){stats.errors++;if(stats.errors<=5)console.error('poll error',e.message)}await sleep(role==='audience'?2000:1200)}})();return p}
async function until(p,test,what){for(let i=0;i<200;i++){if(p.view&&test(p.view))return p.view;await sleep(100)}fail(`timed out waiting for ${what} (phase ${p.view?.phase}, error ${p.view?.error})`)}
const pick=a=>a[Math.floor(Math.random()*a.length)];
const created=await post('create',{plan:['bluff','draw','caption','pitch','prompt'],password:process.env.HOST_PASSWORD});const code=created.code;console.log(`room ${code}: joining ${PLAYERS} players and ${AUDIENCE} audience`);
const players=[];for(let i=0;i<PLAYERS;i++)players.push(await post('join',{code,name:`Player ${i+1}`,as:'player'}));
await post('join',{code,name:'Seat 13',as:'player'}).then(()=>fail('a 13th player got a seat'),e=>console.log(`13th player refused: ${e.message}`));
const audience=await Promise.all(Array.from({length:AUDIENCE},(_,i)=>post('join',{code,name:`Watcher ${i+1}`,as:'audience'})));
const host=phone(code,created.token,'host'),phones=[...players.map(p=>phone(code,p.token,'player')),...audience.map(a=>phone(code,a.token,'audience'))];
const expected=new Map(audience.map(a=>[a.token,0]));const t0=performance.now();
await until(host,v=>v.audience===AUDIENCE&&v.players.length===PLAYERS&&v.pets?.length===AUDIENCE*4,'everyone in the lobby, each audience member with a pet');await sleep(HOLD);if(phones.some(p=>p.view&&'pets' in p.view))fail('a phone was sent the crowd\'s pet seeds');await post('advance',{code},created.token);
// Anyone who joins after the start is a plain dot: their phone says so, the host counts them, and nobody is sent pet seeds any more.
const latecomer=phone(code,(await post('join',{code,name:'Latecomer',as:'audience'})).token,'late');await until(latecomer,v=>v.you?.late===true,'the latecomer to be a dot');latecomer.stop=true;await until(host,v=>v.late===1&&!('pets' in v),'the host to draw one late dot');console.log('latecomer is a dot, not a pet');
for(let round=0;round<5;round++){
 const v=await until(host,v=>v.phase==='submit','submissions');const kind=v.round.kind;console.log(`round ${round+1}: ${kind}`);await sleep(HOLD);
 await Promise.all(players.map((p,i)=>post('submit',{code,value:kind==='draw'?PNG:`${kind} entry ${i+1} ${Math.random().toString(36).slice(2,7)}`},p.token)));
 // The room moves on by itself once every player has submitted.
 if(kind!=='prompt'){const voting=await until(host,v=>v.phase==='vote','voting');if(kind==='draw'){const image=voting.entries.find(e=>e.image?.startsWith('/img/'));if(!image)fail('drawings are not served from /img/');const r=await fetch(base+image.image);if(!r.ok||r.headers.get('content-type')!=='image/png'||!r.headers.get('cache-control')?.includes('immutable'))fail(`image ${image.image} answered ${r.status} ${r.headers.get('content-type')} ${r.headers.get('cache-control')}`);console.log(`  drawing served: ${image.image}`)}
  await sleep(HOLD);
  // Audience votes count until the last player votes, which reveals the round.
  const votes={};await Promise.all(phones.filter(p=>p.role==='audience').map(async p=>{const view=await until(p,v=>v.phase==='vote','the audience to see the vote');const entry=pick(view.entries).id;votes[p.token]=entry;await post('vote',{code,entry},p.token)}));
  await until(host,v=>v.audienceVoted===AUDIENCE,'every audience vote');
  await Promise.all(phones.filter(p=>p.role==='player').map(async p=>{const view=await until(p,v=>v.phase==='vote','a player to see the vote');await post('vote',{code,entry:pick(view.entries.filter(e=>!e.own)).id},p.token)}));
  const shown=await until(host,v=>v.phase==='reveal','the reveal');const crowd=shown.entries.reduce((n,e)=>n+(e.crowd||0),0),top=Math.max(...shown.entries.map(e=>e.crowd||0));
  if(crowd!==AUDIENCE)fail(`reveal counted ${crowd} audience votes, not ${AUDIENCE}`);if(shown.entries.some(e=>e.favourite!==(e.crowd===top)))fail('crowd pick is not the most-voted entry');
  for(const [token,entry] of Object.entries(votes)){const e=shown.entries.find(e=>e.id===entry);if(kind==='bluff'?e.truth:kind!=='pitch'&&e.ai)expected.set(token,expected.get(token)+1000)}
  console.log(`  ${crowd} crowd votes, crowd pick: ${shown.entries.filter(e=>e.favourite).map(e=>e.owner).join(', ')}`)}
 else await until(host,v=>v.phase==='reveal','the judge');
 await sleep(HOLD);await post('advance',{code},created.token)}
await until(host,v=>v.phase==='finished','the final scores');await sleep(2500);
for(const p of phones.filter(p=>p.role==='audience'))if(p.view.you.score!==expected.get(p.token))fail(`an audience member has ${p.view.you.score} crowd points, expected ${expected.get(p.token)}`);
const leaders=host.view.crowdLeaders;console.log(`audience scores match their votes; crowd leaders: ${leaders.map(a=>`${a.name} ${a.score}`).join(', ')||'none'}`);
for(const p of [host,...phones])p.stop=true;await sleep(2200);
const l=stats.latencies.sort((a,b)=>a-b),q=n=>l[Math.min(l.length-1,Math.floor(l.length*n))].toFixed(1),secs=(performance.now()-t0)/1000;
console.log(`\n${phones.length+1} phones for ${secs.toFixed(0)}s: ${stats.polls} polls (${(stats.polls/secs).toFixed(0)}/s), ${stats.notModified} not modified, ${stats.errors} errors`);
console.log(`poll latency ms: p50 ${q(.5)}, p95 ${q(.95)}, p99 ${q(.99)}, max ${l.at(-1).toFixed(1)}`);
console.log(`state payload: largest ${(stats.maxBytes/1024).toFixed(1)} KB, ${(stats.bytes/1048576).toFixed(1)} MB sent in all`);
if(stats.errors)fail(`${stats.errors} polls failed`);console.log('PASS');
