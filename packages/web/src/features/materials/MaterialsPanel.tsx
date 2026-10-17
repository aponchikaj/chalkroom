// AM: the class's materials, shared by the class page and the classroom rail: what the tutors
// may read (files, links, the course's syllabus and notes), adding a file or a link, and
// deleting. Status moves pending -> processing -> ready | failed on the server; we poll while
// anything is still being read.
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ExternalLink, FileUp, Link2, RotateCw, Trash2, TriangleAlert, X } from 'lucide-react';
import type { MemberRow, RoomRow, SourceRow } from '@chalk/schema';
import { api, ApiError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Stamp } from '../../ui/Stamp';
import { ACCEPT, checkFile, dateWords, isBusy, kindWords, safeUrl, statusWords, titleOf } from './model';
import { rememberSources, useMaterials } from './store';
import './materials.css';

const POLL_MS = 3000;
const ICON = { size: 14, strokeWidth: 2 } as const;

type Scope = 'room' | 'course';
interface Upload { key: string; name: string; phase: 'uploading' | 'saving' }

export interface MaterialsPanelProps {
  roomId: string;
  room: Pick<RoomRow, 'host_id' | 'course_id'> | null;
  me: string | null;
  members: MemberRow[];
  /** rows already loaded by the page; fetched when absent */
  initial?: SourceRow[];
  /** the classroom rail: narrower, smaller heads */
  compact?: boolean;
}

const say = (e: unknown, what: string) => {
  if (e instanceof ApiError && e.status === 403) return `${what}: you are not allowed to. ${e.message.charAt(0).toUpperCase()}${e.message.slice(1)}.`;
  const m = e instanceof Error && e.message ? e.message : 'something went wrong';
  return `${what}: ${m.replace(/\.$/, '')}.`;
};

const merge = (list: SourceRow[], row: SourceRow) => (list.some((s) => s.id === row.id) ? list.map((s) => (s.id === row.id ? row : s)) : [...list, row]);

