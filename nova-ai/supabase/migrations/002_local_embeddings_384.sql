-- NOVA AI — migrate RAG embeddings to a free local model.
-- Keeps the original 1536-dimension table and RPC intact.
-- New Xenova/all-MiniLM-L6-v2 vectors use 384 dimensions.

create table if not exists public.knowledge_chunks_384 (
  id bigserial primary key,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer,
  embedding extensions.vector(384) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists knowledge_chunks_384_document_idx
  on public.knowledge_chunks_384(document_id, chunk_index);

create index if not exists knowledge_chunks_384_embedding_cosine_idx
  on public.knowledge_chunks_384 using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_chunks_384 enable row level security;

drop policy if exists "Authenticated users can read published 384d knowledge chunks"
  on public.knowledge_chunks_384;
create policy "Authenticated users can read published 384d knowledge chunks"
  on public.knowledge_chunks_384 for select to authenticated
  using (
    exists (
      select 1 from public.knowledge_documents d
      where d.id = knowledge_chunks_384.document_id and d.status = 'published'
    )
  );

grant select on public.knowledge_chunks_384 to authenticated;
grant all on public.knowledge_chunks_384 to service_role;
grant usage, select on sequence public.knowledge_chunks_384_id_seq to service_role;

create or replace function public.match_knowledge_chunks_384(
  query_embedding extensions.vector(384),
  match_count integer default 6,
  filter_engine_version text default '5.8'
)
returns table (
  chunk_id bigint,
  document_id uuid,
  title text,
  canonical_url text,
  source_type text,
  trust_level smallint,
  engine_version text,
  category text,
  topic text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    d.id,
    d.title,
    d.canonical_url,
    s.source_type,
    coalesce(s.trust_level, 3)::smallint,
    d.engine_version,
    d.category,
    d.topic,
    c.content,
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from public.knowledge_chunks_384 c
  join public.knowledge_documents d on d.id = c.document_id
  left join public.knowledge_sources s on s.id = d.source_id
  where d.status = 'published'
    and (filter_engine_version is null or d.engine_version is null or d.engine_version = filter_engine_version)
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 6), 12));
$$;

revoke all on function public.match_knowledge_chunks_384(extensions.vector, integer, text) from public, anon;
grant execute on function public.match_knowledge_chunks_384(extensions.vector, integer, text) to authenticated;

comment on table public.knowledge_chunks_384 is
  'Text chunks embedded locally with Xenova/all-MiniLM-L6-v2 (384 dimensions); no paid embedding API.';
comment on function public.match_knowledge_chunks_384(extensions.vector, integer, text) is
  'Authenticated cosine-similarity search over published 384-dimensional local embeddings.';
