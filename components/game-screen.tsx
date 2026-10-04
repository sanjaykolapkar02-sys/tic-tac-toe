'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Check, Copy, Gamepad2, Globe, LockKeyhole, Monitor, RotateCcw, Trophy, Users, Wifi, X } from 'lucide-react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { Button } from './animate-ui/primitives/buttons/button';
import { CountingNumber } from './animate-ui/primitives/texts/counting-number';
import { Fade } from './animate-ui/primitives/effects/fade';
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
  const reducedMotion = useReducedMotion();

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

  return <MotionConfig reducedMotion="user"><main className="app-shell">
    <SmoothScroll />
    <header className="masthead">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><Gamepad2 size={23} /></span><h1>play<span>together</span><span className="brand-dot">.</span></h1></div>
      <span className="header-note"><Users size={15} aria-hidden="true" /> Your sibling arena</span>
    </header>

    <LayoutGroup id="game-switch">
      <nav className="game-picker" aria-label="Choose game">
        {(['rps', 'ttt'] as const).map(value => <Button key={value} hoverScale={1} tapScale={0.99} className={['game-tab', kind === value ? 'active' : ''].join(' ')} aria-pressed={kind === value} disabled={busy || (isOnline && Boolean((room && (!room.joined || !connected)) || (!room && invite)))} onClick={() => selectGame(value)}>
          {kind === value && <motion.span className="game-tab-highlight" aria-hidden="true" layoutId={reducedMotion ? undefined : 'active-game'} transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} />}
          <span className="game-tab-icon" aria-hidden="true">{value === 'rps' ? '✌️' : '× ○'}</span><span>{gameNames[value]}</span>
        </Button>)}
      </nav>
    </LayoutGroup>

    <section className={['game-card', kind, winner ? 'round-finished' : ''].join(' ')} aria-label={gameNames[kind] + ' game'}>
      <div className="arena-heading"><div><p className="section-label">LET’S PLAY</p><h2>{kind === 'rps' ? 'Rock, paper, scissors.' : 'Tic-tac-toe.'}</h2></div><span className="round-label"><span>Round</span>{String(game.round).padStart(2, '0')}</span></div>
      <div className="arena-toolbar">
        <LayoutGroup id="play-mode"><div className="mode-switch" role="group" aria-label="Choose game mode">
          {([['online', 'Online', Globe], ['cpu', 'Computer', Bot], ['friend', 'Same device', Monitor]] as const).map(([value, label, Icon]) => <Button hoverScale={1} key={value} className={['mode-button', mode === value ? 'active' : ''].join(' ')} disabled={busy} onClick={() => switchMode(value)} aria-pressed={mode === value}>
            {mode === value && <motion.span className="mode-highlight" aria-hidden="true" layoutId={reducedMotion ? undefined : 'active-mode'} transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} />}<Icon size={15} aria-hidden="true" /><span>{label}</span>
          </Button>)}
        </div></LayoutGroup>
        {isOnline ? (room || invite) && <Button className="text-button" disabled={busy} onClick={leave}>Exit room <X size={14} aria-hidden="true" /></Button> : <Button className="text-button" onClick={() => { setLocal(freshArena(kind)); setHandoff(false); }}>New match <RotateCcw size={14} aria-hidden="true" /></Button>}
      </div>

      {isOnline ? <div className="online-panel">
        {!room ? <>
          <div className="lobby-row"><div><h3>{invite ? 'You’ve got an invite.' : 'Play with your brother.'}</h3><p>{invite ? 'Join his room to get started.' : 'One room. One invite. Two players.'}</p></div><div className="lobby-actions"><Button className="primary-button" disabled={busy} onClick={() => void act(invite ? 'join' : 'create', invite ? { id: invite } : {})}>{busy ? 'Connecting…' : invite ? 'Join this room' : 'Create a room'}<ArrowRight size={16} aria-hidden="true" /></Button>{invite && <Button className="secondary-button" disabled={busy} onClick={() => void act('create')}>New room</Button>}</div></div>
          {!invite && <details className="join-details"><summary>Already have an invite?</summary><form className="join-form" onSubmit={event => { event.preventDefault(); join(); }}><label className="sr-only" htmlFor="invite-input">Invite link or room code</label><input id="invite-input" placeholder="Paste your invite link or room code" value={joinInput} onChange={event => setJoinInput(event.target.value)} autoComplete="off" required /><Button type="submit" className="secondary-button" disabled={busy}>Join <ArrowRight size={15} aria-hidden="true" /></Button></form></details>}
        </> : <>
          <div className="room-heading"><span className={['connection', connected ? 'connected' : ''].join(' ')}><span aria-hidden="true" />{connected ? room.joined ? 'Both players joined' : 'Waiting for your brother' : 'Reconnecting…'}</span><span className="seat">You’re Player {room.role === 'X' ? '1' : '2'}</span></div>
          <div className="invite-link"><input aria-label="Invite link" value={link} readOnly onFocus={event => event.target.select()} /><Button className="secondary-button" onClick={() => void copyLink()}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? 'Copied!' : 'Copy link'}</Button></div>
          {!connected && <p className="room-hint" role="status">Moves are paused while we reconnect. Your game is saved.</p>}
        </>}
      </div> : <p className="local-note">{mode === 'cpu' ? kind === 'rps' ? 'Choose a hand. The computer picks randomly.' : 'You play X. The computer plays O.' : kind === 'rps' ? 'Pick your hand, then pass the device. Both choices stay secret until the reveal.' : 'Take turns on the same board. Player 1 is X; Player 2 is O.'}</p>}

      <AnimatePresence initial={false}>
        {isOnline && room && pending && <Fade className="switch-prompt" key="game-request" role="status" initial={reducedMotion ? false : { opacity: 0 }}><p>{pending.ready.includes(room.role) ? 'Switch requested. Waiting for your brother.' : 'Your brother wants to play ' + gameNames[pending.kind] + '.'}<span>A switch starts a new match with fresh scores.</span></p><div>{!pending.ready.includes(room.role) && <Button className="primary-button" disabled={busy || !connected} onClick={() => void act('switch', { kind: pending.kind })}>Switch game</Button>}<Button className="secondary-button" disabled={busy || !connected} onClick={() => void act('switch', { kind })}>{pending.ready.includes(room.role) ? 'Cancel switch' : 'Keep this game'}</Button></div></Fade>}
        {error && <Fade className="error-message" key="game-error" role="alert">{error}</Fade>}
      </AnimatePresence>

      <div className="scoreboard" aria-label="Match score">
        {(['X', 'ties', 'O'] as const).map(key => <div key={key} className={'score-panel score-' + (key === 'ties' ? 'tie' : key.toLowerCase())}><span className="score-heading">{key === 'ties' ? 'Ties' : isOnline ? !room ? 'Player ' + (key === 'X' ? '1' : '2') : room.role === key ? 'You' : 'Brother' : mode === 'cpu' ? key === 'X' ? 'You' : 'Computer' : 'Player ' + (key === 'X' ? '1' : '2')}</span><strong aria-label={String(game.scores[key])}>{reducedMotion ? game.scores[key] : <CountingNumber number={game.scores[key]} initiallyStable aria-hidden="true" />}</strong><span className="score-caption">{key === 'ties' ? 'draws' : 'wins'}</span></div>)}
      </div>

      <div className="play-area">
        <div className={['turn-row', winner ? 'result-row' : ''].join(' ')}><span className="turn-indicator" aria-hidden="true">{winner ? winner === 'tie' ? '=' : <Trophy size={19} /> : symbol}</span><p className="status" role="status" aria-live="polite">{status}</p></div>
        <AnimatePresence initial={false} mode="wait">
          <Fade key={kind} className="game-surface" initial={reducedMotion ? false : { opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
            {game.kind === 'ttt' ? <div className="board" aria-label="Tic-tac-toe board">{game.board.map((mark, index) => <Button hoverScale={1.035} key={index} className={['cell', mark?.toLowerCase() || '', tttResult?.line.includes(index) ? 'winning' : ''].join(' ')} disabled={!playable || Boolean(mark)} aria-label={positions[index] + ', ' + (mark || 'empty')} onClick={() => isOnline ? void act('move', { index }) : setLocal(previous => previous.kind === 'ttt' ? { ...move(previous, previous.turn, index), kind: 'ttt' } : previous)}>{mark && <motion.span initial={reducedMotion ? false : { scale: 0.65, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.2 }} aria-hidden="true">{mark === 'X' ? '×' : '○'}</motion.span>}</Button>)}</div> : <>
              <div className="hands-reveal" aria-label="Round choices">{(['X', 'O'] as const).map(seat => {
                const visible = Boolean(winner || (isOnline && room?.role === seat));
                const choice = visible ? game.picks[seat] : null;
                const name = isOnline ? !room ? 'Player ' + (seat === 'X' ? '1' : '2') : room.role === seat ? 'You' : 'Brother' : mode === 'cpu' ? seat === 'X' ? 'You' : 'Computer' : 'Player ' + (seat === 'X' ? '1' : '2');
                return <motion.div key={seat} className={['hand-panel', 'player-' + seat.toLowerCase(), winner === seat ? 'hand-winner' : ''].join(' ')} animate={{ borderColor: winner === seat ? '#8b83ff' : '#2b2d40' }} transition={{ duration: reducedMotion ? 0 : 0.25 }}><div className="hand-heading"><span className="player-avatar" aria-hidden="true">{seat === 'X' ? 'P1' : 'P2'}</span><span>{name}</span>{winner === seat && <span className="winner-tag"><Trophy size={12} aria-hidden="true" /> Winner</span>}</div><div className="hand-orbit"><AnimatePresence initial={false} mode="wait"><motion.strong key={choice || (game.submitted[seat] ? 'locked' : 'waiting')} className="hand-visual" initial={reducedMotion ? false : { opacity: 0, scale: 0.75, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.9 }} transition={{ duration: reducedMotion ? 0 : 0.24 }} aria-hidden="true">{choice ? hands[choice] : game.submitted[seat] ? <LockKeyhole size={40} strokeWidth={1.4} /> : <span className="waiting-hand">?</span>}</motion.strong></AnimatePresence></div><p>{choice ? labels[choice] : game.submitted[seat] ? 'Locked in' : !isOnline || room?.joined ? 'Choosing…' : 'Ready when you are'}</p></motion.div>;
              })}<span className="versus" aria-hidden="true">VS</span></div>
              {handoff && !isOnline && !winner ? <Fade className="handoff"><LockKeyhole size={22} aria-hidden="true" /><p>Player 1’s hand is locked.<span>Pass the device to Player 2.</span></p><Button className="primary-button" onClick={() => setHandoff(false)}>Player 2 is ready <ArrowRight size={16} aria-hidden="true" /></Button></Fade> : <><div className="choice-heading"><span>{winner ? 'Round complete' : 'Choose your hand'}</span><span><LockKeyhole size={13} aria-hidden="true" />{winner ? 'Both hands revealed' : 'Locked until both pick'}</span></div><div className="choice-grid" aria-label="Choose your hand">{choices.map(choice => <Button key={choice} hoverScale={1.035} tapScale={0.95} className={['choice-button', isOnline && game.picks[role] === choice ? 'chosen' : ''].join(' ')} disabled={!canPick} onClick={() => pick(choice)}><span className="choice-emoji" aria-hidden="true">{hands[choice]}</span><span className="choice-label">{labels[choice]}</span>{isOnline && game.picks[role] === choice && <Check className="choice-check" size={15} aria-hidden="true" />}</Button>)}</div></>}
            </>}
          </Fade>
        </AnimatePresence>
        {isOnline ? <Button className="next-button" disabled={!winner || busy || ready || !connected} onClick={() => void act('ready')}><RotateCcw size={17} aria-hidden="true" />{ready ? 'Waiting for your brother…' : winner && game.ready.length ? 'Play again — brother is ready' : 'Play again'}</Button> : <Button className="next-button" disabled={kind === 'rps' && !winner} onClick={advance}><RotateCcw size={17} aria-hidden="true" />Next round</Button>}
      </div>
      <p className="rules-strip">{rules}</p>
    </section>
    <footer className="footer-note"><span>Two games. One good rivalry.</span><span>{isOnline ? <><Wifi size={13} aria-hidden="true" />{room ? connected ? 'Room connected' : 'Reconnecting' : 'Invite links last 7 days'}</> : <><Users size={13} aria-hidden="true" />{mode === 'cpu' ? 'Computer mode' : 'Same-device mode'}</>}</span></footer>
  </main></MotionConfig>;
}
