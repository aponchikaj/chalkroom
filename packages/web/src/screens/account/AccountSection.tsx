// AS: Account: the sign-in email, log out, and deleting the account (typed confirm). What
// deletion removes follows the API and the migrations (B10): it is said here as it is.
import { useState } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import type { MeRes } from '@chalk/schema';
import { api, ApiError } from '../../lib/api';
import { signOut } from '../../lib/auth';
import { navigate } from '../../lib/router';
import { Errata, ICON, say } from './parts';

export function AccountSection({ me }: { me: MeRes }) {
  const [out, setOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = word.trim().toLowerCase() === 'delete';

  const logOut = async () => {
    setOut(true);
    try { await signOut(); navigate('/'); } finally { setOut(false); }
  };

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError('');
    try {
      await api.deleteAccount();
      await signOut();
      navigate('/', true);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409
        ? 'A class you host has not ended yet. End it from the class page, then delete your account.'
        : say(err, 'Your account was not deleted. Try again.'));
      setBusy(false);
    }
  };

  return (
    <section className="acct-section" aria-labelledby="acct-account-title">
      <h2 id="acct-account-title">Account</h2>
      <p className="acct-lede">How you sign in, and leaving Chalkroom Live.</p>

      <div className="acct-block">
        <div className="field">
          <label className="field-label" htmlFor="acct-email">Email</label>
          <input id="acct-email" className="input acct-readonly" type="email" value={me.email ?? ''} readOnly autoComplete="email" aria-describedby="acct-email-note" />
          <span className="acct-note" id="acct-email-note">You sign in with this address, and sign-in codes go to it. It cannot be changed here.</span>
        </div>
      </div>

      <div className="acct-block">
        <h3 className="acct-subhead">Log out</h3>
        <p className="acct-note">Ends your session on this device. Your classes and notes stay in your account.</p>
        <div className="acct-actions">
          <button type="button" className="btn" onClick={logOut} disabled={out}><LogOut {...ICON} aria-hidden />{out ? 'Logging out' : 'Log out'}</button>
        </div>
      </div>

      <div className="acct-block acct-delete">
        <h3 className="acct-subhead">Delete account</h3>
        <div className="acct-delete-text">
          <p>Deleting removes your account for good. It cannot be undone.</p>
          <ul>
            <li>Gone: your profile and picture, preferences, sign-in steps, your questions and votes, your threads with the tutor, and your flashcard reviews.</li>
            <li>Classes you host are deleted for everyone in them, with their board, notes, questions and flashcards.</li>
            <li>In other people's classes your seat is removed; shared notes you edited stay with that class, without your name.</li>
            <li>While a class you host is still running, deleting is refused: end the class first.</li>
          </ul>
        </div>
        {!confirming ? (
          <div className="acct-actions">
            <button type="button" className="btn" onClick={() => { setConfirming(true); setWord(''); setError(''); }}>
              <Trash2 {...ICON} aria-hidden />Delete account
            </button>
          </div>
        ) : (
          <form className="acct-confirm" onSubmit={remove} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="acct-delete-word">Type delete to confirm</label>
              <input id="acct-delete-word" className="input acct-word" value={word} autoComplete="off" spellCheck={false} autoCapitalize="none" autoFocus
                onChange={(e) => setWord(e.target.value)} />
            </div>
            {error && <Errata onDismiss={() => setError('')}>{error}</Errata>}
            <div className="acct-actions">
              <button className="btn danger" disabled={!ready || busy}>{busy ? 'Deleting' : 'Delete my account'}</button>
              <button type="button" className="btn" onClick={() => { setConfirming(false); setError(''); }} disabled={busy}>Keep my account</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
