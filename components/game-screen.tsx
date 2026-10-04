'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Gamepad2, LockKeyhole, RotateCcw, Users, Wifi, X } from 'lucide-react';
import { SmoothScroll } from './smooth-scroll';
import { computerMove, move, nextRound, outcome, type Mark } from '../lib/game';
import { choices, choose, freshArena, gameNames, nextRpsRound, rpsOutcome, type ArenaGame, type Choice, type GameKind } from '../lib/arena';

type Room = { id: string; version: number; game: ArenaGame; role: Mark; joined: boolean };
type Mode = 'online' | 'cpu' | 'friend';
const positions = ['Top left', 'Top center', 'Top right', 'Middle left', 'Middle center', 'Middle right', 'Bottom left', 'Bottom center', 'Bottom right'];
const hands = { rock: '✊', paper: '✋', scissors: '✌️' };
const labels = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

export default function GameScreen({ initialKind, initialRoom }: { initialKind: GameKind; initialRoom: string }) {
  const [mode, setMode] = useState<Mode>('online');
  const [selected, setSelected] = useState<GameKind>(initialKind);
  const [local, setLocal] = useState<ArenaGame>(() => freshArena(initialKind));
  const [room, setRoom] = useState<Room | null>(null);
  const [invite, setInvite] = useState(initialRoom);
  const [link, setLink] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [busy, setBusy] = useState(Boolean(initialRoom));
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
  const roomId = room?.id;

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
    const id = initialRoom;
    if (!id) return;
    request('GET', undefined, id).then(data => {
      if (cancelled) return;
      setRoom(data); setSelected(data.game.kind); setConnected(true); setLink(`${window.location.origin}/?room=${data.id}`);
    }).catch(err => { if (!cancelled && err.status !== 403) setError(err.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [initialRoom]);

  useEffect(() => {
    if (!roomId || mode !== 'online') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = roomId;
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
  }, [roomId, mode]);

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
    <SmoothScroll />
    <header className="masthead">
      <div className="brand"><div className="brand-mark" aria-hidden="true"><Gamepad2 size={24} /></div><h1>play<span>together.</span></h1></div>
      <p className="header-note"><span aria-hidden="true" /> A little friendly competition.</p>
    </header>

    <div className="workspace">
      <aside className="lobby-sidebar" aria-label="Game setup">
        <section className="setup-panel">
          <p className="section-label">CHOOSE YOUR GAME</p>
          <nav className="game-picker" aria-label="Choose game">
            {(['rps', 'ttt'] as const).map((value, index) => <button key={value} className={['game-tab', kind === value ? 'active' : ''].join(' ')} aria-pressed={kind === value} disabled={busy || (isOnline && Boolean((room && (!room.joined || !connected)) || (!room && invite)))} onClick={() => selectGame(value)}>
              <span className="game-tab-icon" aria-hidden="true">{value === 'rps' ? '✌️' : '×○'}</span>
              <span className="game-tab-copy"><span>{gameNames[value]}</span><small>{value === 'rps' ? 'Pick. Lock. Reveal.' : 'Three in a row.'}</small></span>
              <span className="game-tab-number" aria-hidden="true">{kind === value ? <ArrowRight size={16} /> : '0' + (index + 1)}</span>
            </button>)}
          </nav>
        </section>

        <section className="session-panel" aria-label="Players and room">
          <div className="card-top"><p className="section-label">HOW ARE WE PLAYING?</p>
            {isOnline ? (room || invite) && <button className="text-button" disabled={busy} onClick={leave}>Exit room <X size={13} aria-hidden="true" /></button> : <button className="text-button" onClick={() => { setLocal(freshArena(kind)); setHandoff(false); }}>New match <RotateCcw size={13} aria-hidden="true" /></button>}
          </div>
          <div className="mode-switch" role="group" aria-label="Choose game mode">
            {([['online', 'Online'], ['cpu', 'Computer'], ['friend', 'Same device']] as const).map(([value, label]) => <button key={value} className={['mode-button', mode === value ? 'active' : ''].join(' ')} disabled={busy} onClick={() => switchMode(value)} aria-pressed={mode === value}>{label}</button>)}
          </div>

          {isOnline ? <div className="online-panel">
            {!room ? <>
              <div className="panel-icon" aria-hidden="true"><Users size={20} /></div>
              <h2>{invite ? 'Your seat is waiting.' : 'Bring your brother.'}</h2>
              <p>{invite ? 'Join the room and let the rivalry begin.' : 'Create a room. Share the link. Settle it with a game.'}</p>
              <div className="lobby-actions"><button className="primary-button" disabled={busy} onClick={() => void act(invite ? 'join' : 'create', invite ? { id: invite } : {})}>{busy ? 'Connecting…' : invite ? 'Join this room' : 'Create a room'}<ArrowRight size={17} aria-hidden="true" /></button>{invite && <button className="secondary-button" disabled={busy} onClick={() => void act('create')}>Create another room</button>}</div>
              {!invite && <form className="join-form" onSubmit={event => { event.preventDefault(); join(); }}><label htmlFor="invite-input">Got an invite?</label><div><input id="invite-input" placeholder="Paste a link or room code" value={joinInput} onChange={event => setJoinInput(event.target.value)} autoComplete="off" required /><button className="join-button" disabled={busy} aria-label="Join"> <ArrowRight size={18} aria-hidden="true" /></button></div></form>}
            </> : <>
              <div className="room-heading"><span className={['connection', connected ? 'connected' : ''].join(' ')}><span aria-hidden="true" />{connected ? room.joined ? 'Both players joined' : 'Room is ready' : 'Reconnecting…'}</span><span className="seat">P{room.role === 'X' ? '1' : '2'}</span></div>
              <h2>{room.joined ? 'The room is yours.' : 'One more player.'}</h2>
              <p>{room.joined ? 'Pick a game above to switch together. Your invite stays the same.' : 'Send the invite to your brother. His seat is waiting.'}</p>
              <div className="invite-link"><input aria-label="Invite link" value={link} readOnly onFocus={event => event.target.select()} /><button className="secondary-button" aria-label={copied ? 'Copied!' : 'Copy link'} onClick={() => void copyLink()}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? 'Copied!' : 'Copy link'}</button></div>
              {!connected && <p className="room-hint" role="status">Moves are paused while we reconnect. Your game is saved.</p>}
              <p className="room-hint">You’re Player {room.role === 'X' ? '1' : '2'}. Links last 7 days.</p>
            </>}
          </div> : <div className="local-note"><div className="panel-icon" aria-hidden="true">{mode === 'cpu' ? <Gamepad2 size={20} /> : <Users size={20} />}</div><h2>{mode === 'cpu' ? 'You vs. the computer.' : 'Pass it. Play it.'}</h2><p>{mode === 'cpu' ? kind === 'rps' ? 'A random hand. A fair match. How long can you keep your streak?' : 'Think you can beat the computer? Take X and find out.' : kind === 'rps' ? 'Pick a hand, then pass the device. Your choice stays hidden.' : 'One board, two players. Take turns playing X and O.'}</p></div>}
        </section>

        <section className="match-panel" aria-label="Match score">
          <div className="scoreboard-title"><p className="section-label">THE SCORE SO FAR</p><span>THIS MATCH</span></div>
          <div className="scoreboard">
            {(['X', 'ties', 'O'] as const).map(key => <div key={key} className={'score-panel score-' + (key === 'ties' ? 'tie' : key.toLowerCase())}><div className="score-heading"><span>{key === 'ties' ? 'Ties' : isOnline ? !room ? 'Player ' + (key === 'X' ? '1' : '2') : room.role === key ? 'You' : 'Brother' : mode === 'cpu' ? key === 'X' ? 'You' : 'Computer' : 'Player ' + (key === 'X' ? '1' : '2')}</span><span className="score-symbol" aria-hidden="true">{key === 'X' ? '×' : key === 'O' ? '○' : '='}</span></div><strong key={game.scores[key]}>{game.scores[key]}</strong><span className="score-caption">{key === 'ties' ? 'DRAWS' : 'WINS'}</span></div>)}
          </div>
        </section>
      </aside>

      <section className={['game-card', kind, winner ? 'round-finished' : ''].join(' ')} aria-label={gameNames[kind] + ' game'}>
        <div className="stage-heading"><div><p className="section-label">A LITTLE RIVALRY, A LOT OF FUN</p><h2>{kind === 'rps' ? <>Rock. Paper.<br /><span>Scissors.</span></> : <>Make your<br /><span>next move.</span></>}</h2></div><span className="round-label"><span>ROUND</span>{String(game.round).padStart(2, '0')}</span></div>
        {isOnline && room && pending && <div className="switch-prompt" role="status"><p>{pending.ready.includes(room.role) ? 'Waiting for your brother to switch to ' + gameNames[pending.kind] + '.' : 'Your brother wants to play ' + gameNames[pending.kind] + '.'} A switch starts a new match with fresh scores.</p><div>{!pending.ready.includes(room.role) && <button className="primary-button" disabled={busy || !connected} onClick={() => void act('switch', { kind: pending.kind })}>Switch game <ArrowRight size={16} aria-hidden="true" /></button>}<button className="secondary-button" disabled={busy || !connected} onClick={() => void act('switch', { kind })}>{pending.ready.includes(room.role) ? 'Cancel switch' : 'Keep this game'}</button></div></div>}
        {error && <p className="error-message" role="alert">{error}</p>}

        <div className="play-area">
          <div className={['turn-row', winner ? 'result-row' : ''].join(' ')}><div className={'turn-indicator ' + (winner === 'tie' ? 'tie' : winner === 'O' ? 'o' : '')} aria-hidden="true">{winner ? winner === 'tie' ? '=' : <Check size={20} /> : symbol}</div><div><p className="section-label">{winner ? 'ROUND OVER' : kind === 'rps' ? 'PICK & REVEAL' : 'CURRENT TURN'}</p><p className="status" role="status" aria-live="polite">{status}</p></div></div>
          {game.kind === 'ttt' ? <div className="board" aria-label="Tic-tac-toe board">{game.board.map((mark, index) => <button key={index} className={['cell', mark?.toLowerCase() || '', tttResult?.line.includes(index) ? 'winning' : ''].join(' ')} disabled={!playable || Boolean(mark)} aria-label={positions[index] + ', ' + (mark || 'empty')} onClick={() => isOnline ? void act('move', { index }) : setLocal(previous => previous.kind === 'ttt' ? { ...move(previous, previous.turn, index), kind: 'ttt' } : previous)}>{mark && <span aria-hidden="true">{mark === 'X' ? '×' : '○'}</span>}</button>)}</div> : <>
            <div className="hands-reveal" aria-label="Round choices">{(['X', 'O'] as const).map(seat => {
              const visible = Boolean(winner || (isOnline && room?.role === seat));
              const choice = visible ? game.picks[seat] : null;
              const name = isOnline ? !room ? 'Player ' + (seat === 'X' ? '1' : '2') : room.role === seat ? 'You' : 'Brother' : mode === 'cpu' ? seat === 'X' ? 'You' : 'Computer' : 'Player ' + (seat === 'X' ? '1' : '2');
              return <div key={seat} className={['hand-panel', 'player-' + seat.toLowerCase(), winner === seat ? 'hand-winner' : '', winner ? 'is-revealed' : ''].join(' ')}><div className="hand-heading"><span className="player-avatar" aria-hidden="true">{seat === 'X' ? '01' : '02'}</span><span>{name}</span>{winner === seat && <span className="winner-tag">WINNER</span>}</div><strong className="hand-visual" key={choice || 'hidden'} aria-hidden="true">{choice ? hands[choice] : game.submitted[seat] ? <LockKeyhole size={46} strokeWidth={1.4} /> : <span className="waiting-hand">?</span>}</strong><p>{choice ? labels[choice] : game.submitted[seat] ? 'Locked in' : 'Choosing…'}</p></div>;
            })}</div>
            {handoff && !isOnline && !winner ? <div className="handoff"><LockKeyhole size={20} aria-hidden="true" /><p>Player 1’s choice is hidden. Hand the device to Player 2.</p><button className="primary-button" onClick={() => setHandoff(false)}>Player 2 is ready <ArrowRight size={16} aria-hidden="true" /></button></div> : <><div className="choice-heading"><span>{winner ? 'NICELY PLAYED.' : 'MAKE YOUR PICK'}</span><span><LockKeyhole size={12} aria-hidden="true" />{winner ? 'Both hands revealed' : 'Your hand stays secret'}</span></div><div className="choice-grid" aria-label="Choose your hand">{choices.map(choice => <button key={choice} className={['choice-button', isOnline && game.picks[role] === choice ? 'chosen' : ''].join(' ')} disabled={!canPick} onClick={() => pick(choice)}><span aria-hidden="true">{hands[choice]}</span><span className="choice-label">{labels[choice]}</span><span className="choice-check" aria-hidden="true">{isOnline && game.picks[role] === choice ? <Check size={14} /> : <ArrowRight size={14} />}</span></button>)}</div></>}
          </>}

          {isOnline ? <button className="next-button" disabled={!winner || busy || ready || !connected} onClick={() => void act('ready')}><RotateCcw size={17} aria-hidden="true" />{ready ? 'Waiting for your brother…' : winner && game.ready.length ? 'Play again — brother is ready' : 'Play again'}</button> : <button className="next-button" disabled={kind === 'rps' && !winner} onClick={advance}><RotateCcw size={17} aria-hidden="true" />Next round</button>}
        </div>
        <div className="rules-strip"><span className="rules-label">THE RULES</span><p>{rules}</p></div>
      </section>
    </div>
    <footer className="footer-note"><span>Good games. Better company.</span><span>{isOnline ? <><Wifi size={13} aria-hidden="true" />{room ? connected ? 'Room connected' : 'Reconnecting' : 'Play from anywhere'}</> : <><Users size={13} aria-hidden="true" />{mode === 'cpu' ? 'Just you and a worthy opponent' : 'Two players. One device.'}</>}</span></footer>
  </main>;
}
