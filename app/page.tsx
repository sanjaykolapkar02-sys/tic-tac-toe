'use client';

import { useEffect, useRef, useState } from 'react';
import { computerMove, freshGame, move, nextRound, outcome, type Game, type Mark } from '../lib/game';

type Room = { id: string; version: number; game: Game; role: Mark; joined: boolean };
type Mode = 'online' | 'cpu' | 'friend';
const positions = ['Top left', 'Top center', 'Top right', 'Middle left', 'Middle center', 'Middle right', 'Bottom left', 'Bottom center', 'Bottom right'];

export default function Home() {
  const [mode, setMode] = useState<Mode>('online');
  const [local, setLocal] = useState(freshGame);
  const [room, setRoom] = useState<Room | null>(null);
  const [invite, setInvite] = useState('');
  const [link, setLink] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const actionLock = useRef(false);
  const game = mode === 'online' ? room?.game ?? freshGame() : local;
  const result = outcome(game.board);
  const thinking = mode === 'cpu' && local.turn === 'O' && !result;

  async function request(method: string, body?: object, id?: string) {
    const response = await fetch(`/api/rooms${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json() as Room & { error?: string };
    if (!response.ok) throw Object.assign(new Error(data.error || 'Could not connect to the game.'), { status: response.status });
    return data as Room;
  }

  useEffect(() => {
    let cancelled = false;
    const id = new URLSearchParams(window.location.search).get('room');
    if (!id) return;
    setInvite(id);
    setBusy(true);
    request('GET', undefined, id).then(data => {
      if (cancelled) return;
      setRoom(data); setConnected(true); setLink(`${window.location.origin}/?room=${data.id}`);
    }).catch(err => {
      if (!cancelled && err.status !== 403) setError(err.message);
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!room || mode !== 'online') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = room.id;
    async function poll() {
      try {
        const data = await request('GET', undefined, id);
        if (stopped) return;
        setRoom(previous => previous?.id === id && data.version >= previous.version ? data : previous);
        setConnected(true);
      } catch { if (!stopped) setConnected(false); }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    timer = setTimeout(poll, 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [room?.id, mode]);

  useEffect(() => {
    if (!thinking) return;
    const timer = setTimeout(() => setLocal(previous => move(previous, 'O', computerMove(previous.board))), 420);
    return () => clearTimeout(timer);
  }, [thinking, local]);

  async function act(action: string, index?: number, id?: string) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try {
      const data = await request('POST', { action, id: id || room?.id, index, version: room?.version });
      setRoom(previous => previous?.id === data.id && previous.version > data.version ? previous : data);
      setInvite(data.id); setConnected(true);
      const url = `${window.location.origin}/?room=${data.id}`;
      setLink(url); window.history.replaceState(null, '', url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect. Please try again.');
    } finally { actionLock.current = false; setBusy(false); }
  }

  function switchMode(next: Mode) {
    if (busy) return;
    setMode(next); setError(''); setLocal(freshGame());
  }
  function leave() {
    setRoom(null); setInvite(''); setLink(''); setJoinInput(''); setError('');
    window.history.replaceState(null, '', '/');
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Select and copy the invite link below.'); }
  }
  function join() {
    const text = joinInput.trim();
    let id = text;
    try { id = new URL(text).searchParams.get('room') || text; } catch { /* A room code is also accepted. */ }
    if (!/^[a-f0-9]{32}$/.test(id)) { setError('Paste the full invite link from the other player.'); return; }
    void act('join', undefined, id);
  }

  const isOnline = mode === 'online';
  const playable = !busy && !result && !thinking && (!isOnline || Boolean(room?.joined && connected && game.turn === room.role));
  let status = mode === 'cpu' ? (thinking ? 'Computer is thinking…' : 'Your turn') : `Player ${game.turn}'s turn`;
  if (isOnline) status = !room ? 'Create or join a room' : !connected ? 'Reconnecting…' : !room.joined ? 'Waiting for your brother…' : game.turn === room.role ? 'Your turn' : "Your brother's turn";
  if (result) status = result.winner === 'tie' ? "It's a tie!" : isOnline ? result.winner === room?.role ? 'You win!' : 'Your brother wins!' : mode === 'cpu' ? result.winner === 'X' ? 'You win!' : 'Computer wins!' : `Player ${result.winner} wins!`;
  const symbol = result?.winner === 'tie' ? '=' : (result?.winner || game.turn) === 'X' ? '×' : '○';
  const ready = Boolean(room && game.ready.includes(room.role));

  return <main className="app-shell">
    <header className="masthead"><div className="brand-mark" aria-hidden="true"><span>×</span><span>○</span></div><div><p className="eyebrow">Play together, wherever you are</p><h1>Tic Tac <span>Toe.</span></h1></div></header>
    <section className="game-card" aria-label="Tic-tac-toe game">
      <div className="card-top"><div><p className="section-label">GAME MODE</p><div className="mode-switch" role="group" aria-label="Choose game mode">
        {([['online', 'Online'], ['cpu', 'Computer'], ['friend', 'Same device']] as const).map(([value, label]) => <button key={value} className={`mode-button ${mode === value ? 'active' : ''}`} disabled={busy} onClick={() => switchMode(value)} aria-pressed={mode === value}>{label}</button>)}
      </div></div>
      {isOnline ? (room || invite) && <button className="text-button" disabled={busy} onClick={leave}>Exit room</button> : <button className="text-button" onClick={() => setLocal(freshGame())}>New match</button>}</div>

      {isOnline && <div className="online-panel">
        {!room ? <>
          <h2>{invite ? 'You’re invited to play' : 'One link. Two players.'}</h2>
          <p>{invite ? 'Join your brother’s room. Your seat stays yours when you refresh.' : 'Create a room and send the invite link to your brother.'}</p>
          <div className="lobby-actions"><button className="primary-button" disabled={busy} onClick={() => void act(invite ? 'join' : 'create', undefined, invite || undefined)}>{busy ? 'Connecting…' : invite ? 'Join this room' : 'Create a room'}</button>{invite && <button className="secondary-button" disabled={busy} onClick={() => void act('create')}>Create another room</button>}</div>
          {!invite && <form className="join-form" onSubmit={event => { event.preventDefault(); join(); }}><label htmlFor="invite-input">Already have an invite?</label><div><input id="invite-input" placeholder="Paste the invite link" value={joinInput} onChange={event => setJoinInput(event.target.value)} autoComplete="off" required /><button className="secondary-button" disabled={busy}>Join</button></div></form>}
        </> : <>
          <div className="room-heading"><span className={`connection ${connected ? 'connected' : ''}`}>{connected ? room.joined ? 'Both players joined' : 'Room is ready' : 'Reconnecting…'}</span><span className="seat">You are <b>{room.role}</b></span></div>
          <div className="invite-link"><input aria-label="Invite link" value={link} readOnly onFocus={event => event.target.select()} /><button className="secondary-button" onClick={() => void copyLink()}>{copied ? 'Copied!' : 'Copy link'}</button></div>
          {!room.joined && <p className="room-hint">Send this link to your brother. The game starts when he joins.</p>}
          {!connected && <p className="room-hint" role="status">Moves are paused while we reconnect. Your game is saved.</p>}
        </>}
      </div>}

      {error && <p className="error-message" role="alert">{error}</p>}

      <div className="scoreboard" aria-label="Match score">
        {(['X', 'ties', 'O'] as const).map(key => <div key={key} className={`score-panel score-${key === 'ties' ? 'tie' : key.toLowerCase()}`}><div className="score-heading"><span className="score-symbol" aria-hidden="true">{key === 'X' ? '×' : key === 'O' ? '○' : '='}</span><span>{key === 'ties' ? 'Ties' : isOnline ? room?.role === key ? 'You' : 'Brother' : mode === 'cpu' ? key === 'X' ? 'You' : 'Computer' : `Player ${key}`}</span></div><strong>{game.scores[key]}</strong><span className="score-caption">{key === 'ties' ? 'DRAW' : key}</span></div>)}
      </div>
      <div className="play-area">
        <div className="turn-row"><div className={`turn-indicator ${result?.winner === 'tie' ? 'tie' : (result?.winner || game.turn).toLowerCase()}`} aria-hidden="true">{symbol}</div><div><p className="section-label">{result ? 'ROUND OVER' : 'CURRENT TURN'}</p><p className="status" role="status" aria-live="polite">{status}</p></div><span className="round-label">ROUND {String(game.round).padStart(2, '0')}</span></div>
        <div className="board" aria-label="Tic-tac-toe board">{game.board.map((mark, index) => <button key={index} className={`cell ${mark?.toLowerCase() || ''} ${result?.line.includes(index) ? 'winning' : ''}`} disabled={!playable || Boolean(mark)} aria-label={`${positions[index]}, ${mark || 'empty'}`} onClick={() => isOnline ? void act('move', index) : setLocal(previous => move(previous, previous.turn, index))}>{mark && <span aria-hidden="true">{mark === 'X' ? '×' : '○'}</span>}</button>)}</div>
        {isOnline ? <button className="next-button" disabled={!result || busy || ready || !connected} onClick={() => void act('ready')}>{ready ? 'Waiting for your brother…' : result && game.ready.length ? 'Play again — brother is ready' : 'Play again'}</button> : <button className="next-button" onClick={() => setLocal(previous => mode === 'cpu' ? { ...nextRound(previous), turn: 'X' } : nextRound(previous))}>Next round</button>}
      </div>
    </section>
    <footer className="footer-note">{isOnline ? 'Invite links work for 7 days. Three in a row wins.' : 'Three in a row wins. Take your time, make your move.'}</footer>
  </main>;
}
