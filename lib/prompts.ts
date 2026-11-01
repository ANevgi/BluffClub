import {randomInt} from 'node:crypto';
// Prompt banks. Each game draws one per round, and the server works through a whole bank before repeating any.
// Bluff blanks are about made-up places and people, so the answer is true because we say so.
export const bluffs=[
 {prompt:'In our fictional museum, the most heavily guarded exhibit is a _____.',answer:'rubber duck'},
 {prompt:'Members of the fictional Royal Biscuit Society swear their oath on a _____.',answer:'custard cream'},
 {prompt:'The made-up village of Little Puddleby banned _____ after the Great Incident of 1987.',answer:'leaf blowers'},
 {prompt:'On our imaginary airline, every passenger gets a free _____ at take-off.',answer:'tiny trumpet'},
 {prompt:'The fictional King Barry the Third was crowned wearing a _____.',answer:'tea cosy'},
 {prompt:'At our made-up zoo, the longest queue is always for the _____.',answer:'grumpy tortoise'},
 {prompt:'In this invented sport, players score by throwing a _____.',answer:'frozen sausage'},
 {prompt:'The fictional town of Wobbleton’s official mascot is a _____.',answer:'confused badger'},
 {prompt:'Scientists at our imaginary lab spent ten years teaching a _____ to whistle.',answer:'goldfish'},
 {prompt:'In our made-up country, the national anthem is performed by a _____.',answer:'choir of geese'},
 {prompt:'Our fictional pirate captain’s most feared weapon is a _____.',answer:'wet sock'},
 {prompt:'Detention at our imaginary school is spent polishing the headteacher’s _____.',answer:'spoon collection'}
];
export const drawings=[
 'A pigeon being fired from its office job.','A snowman on a beach holiday.','A cat robbing a bank.','A dinosaur trying to use a laptop.',
 'A goldfish at the gym.','A wizard stuck in traffic.','A potato’s wedding day.','A shark at a job interview.',
 'An astronaut who forgot their packed lunch.','A dog judging a baking contest.','A haunted toaster.','A penguin trying out a jetpack.'
];
export const pitches=[
 'Noise-cancelling headphones… for houseplants.','A smart fridge that judges your snacks.','Waterproof teabags.','An umbrella for your feet.',
 'A dating app for socks that lost their partner.','Sunglasses for cats.','A doorbell that only plays a sad trombone.','Self-buttering toast.',
 'A gym membership for your goldfish.','An inflatable dartboard.','A candle that smells like Monday morning.','An alarm clock that runs away.'
];
// Hands out a bank's items in a random order, reshuffling only once all have been used.
export function bag<T>(items:T[]){let left:T[]=[];return ()=>{if(!left.length){left=[...items];for(let i=left.length-1;i>0;i--){const j=randomInt(i+1);[left[i],left[j]]=[left[j],left[i]]}}return left.pop()!}}
