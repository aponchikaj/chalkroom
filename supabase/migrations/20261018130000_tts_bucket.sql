-- Server voice: the API makes each narration sentence once (Kokoro) and stores it here as
-- <sha256 key>.wav; every learner plays the same file from the public URL. Public read (the key
-- is a content hash of the sentence, nothing private), 5 MiB, WAV only. No client write
-- policies: only the API writes, with the service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts', 'tts', true, 5242880, array['audio/wav'])
on conflict (id) do nothing;
