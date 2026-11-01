import {NextRequest,NextResponse} from 'next/server';
import {roomFor,hostOnly,Gone} from '../../../lib/game';
import {narratorKey} from '../../../lib/ai';
export const runtime='nodejs';export const dynamic='force-dynamic';
// Host screens only: a short-lived Realtime key so the host's browser can speak the narration itself.
export async function POST(req:NextRequest){try{const body=await req.json();const r=roomFor(String(body.code||''));hostOnly(r,req.headers.get('authorization')?.replace(/^Bearer /,'')||'');return NextResponse.json({value:await narratorKey()},{headers:{'Cache-Control':'no-store'}})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Narrator unavailable'},{status:e instanceof Gone?404:400,headers:{'Cache-Control':'no-store'}})}}
