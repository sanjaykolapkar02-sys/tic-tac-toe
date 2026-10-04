'use client';

import { useEffect, useRef, useState } from 'react';
import { computerMove, move, nextRound, outcome, type Mark } from '../lib/game';
import { choices, choose, freshArena, gameNames, nextRpsRound, rpsOutcome, type ArenaGame, type Choice, type GameKind } from '../lib/arena';

type Room = { id: string; version: number; game: ArenaGame; role: Mark; joined: boolean };
type Mode = 'online' | 'cpu' | 'friend';
const positions = ['Top left', 'Top center', 'Top right', 'Middle left', 'Middle center', 'Middle right', 'Bottom left', 'Bottom center', 'Bottom right'];
const hands = { rock: '✊', paper: '✋', scissors: '✌️' };
const labels = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

export default function Home() {
  const [mode, setMode] = useState<Mode>('online');
  const [selected, setSelected] = useState<GameKind>('rps');
  const [local, setLocal] = useState<ArenaGame>(() => freshArena('rps'));
  const [room, setRoom] = useState<Room | null>(null);
  const [invite, setInvite] = useState('');
  const [link, setLink] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const actionLock = useRef(false);
  const isOnline = mode === 'online';
  const game = isOnline ? room?.game ?? freshArena(selected) : local;
  const kind = game.kind;
  const tttResult = game.kind === 'ttt' ? outcome(game.board) : null;
  const winner = game.kind === 'ttt' ? tttResult?.winner ?? null : rpsOutcome(game.picks);
  const thinking = mode === 'cpu' && game.kind === 'ttt' && game.turn === 'O' && !winner;
  const localRole: Mark = game.kind === 'rps' && mode === 'friend' && game.submitted.X ? 'O' : 'X';
  const role = isOnline ? room?.role ?? 'X' : localRole;
  const ready = Boolean(room && game.ready.includes(room.role));

  async function request(method: string, body?: object, id?: string) {
    const response = await fetch(`/api/rooms${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(12000),
    });
    const data = await response.json() as Room & { error?: string };
    if (!response.ok) throw Object.assign(new Error(data.error || 'Could not connect to the game.'), { status: response.status });
    return data as Room;
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const initial = params.get('game') === 'ttt' ? 'ttt' : 'rps';
    setSelected(initial); setLocal(freshArena(initial));
    const id = params.get('room');
    if (!id) return;
    setInvite(id); setBusy(true);
    request('GET', undefined, id).then(data => {
      if (cancelled) return;
      setRoom(data); setSelected(data.game.kind); setConnected(true); setLink(`${window.location.origin}/?room=${data.id}`);
    }).catch(err => { if (!cancelled && err.status !== 403) setError(err.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
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
    const timer = setTimeout(() => setLocal(previous => previous.kind === 'ttt' ? { ...move(previous, 'O', computerMove(previous.board)), kind: 'ttt' } : previous), 420);
    return () => clearTimeout(timer);
  }, [thinking, local]);

  async function act(action: string, extra: { index?: number; id?: string; choice?: Choice; kind?: GameKind } = {}) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try {
      const data = await request('POST', { action, id: room?.id, version: room?.version, ...(action === 'create' ? { kind: selected } : {}), ...extra });
      setRoom(previous => previous?.id === data.id && previous.version > data.version ? previous : data);
      setSelected(data.game.kind); setInvite(data.id); setConnected(true);
      const url = `${window.location.origin}/?room=${data.id}`;
      setLink(url); window.history.replaceState(null, '', url);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect. Please try again.'); }
    finally { actionLock.current = false; setBusy(false); }
  }

  function switchMode(next: Mode) {
    if (busy) return;
    setMode(next); setError(''); setLocal(freshArena(kind)); setHandoff(false);
    if (next === 'online' && room) setConnected(false);
  }
  function selectGame(next: GameKind) {
    if (busy || next === kind) return;
    setError(''); setHandoff(false);
    if (isOnline && room?.joined) { void act('switch', { kind: next }); return; }
    if (isOnline && (room || invite)) return;
    setSelected(next); setLocal(freshArena(next));
    window.history.replaceState(null, '', `/?game=${next}`);
  }
  function leave() {
    setRoom(null); setInvite(''); setLink(''); setJoinInput(''); setError(''); setSelected(kind);
    window.history.replaceState(null, '', `/?game=${kind}`);
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
    void act('join', { id });
  }
  function pick(choice: Choice) {
    if (isOnline) { void act('choose', { choice }); return; }
    if (game.kind !== 'rps' || winner || handoff) return;
    let next = choose(game, localRole, choice);
    if (mode === 'cpu') {
      const random = crypto.getRandomValues(new Uint32Array(1))[0];
      next = choose(next, 'O', choices[random % choices.length]);
    } else if (localRole === 'X') setHandoff(true);
    setLocal(next);
  }
  function advance() {
    setHandoff(false);
    setLocal(previous => previous.kind === 'rps' ? nextRpsRound(previous) : { ...nextRound(previous), kind: 'ttt', ...(mode === 'cpu' ? { turn: 'X' as const } : {}) });
  }

  const playable = !busy && !winner && !thinking && (!isOnline || Boolean(room?.joined && connected && game.kind === 'ttt' && game.turn === room.role));
  let status = game.kind === 'ttt' ? mode === 'cpu' ? thinking ? 'Computer is thinking…' : 'Your turn' : `Player ${game.turn}'s turn` : mode === 'friend' ? `Player ${localRole === 'X' ? '1' : '2'}, choose your hand` : 'Choose your hand';
  if (isOnline) {
    status = !room ? 'Create or join a room' : !connected ? 'Reconnecting…' : !room.joined ? 'Waiting for your brother…'
      : game.kind === 'ttt' ? game.turn === room.role ? 'Your turn' : "Your brother's turn"
      : game.submitted[room.role] ? 'Choice locked. Waiting for your brother…' : game.submitted[room.role === 'X' ? 'O' : 'X'] ? 'Your brother is ready. Make your choice!' : 'Choose your hand';
  }
  if (winner) status = winner === 'tie' ? "It's a tie!" : isOnline ? winner === room?.role ? 'You win!' : 'Your brother wins!' : mode === 'cpu' ? winner === 'X' ? 'You win!' : 'Computer wins!' : `Player ${winner === 'X' ? '1' : '2'} wins!`;
  if (handoff && !isOnline && kind === 'rps' && !winner) status = 'Player 1 is ready. Pass the device.';
  const symbol = winner === 'tie' ? '=' : kind === 'rps' ? '✌️' : (winner || (game.kind === 'ttt' ? game.turn : 'X')) === 'X' ? '×' : '○';
  const pending = game.pendingSwitch;
  const rules = kind === 'rps' ? 'Rock beats scissors. Scissors beat paper. Paper beats rock.' : 'Three in a row wins.';
  const canPick = !busy && !winner && !handoff && game.kind === 'rps' && (!isOnline || Boolean(room?.joined && connected && !game.submitted[role]));

  return <main className="app-shell">
    <header className="masthead"><div className="brand-mark" aria-hidden="true"><span>×</span><span>○</span></div><div><p className="eyebrow">Play together, wherever you are</p><h1>Play <span>Together.</span></h1></div></header>
    <nav className="game-picker" aria-label="Choose game">
      {(['rps', 'ttt'] as const).map(value => <button key={value} className={`game-tab ${kind === value ? 'active' : ''}`} aria-pressed={kind === value} disabled={busy || (isOnline && Boolean((room && !room.joined) || (!room && invite)))} onClick={() => selectGame(value)}><span aria-hidden="true">{value === 'rps' ? '✊ ✋ ✌️' : '× ○'}</span>{gameNames[value]}</button>)}
    </nav>
    <section className="game-card" aria-label={`${gameNames[kind]} game`}>
      <div className="card-top"><div><p className="section-label">GAME MODE</p><div className="mode-switch" role="group" aria-label="Choose game mode">
        {([['online', 'Online'], ['cpu', 'Computer'], ['friend', 'Same device']] as const).map(([value, label]) => <button key={value} className={`mode-button ${mode === value ? 'active' : ''}`} disabled={busy} onClick={() => switchMode(value)} aria-pressed={mode === value}>{label}</button>)}
      </div></div>
      {isOnline ? (room || invite) && <button className="text-button" disabled={busy} onClick={leave}>Exit room</button> : <button className="text-button" onClick={() => { setLocal(freshArena(kind)); setHandoff(false); }}>New match</button>}</div>

      {isOnline && <div className="online-panel">
        {!room ? <>
          <h2>{invite ? 'You’re invited to play' : 'One link. Two players.'}</h2>
          <p>{invite ? 'Join your brother’s room to see which game he picked.' : 'Create a room and send the invite link to your brother. Switch games together anytime.'}</p>
          <div className="lobby-actions"><button className="primary-button" disabled={busy} onClick={() => void act(invite ? 'join' : 'create', invite ? { id: invite } : {})}>{busy ? 'Connecting…' : invite ? 'Join this room' : 'Create a room'}</button>{invite && <button className="secondary-button" disabled={busy} onClick={() => void act('create')}>Create another room</button>}</div>
          {!invite && <form className="join-form" onSubmit={event => { event.preventDefault(); join(); }}><label htmlFor="invite-input">Already have an invite?</label><div><input id="invite-input" placeholder="Paste the invite link" value={joinInput} onChange={event => setJoinInput(event.target.value)} autoComplete="off" required /><button className="secondary-button" disabled={busy}>Join</button></div></form>}
        </> : <>
          <div className="room-heading"><span className={`connection ${connected ? 'connected' : ''}`}>{connected ? room.joined ? 'Both players joined' : 'Room is ready' : 'Reconnecting…'}</span><span className="seat">You are <b>Player {room.role === 'X' ? '1' : '2'}</b></span></div>
          <div className="invite-link"><input aria-label="Invite link" value={link} readOnly onFocus={event => event.target.select()} /><button className="secondary-button" onClick={() => void copyLink()}>{copied ? 'Copied!' : 'Copy link'}</button></div>
          {!room.joined && <p className="room-hint">Send this link to your brother. The game starts when he joins.</p>}
          {!connected && <p className="room-hint" role="status">Moves are paused while we reconnect. Your game is saved.</p>}
        </>}
      </div>}

      {isOnline && room && pending && <div className="switch-prompt" role="status"><p>{pending.ready.includes(room.role) ? `Waiting for your brother to switch to ${gameNames[pending.kind]}.` : `Your brother wants to play ${gameNames[pending.kind]}.`} A switch starts a new match with fresh scores.</p><div>{!pending.ready.includes(room.role) && <button className="primary-button" disabled={busy || !connected} onClick={() => void act('switch', { kind: pending.kind })}>Switch game</button>}<button className="secondary-button" disabled={busy || !connected} onClick={() => void act('switch', { kind })}>{pending.ready.includes(room.role) ? 'Cancel switch' : 'Keep this game'}</button></div></div>}
      {error && <p className="error-message" role="alert">{error}</p>}

      <div className="scoreboard" aria-label="Match score">
        {(['X', 'ties', 'O'] as const).map(key => <div key={key} className={`score-panel score-${key === 'ties' ? 'tie' : key.toLowerCase()}`}><div className="score-heading"><span className="score-symbol" aria-hidden="true">{key === 'X' ? '×' : key === 'O' ? '○' : '='}</span><span>{key === 'ties' ? 'Ties' : isOnline ? !room ? `Player ${key === 'X' ? '1' : '2'}` : room.role === key ? 'You' : 'Brother' : mode === 'cpu' ? key === 'X' ? 'You' : 'Computer' : `Player ${key === 'X' ? '1' : '2'}`}</span></div><strong>{game.scores[key]}</strong><span className="score-caption">{key === 'ties' ? 'DRAW' : kind === 'ttt' ? key : 'WINS'}</span></div>)}
      </div>
      <div className="play-area">
        <div className="turn-row"><div className={`turn-indicator ${winner === 'tie' ? 'tie' : winner === 'O' ? 'o' : ''}`} aria-hidden="true">{symbol}</div><div><p className="section-label">{winner ? 'ROUND OVER' : kind === 'rps' ? 'PICK & REVEAL' : 'CURRENT TURN'}</p><p className="status" role="status" aria-live="polite">{status}</p></div><span className="round-label">ROUND {String(game.round).padStart(2, '0')}</span></div>
        {game.kind === 'ttt' ? <div className="board" aria-label="Tic-tac-toe board">{game.board.map((mark, index) => <button key={index} className={`cell ${mark?.toLowerCase() || ''} ${tttResult?.line.includes(index) ? 'winning' : ''}`} disabled={!playable || Boolean(mark)} aria-label={`${positions[index]}, ${mark || 'empty'}`} onClick={() => isOnline ? void act('move', { index }) : setLocal(previous => previous.kind === 'ttt' ? { ...move(previous, previous.turn, index), kind: 'ttt' } : previous)}>{mark && <span aria-hidden="true">{mark === 'X' ? '×' : '○'}</span>}</button>)}</div> : <>
          <div className="hands-reveal" aria-label="Round choices">{(['X', 'O'] as const).map(seat => {
            const visible = Boolean(winner || (isOnline && room?.role === seat));
            const choice = visible ? game.picks[seat] : null;
            const name = isOnline ? room?.role === seat ? 'You' : 'Brother' : mode === 'cpu' ? seat === 'X' ? 'You' : 'Computer' : `Player ${seat === 'X' ? '1' : '2'}`;
            return <div key={seat} className={`hand-panel ${winner === seat ? 'hand-winner' : ''}`}><span>{name}</span><strong aria-hidden="true">{choice ? hands[choice] : game.submitted[seat] ? '🔒' : '?'}</strong><p>{choice ? labels[choice] : game.submitted[seat] ? 'Locked in' : 'Choosing…'}</p></div>;
          })}</div>
          {handoff && !isOnline && !winner ? <div className="handoff"><p>Player 1’s choice is hidden. Hand the device to Player 2.</p><button className="primary-button" onClick={() => setHandoff(false)}>Player 2 is ready</button></div> : <div className="choice-grid" aria-label="Choose your hand">{choices.map(choice => <button key={choice} className={`choice-button ${isOnline && game.picks[role] === choice ? 'chosen' : ''}`} disabled={!canPick} onClick={() => pick(choice)}><span aria-hidden="true">{hands[choice]}</span>{labels[choice]}</button>)}</div>}
          <p className="choice-hint">{winner ? rules : 'Choices lock when picked. Both hands reveal together.'}</p>
        </>}
        {isOnline ? <button className="next-button" disabled={!winner || busy || ready || !connected} onClick={() => void act('ready')}>{ready ? 'Waiting for your brother…' : winner && game.ready.length ? 'Play again — brother is ready' : 'Play again'}</button> : <button className="next-button" disabled={kind === 'rps' && !winner} onClick={advance}>Next round</button>}
      </div>
    </section>
    <footer className="footer-note">{isOnline ? 'Invite links work for 7 days. ' : ''}{rules}</footer>
  </main>;
}