export function MaterialsPanel({ roomId, room, me, members, initial, compact = false }: MaterialsPanelProps) {
  const [sources, setSources] = useState<SourceRow[] | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ key: number; text: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [scope, setScope] = useState<Scope>('room');
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const amHost = !!room && !!me && room.host_id === me;
  const canCourse = amHost && !!room?.course_id;
  const sendScope: Scope = canCourse ? scope : 'room';

  const fail = useCallback((text: string) => setErrors((es) => [...es.slice(-2), { key: Date.now() + Math.random(), text }]), []);

  const refresh = useCallback(async () => {
    try {
      const rows = await api.sources(roomId);
      if (!live.current) return;
      setSources(rows);
      setLoadError(null);
      rememberSources(rows);
    } catch (e) {
      if (live.current) setLoadError(say(e, 'Could not load the materials'));
    }
  }, [roomId]);

  useEffect(() => {
    if (initial) rememberSources(initial); else void refresh();
    // initial rows are a snapshot; the panel owns the list from here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const busy = !!sources?.some(isBusy);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [busy, refresh]);

  const added = useCallback((row: SourceRow, wasThere: boolean) => {
    if (!live.current) return;
    rememberSources([row]);
    setSources((l) => merge(l ?? [], row));
    if (wasThere) setNotice(`${row.title} is already in the materials.`);
  }, []);

  const uploadOne = useCallback(async (file: File) => {
    const ok = checkFile(file);
    if ('error' in ok) { fail(ok.error); return; }
    const key = `${file.name}-${Date.now()}-${Math.random()}`;
    const phase = (p: Upload['phase'] | null) => live.current && setUploads((u) => (p ? (u.some((x) => x.key === key) ? u.map((x) => (x.key === key ? { ...x, phase: p } : x)) : [...u, { key, name: file.name, phase: p }]) : u.filter((x) => x.key !== key)));
    phase('uploading');
    try {
      const up = await api.sourceUploadUrl(roomId, { fileName: file.name.slice(-200), contentType: ok.type, size: file.size });
      const put = await supabase.storage.from('resources').uploadToSignedUrl(up.path, up.token, file, { contentType: ok.type });
      if (put.error) throw new Error(put.error.message);
      phase('saving');
      const before = new Set((sources ?? []).map((s) => s.id));
      const row = await api.addSourceFile(roomId, { path: up.path, title: titleOf(file.name), scope: sendScope });
      added(row, before.has(row.id));
    } catch (e) {
      fail(say(e, `Could not add ${file.name}`));
    } finally {
      phase(null);
    }
  }, [roomId, sendScope, sources, added, fail]);

  const addFiles = (files: FileList | File[] | null) => {
    setNotice(null);
    for (const f of Array.from(files ?? [])) void uploadOne(f);
  };

  const remove = async (s: SourceRow) => {
    try {
      await api.deleteSource(s.id);
      if (live.current) setSources((l) => (l ?? []).filter((x) => x.id !== s.id));
    } catch (e) {
      fail(say(e, `Could not delete ${s.title}`));
      throw e;
    }
  };

  const names = new Map(members.map((m) => [m.user_id, m.user_id === me ? 'you' : m.display_name]));
  const list = sources ?? [];

  return (
    <div className={`mat${compact ? ' mat-compact' : ''}`}>
      <p className="mat-lede">The tutors read these and cite them on the board and in answers.</p>

      <AddArea onFiles={addFiles} roomId={roomId} sendScope={sendScope} onAdded={added} onError={fail} onStart={() => setNotice(null)}
        known={new Set(list.map((s) => s.id))} scope={canCourse ? { value: scope, set: setScope } : null} />

      {errors.length > 0 && (
        <div className="mat-errors">
          {errors.map((er) => (
            <p key={er.key} className="errata" role="alert">
              <TriangleAlert {...ICON} aria-hidden className="mat-errata-icon" />
              <span className="grow">{er.text}</span>
              <button type="button" className="btn ghost small icon-btn mat-dismiss" aria-label="Dismiss" onClick={() => setErrors((es) => es.filter((x) => x.key !== er.key))}>
                <X {...ICON} aria-hidden />
              </button>
            </p>
          ))}
        </div>
      )}
      {notice && <p className="mat-notice" role="status">{notice}</p>}

      {loadError && (
        <p className="errata" role="alert">
          <TriangleAlert {...ICON} aria-hidden className="mat-errata-icon" /><span className="grow">{loadError}</span>
          <button type="button" className="btn small" onClick={() => void refresh()}><RotateCw {...ICON} aria-hidden />Try again</button>
        </p>
      )}

      {sources === null && !loadError ? (
        <p className="mat-empty" role="status">Opening the materials</p>
      ) : list.length === 0 && uploads.length === 0 ? (
        !loadError && <p className="mat-empty">Nothing here yet. Add a document or a link and the tutors will read it before they answer.</p>
      ) : (
        <ol className="mat-list" aria-label="Materials">
          {uploads.map((u) => (
            <li key={u.key} className="mat-item mat-item-upload">
              <div className="grow">
                <p className="mat-title">{u.name}</p>
                <p className="mat-meta"><Stamp tone="pending">{u.phase === 'uploading' ? 'Uploading' : 'Saving'}</Stamp></p>
              </div>
            </li>
          ))}
          {list.map((s) => (
            <SourceItem key={s.id} s={s} by={s.created_by ? (names.has(s.created_by) ? `Added by ${names.get(s.created_by)}` : undefined) : s.kind === 'file' || s.kind === 'url' ? undefined : 'Added automatically'}
              canDelete={amHost || (!!me && s.created_by === me)} onDelete={remove} />
          ))}
        </ol>
      )}
    </div>
  );
}

function AddArea({ onFiles, roomId, sendScope, onAdded, onError, onStart, known, scope }: {
  onFiles: (f: FileList | File[] | null) => void;
  roomId: string; sendScope: Scope;
  onAdded: (row: SourceRow, wasThere: boolean) => void; onError: (t: string) => void; onStart: () => void;
  known: Set<string>;
  scope: { value: Scope; set: (s: Scope) => void } | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [urlBad, setUrlBad] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const pick = () => input.current?.click();
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    onStart();
    let u = url.trim();
    if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = `https://${u}`;
    try { const p = new URL(u); if (!/^https?:$/.test(p.protocol)) throw new Error(); } catch { setUrlBad('Enter a web address that starts with http:// or https://.'); return; }
    setUrlBad(null);
    setSending(true);
    try {
      const row = await onAddUrl(roomId, u, title.trim(), sendScope);
      onAdded(row, known.has(row.id));
      setUrl(''); setTitle('');
    } catch (err) {
      onError(say(err, 'Could not add the link'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mat-add">
      {scope && (
        <fieldset className="mat-scope">
          <legend className="mat-label">Add to</legend>
          <div className="mat-scope-opts">
            {(['room', 'course'] as const).map((v) => (
              <label key={v} className="mat-scope-opt">
                <input type="radio" name={`mat-scope-${roomId}`} value={v} checked={scope.value === v} onChange={() => scope.set(v)} />
                <span>{v === 'room' ? 'This class' : 'The whole course'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className={`mat-drop${over ? ' is-over' : ''}`} role="button" tabIndex={0} aria-describedby={`mat-drop-hint-${roomId}`}
        onClick={pick} onKeyDown={onKey}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={onDrop}>
        <FileUp size={18} strokeWidth={2} aria-hidden />
        <span className="mat-drop-text">
          <span className="mat-drop-head">{over ? 'Drop to add' : 'Add a document'}</span>
          <span className="mat-drop-hint" id={`mat-drop-hint-${roomId}`}>Drop a file here or choose one. PDF, PowerPoint, Word, text or Markdown, up to <span className="mat-nowrap"><span className="mono">50</span> MB</span>.</span>
        </span>
      </div>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden tabIndex={-1}
        onChange={(e) => { onFiles(e.currentTarget.files); e.currentTarget.value = ''; }} />

      <form className="mat-link" onSubmit={submit} noValidate>
        <label className="mat-field">
          <span className="mat-label">Add a link</span>
          <input className="input" type="url" inputMode="url" placeholder="https://example.com/article" value={url} maxLength={2000}
            aria-invalid={urlBad ? true : undefined} aria-describedby={urlBad ? `mat-url-err-${roomId}` : undefined}
            onChange={(e) => { setUrl(e.target.value); setUrlBad(null); }} />
        </label>
        {urlBad && <p className="error-text" id={`mat-url-err-${roomId}`}>{urlBad}</p>}
        <div className="mat-link-row">
          <label className="mat-field grow">
            <span className="mat-label">Title, if you want one</span>
            <input className="input" type="text" placeholder="The page's own title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button type="submit" className="btn primary" disabled={!url.trim() || sending}>
            <Link2 {...ICON} aria-hidden />{sending ? 'Adding' : 'Add link'}
          </button>
        </div>
      </form>
    </div>
  );
}

const onAddUrl = (roomId: string, url: string, title: string, scope: Scope) =>
  api.addSourceUrl(roomId, { url, ...(title ? { title } : {}), scope });

function SourceItem({ s, by, canDelete, onDelete }: { s: SourceRow; by: string | undefined; canDelete: boolean; onDelete: (s: SourceRow) => Promise<void> }) {
  const focus = useMaterials((m) => (m.focus?.id === s.id ? m.focus : null));
  const ref = useRef<HTMLLIElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const st = statusWords(s);
  const href = s.kind === 'url' ? safeUrl(s.uri) : null;
  const fromCourse = !s.room_id && !!s.course_id;

  useEffect(() => {
    if (!focus) return;
    ref.current?.scrollIntoView?.({ block: 'nearest' });
    ref.current?.focus({ preventScroll: true });
  }, [focus]);

  const del = async () => {
    setDeleting(true);
    try { await onDelete(s); } catch { if (ref.current) { setDeleting(false); setConfirm(false); } }
  };

  return (
    <li ref={ref} tabIndex={-1} className={`mat-item${focus ? ' is-focus' : ''}`} aria-busy={isBusy(s) || undefined}>
      <div className="grow">
        <p className="mat-title">{s.title}</p>
        <p className="mat-meta">
          <Stamp tone={st.tone}>{st.word}</Stamp>
          <span>{kindWords(s)}{fromCourse ? ', for the whole course' : ''}</span>
          {s.page_count != null && s.page_count > 0 && <span><span className="mono">{s.page_count}</span> {s.page_count === 1 ? 'page' : 'pages'}</span>}
          {s.status === 'ready' && <span><span className="mono">{s.chunk_count}</span> {s.chunk_count === 1 ? 'section' : 'sections'}</span>}
          <span>{by ? `${by}, ` : ''}{dateWords(s.created_at)}</span>
        </p>
        {focus?.page && <p className="mat-cited">Cited on page <span className="mono">{focus.page}</span></p>}
        {s.status === 'failed' && <p className="error-text mat-failed">{s.error || 'The reader stopped without saying why.'}</p>}
      </div>
      <div className="mat-actions">
        {confirm ? (
          <>
            <span className="mat-confirm">Delete for everyone?</span>
            <button type="button" className="btn small danger" disabled={deleting} onClick={() => void del()}>{deleting ? 'Deleting' : 'Delete'}</button>
            <button type="button" className="btn small ghost" disabled={deleting} onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <>
            {href && (
              <a className="btn small" href={href} target="_blank" rel="noopener noreferrer">
                Open<ExternalLink {...ICON} aria-hidden /><span className="sr-only">{s.title} (opens in a new tab)</span>
              </a>
            )}
            {canDelete && (
              <button type="button" className="btn small ghost" onClick={() => setConfirm(true)}>
                <Trash2 {...ICON} aria-hidden />Delete<span className="sr-only"> {s.title}</span>
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
