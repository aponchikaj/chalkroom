# rag/ (B12)

Retrieval for the tutors: uploaded files, web pages, the course syllabus with past notes and
FAQ, and the live class transcript. How it works: `docs/SCHEMA.md`, "How RAG works".

| File | Role |
|---|---|
| `embeddings/embedding.port.ts` | `EmbeddingPort` (built) |
| `embeddings/no.embeddings.ts` | Null vectors: full-text search only (built, the default) |
| `embeddings/voyage.embeddings.ts` | Voyage AI adapter, 1024 dimensions |
| `extract/` | Text per page: `pdf.ts`, `docx.ts`, `pptx.ts`, `html.ts`, `text.ts` |
| `chunk.ts` | Pure: pages -> ~500-token chunks with 15% overlap, page numbers kept |
| `citations.ts` | Pure: keep only `res:<source>#p<page>` citations that exist |
| `ingest.worker.ts` | Takes pending `sources` (`for update skip locked`), extract, chunk, embed, store |
| `sources.service.ts` | Add a URL, upload URL for files, list, delete; index syllabus, notes, FAQ, transcripts |
| `sources.controller.ts` | `GET /rooms/:id/sources`, `POST /rooms/:id/sources/url`, `POST /rooms/:id/sources/upload-url`, `POST /rooms/:id/sources`, `DELETE /sources/:id` |
| `retrieve.service.ts` | Query (+ query embedding) -> `match_chunks()` -> passages for a prompt |

Schema: `supabase/migrations/20261017171347_rag.sql`. Plan: `docs/PLANS_DEVB.md` Tasks 18-20.
