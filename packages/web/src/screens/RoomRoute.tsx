// A6/A7 (Dev A), AU: /r/:code, the pre-join page (who you join as, join with voice or muted),
// then the classroom. The class uses your profile name and colour. The Join click is the
// gesture that lets the tutor's voice play. A browser
// that already joined this room goes straight back in after a refresh, and is offered one tap
// to turn the voice back on.
import { useEffect, useState } from 'react';
import { ArrowLeft, RotateCw, Volume2, VolumeX } from 'lucide-react';
import type { RoomPreview } from '@chalk/schema';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { joined } from '../lib/profile';
import { signOut, useAuth } from '../lib/auth';
import { mainPlayer } from '../room/store';
import { Punch } from '../ui/Punch';
import { Classroom } from './Classroom';
import { AccountMenu } from './auth/AccountMenu';
import { forgetJoined } from './auth/shared';
import { describe, joinMuted, unlockVoice, type Problem } from './entry';
import '../ui/ui.css';
import './entry.css';

const ICON = { size: 16, strokeWidth: 2 } as const;
const PHASE_WORDS = { lobby: 'Starting soon', teaching: 'In class now', check: 'In class now', qa: 'In class now', ended: 'Ended' } as const;

export function RoomRoute({ code }: { code: string }) {
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [loadProblem, setLoadProblem] = useState<Problem | null>(null);
  const me = useAuth((s) => s.me);
  const [entered, setEntered] = useState<{ roomId: string; profile: { name: string; color: string }; resumed: boolean } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState<'' | 'voice' | 'muted'>('');
  const [attempt, setAttempt] = useState(0);

  const join = async (muted: boolean, resumed = false) => {
    setBusy(muted ? 'muted' : 'voice'); setProblem(null);
    try {
      const { room, member } = await api.joinRoom({ inviteCode: code });
      joined.add(code);
      mainPlayer.setMuted(muted);
      setEntered({ roomId: room.id, profile: { name: member.display_name, color: member.color }, resumed });
    } catch (err) {
      setProblem(describe(err, 'join'));
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    let alive = true;
    setLoadProblem(null);
    api.preview(code).then((r) => { if (alive) setPreview(r); }).catch((e) => { if (alive) setLoadProblem(describe(e, 'open')); });
    if (attempt === 0 && joined.has(code)) void join(joinMuted.get(), true);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, attempt]);

  if (entered) {
    return (
      <>
        <Classroom roomId={entered.roomId} profile={entered.profile} />
        {entered.resumed && !joinMuted.get() && <VoicePrompt />}
      </>
    );
  }

  const onJoin = (muted: boolean) => {
    // this click is the user gesture browsers require before speech can play
    joinMuted.set(muted);
    if (!muted) unlockVoice();
    void join(muted);
  };
  const full = !!preview && preview.taken >= preview.seats;
  const ended = preview?.phase === 'ended';
  const blocked = full || ended;
  const canJoin = !!preview && !blocked && !busy;
  const name = me?.profile.display_name || me?.profile.username || 'you';

  return (
    <main className="entry">
      <article className="manual leaf punched">
        <header className="manual-head">
          <button type="button" className="btn ghost small manual-back" onClick={() => navigate('/')}><ArrowLeft {...ICON} aria-hidden /> Chalkroom Live</button>
          <span className="manual-meta prejoin-meta">Invite code <span className="mono">{code}</span></span>
          <AccountMenu />
        </header>

        {loadProblem ? (
          <div className="manual-body prejoin-problem">
            <section className="title-block">
              <h1 className="display">{loadProblem.kind === 'notfound' ? 'No class at this code' : 'Could not open this class'}</h1>
              <p className="errata" role="alert">{loadProblem.text}</p>
              <div className="problem-actions">
                <button className="btn primary btn-lg" onClick={() => navigate('/')}>Start a class</button>
                <button className="btn btn-lg" onClick={() => setAttempt((n) => n + 1)}><RotateCw {...ICON} aria-hidden /> Try again</button>
              </div>
              <p className="form-note">Codes are six letters or digits, like <span className="mono">KPXCNK</span>. You typed <span className="mono">{code}</span>.</p>
            </section>
          </div>
        ) : (
          <div className="manual-body prejoin-body">
            <section className="title-block" aria-live="polite">
              {preview ? (
                <>
                  <h1 className="display display-room">{preview.title}</h1>
                  <dl className="room-facts">
                    <div><dt>Host</dt><dd>{preview.hostName || 'Not here yet'}</dd></div>
                    <div><dt>Seats</dt><dd><span className="mono">{preview.taken}/{preview.seats}</span> taken
                      <span className="seat-row" aria-hidden>{Array.from({ length: preview.seats }, (_, i) => <i key={i} className={i < preview.taken ? 'taken' : ''} />)}</span></dd></div>
                    <div><dt>Status</dt><dd>{full && !ended ? 'Full' : PHASE_WORDS[preview.phase]}</dd></div>
                  </dl>
                  <p className="lede">
                    {ended ? 'This class has ended. Start a new one to keep learning.'
                      : full ? 'All seats are taken. Ask the host to open another room, or start your own.'
                      : preview.phase === 'lobby' ? 'The tutor starts when the host presses Start. Join now and wait in the lobby.'
                      : 'The class is already running. You join at the current segment, and the board catches up.'}
                  </p>
                </>
              ) : (
                <>
                  <h1 className="display display-room loading">Finding the class</h1>
                  <p className="lede">Looking up code <span className="mono">{code}</span>.</p>
                </>
              )}
            </section>

            {blocked ? (
              <div className="entry-form">
                <h2>{ended ? 'This class is over' : 'No seat free'}</h2>
                <p className="form-note">{ended ? 'Joining is closed. Start a class of your own on the same topic in a few seconds.' : 'Joining opens again if someone leaves. Or start a class of your own.'}</p>
                <div className="join-buttons">
                  <button type="button" className="btn primary btn-lg" onClick={() => navigate('/')}>Start a class</button>
                  {full && !ended && <button type="button" className="btn btn-lg" onClick={() => setAttempt((n) => n + 1)}><RotateCw {...ICON} aria-hidden /> Check again</button>}
                </div>
              </div>
            ) : (
              <form className="entry-form" onSubmit={(e) => { e.preventDefault(); if (canJoin) onJoin(false); }} aria-label="Join the class">
                <h2>Join the class</h2>
                <div className="joining-as">
                  {me && <Punch name={name} color={me.profile.color} />}
                  <p>
                    <span className="joining-label">Joining as</span>
                    <span className="joining-name">{name}</span>
                  </p>
                </div>
                <p className="form-note">The class sees this name and colour. Change them in <button type="button" className="text-link" onClick={() => navigate('/account')}>Account</button>. Not you? <button type="button" className="text-link" onClick={() => { forgetJoined(); void signOut(); }}>Log out</button></p>
                {problem && <p className="errata" role="alert">{problem.text}</p>}
                <div className="join-buttons">
                  <button className="btn primary btn-lg" disabled={!canJoin}>
                    <Volume2 {...ICON} aria-hidden /> {busy === 'voice' ? 'Joining' : 'Join with voice'}
                  </button>
                  <button type="button" className="btn btn-lg" disabled={!canJoin} onClick={() => onJoin(true)}>
                    <VolumeX {...ICON} aria-hidden /> {busy === 'muted' ? 'Joining' : 'Join muted'}
                  </button>
                </div>
                <p className="form-note">With voice, the tutor talks on this device. Muted, you read the captions. You can switch in class.</p>
              </form>
            )}
          </div>
        )}
      </article>
    </main>
  );
}

/** After a refresh there was no click yet, so speech is blocked until the next tap. */
function VoicePrompt() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open) return;
    const done = () => { unlockVoice(); setOpen(false); };
    window.addEventListener('pointerdown', done, { once: true });
    window.addEventListener('keydown', done, { once: true });
    return () => { window.removeEventListener('pointerdown', done); window.removeEventListener('keydown', done); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="voice-prompt leaf step-in" role="status">
      <Volume2 {...ICON} aria-hidden />
      <span>Tap anywhere to turn on the tutor's voice.</span>
      <button className="btn small primary" onClick={() => { unlockVoice(); mainPlayer.setMuted(false); setOpen(false); }}>Turn on voice</button>
    </div>
  );
}
