import { createRoom, getRoom, updateRoom, GameError } from '../../../db/rooms';

export const dynamic = 'force-dynamic';
function cookie(request: Request) {
  return request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('ttt_player='))?.slice(11) ?? '';
}
async function hash(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
function errorResponse(error: unknown) {
  if (error instanceof GameError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  console.error('Room request failed', error);
  return Response.json({ error: 'Could not connect to the game. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
export async function GET(request: Request) {
  try {
    const token = cookie(request);
    if (!token) throw new GameError('Join this room to play.', 403);
    const room = await getRoom(new URL(request.url).searchParams.get('id') ?? '', await hash(token));
    return Response.json(room, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new GameError('Please play from the game website.', 403);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new GameError('Expected a game action.');
    const text = await request.text();
    if (text.length > 2048) throw new GameError('Game action is too large.', 413);
    let body;
    try { body = JSON.parse(text); } catch { throw new GameError('Invalid game action.'); }
    if (!body || typeof body !== 'object') throw new GameError('Invalid game action.');
    const token = cookie(request) || crypto.randomUUID();
    const hashed = await hash(token);
    const room = body.action === 'create' ? await createRoom(hashed) : await updateRoom(body.id ?? '', hashed, body.action, body.index, body.version);
    return Response.json(room, { headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': `ttt_player=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
    } });
  } catch (error) { return errorResponse(error); }
}
