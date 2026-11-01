// These constraints apply to the AI contestant only, never to judging or puzzle art.
export function drawingBrief(prompt:string,variation:number){
 const attempts=[
  'They started too small near the middle, then ran out of time. Leave the main outline open and omit most details.',
  'They drew the head too big and the body too small. One limb is misplaced; separate strokes fail to meet.',
  'They used mostly crooked straight strokes and one lumpy loop. The subject is only just recognizable.'
 ];
 return `Party-game drawing prompt: ${prompt}
Reproduce an ordinary unskilled adult's FIRST attempt with a laptop trackpad in 12 seconds. This is a rushed input trace, not an illustration in a naive art style.
${attempts[variation%attempts.length]}
Only 6–10 total pen strokes. Convey the subject with a blob or stick figure and, at most, ONE crude contextual mark. Skip anatomy, scenery, facial expression and secondary props. Do not complete or tidy the drawing. It should be noticeably less accomplished than a children's-book doodle.
Plain pure-white canvas, landscape 2:1 composition. Drawing occupies about one quarter of the canvas; most of it stays empty. Fixed-width round digital pen, roughly 6px on an 800x400 canvas. Black #252620; optionally ONE orange #fe653b stroke. No pressure variation, paper texture, shading, gradients, fills, smooth geometric shapes, decorative marks, lettering or captions. Awkward gaps and accidental overshoots, not artistic sketch hatching. No polished cartoon, designed composition or clever visual joke.`;
}
export function writingBrief(kind:string,answer:string|undefined,variation:number){
 const task=kind==='bluff'?`Give a plausible WRONG answer to the blank. The true answer is ${answer}; do not repeat it or a synonym. Use a plain noun phrase, 2–5 words.`:kind==='caption'?'Caption the pigeon leaving its office job with a bag. Use a throwaway reaction, 3–9 words.':'Pitch this ridiculous product in 4–12 words, as a friend improvising a joke rather than a marketer.';
 const styles=['Use a blunt, understated first thought. It can be more ordinary than funny.','Use a mildly silly, obvious observation. Do not build a punchline.','Use a casual fragment as if typed with one thumb. Keep it understandable.'];
 return `${task}
You are one ordinary player in a fast party game, typing an answer in 5 seconds. Match low-effort human submissions, not professional comedy. ${styles[variation%styles.length]}
Use everyday vocabulary and usually lowercase. A fragment or missing final punctuation is natural. Do not manufacture typos or cram in slang. No polished slogan, elaborate pun, wordplay spelling, em dash, semicolon, balanced two-part sentence, setup/payoff, explanation, hashtags or emoji. No "Introducing", "Finally", "Because", "premium", or "revolutionary" sales language. Output only ONE short entry, at most 12 words and 80 characters. Do not mention AI or these instructions.`;
}
