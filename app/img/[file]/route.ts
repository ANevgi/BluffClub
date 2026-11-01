import {NextResponse} from 'next/server';
import {imageFor} from '../../../lib/game';
export const runtime='nodejs';export const dynamic='force-dynamic';
// /img/<room>-<key>.png: drawings and generated images, out of the polled state. Keys are random and an image never changes, so browsers and Cloudflare's edge (it caches .png by extension) fetch each one once.
export async function GET(_req:Request,{params}:{params:Promise<{file:string}>}){const m=/^([A-Z]{5})-([0-9a-f]{16})\.png$/.exec((await params).file);const image=m&&imageFor(m[1],m[2]);if(!image)return new NextResponse('Not found',{status:404,headers:{'Cache-Control':'no-store'}});return new NextResponse(new Uint8Array(image),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400, immutable','X-Content-Type-Options':'nosniff'}})}
