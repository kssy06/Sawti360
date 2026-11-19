-- =====================================================================
-- SAWTI 360 · Schéma du back-end du prototype (Supabase, Postgres 15+)
--
-- À coller tel quel dans Supabase → SQL Editor → Run (une seule fois).
--
-- Principe : le navigateur ne lit ni n'écrit JAMAIS ces tables directement.
-- Tout passe par l'API (/api/*), connectée en rôle « postgres » via DATABASE_URL.
-- RLS activé sans aucune policy + REVOKE : anon et authenticated n'ont aucun
-- accès par PostgREST (défense en profondeur). Le navigateur n'utilise
-- supabase-js que pour l'authentification et les envois de fichiers par URL signée.
--
-- Les noms de champs suivent les types du front (web/src/state/*.ts) pour que
-- l'API renvoie des objets directement utilisables par le store zustand.
-- =====================================================================

-- ------------------------------------------------------------------ comptes
create table public.accounts (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  email       text not null,
  org         text not null default '',
  initials    text not null default '',
  plan        text not null default 'createur' check (plan in ('gratuit', 'createur', 'studio')),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------ projets
-- Un projet = le document Project du front. Les champs qui changent ensemble
-- (segments, personnages…) restent en JSONB : c'est le chemin le plus rapide
-- vers un prototype qui marche. Les données partagées entre comptes ou
-- consultées sans connexion (consentements, dossiers, licences) ont leurs tables.
create table public.projects (
  id              text primary key,                -- v_xxxxxxxx, ou id d'exemple
  account_id      uuid not null references public.accounts (id) on delete cascade,
  title           text not null,
  subtitle        text not null default '',
  kind            text not null check (kind in ('demo', 'video')),
  format          text not null check (format in ('film', 'podcast', 'reel')),
  use_case        text not null default 'doublage_film',  -- Project.use côté front
  example         boolean not null default false,
  video           jsonb,          -- VideoMeta + chemins de stockage (voir API.md)
  pipeline        jsonb,
  segments        jsonb not null default '[]'::jsonb,
  speakers        jsonb not null default '{}'::jsonb,
  characters      jsonb not null default '{}'::jsonb,  -- sans living/dossier : composés à la lecture
  speaker_voices  jsonb not null default '{}'::jsonb,
  proposals       jsonb not null default '{}'::jsonb,
  reviews         jsonb not null default '{}'::jsonb,
  gens            jsonb not null default '{}'::jsonb,
  generation      jsonb not null default '{"status":"idle","stage":0,"synthDone":0,"synthTotal":0}'::jsonb,
  audio_hash      text,           -- SHA-256 de l'audio analysé : évite de relancer l'IA sur le même fichier
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index projects_account_idx on public.projects (account_id, updated_at desc);

-- ------------------------------------------------- autorisation : personne vivante
create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  project_id     text not null references public.projects (id) on delete cascade,
  character_key  text not null,
  email          text not null,
  registered     boolean not null default false,
  status         text not null default 'en_attente'
                 check (status in ('a_obtenir', 'en_attente', 'autorisee', 'refusee')),
  token_hash     text not null unique,   -- SHA-256 du jeton du lien ; le jeton brut n'est jamais stocké
  voice_id       text,                   -- Passeport de voix créé depuis la page publique, le cas échéant
  sent_at        timestamptz not null default now(),
  decided_at     timestamptz,
  superseded     boolean not null default false  -- vrai quand un nouveau lien a remplacé celui-ci
);
create index consents_project_idx on public.consents (project_id, character_key, sent_at desc);

-- ------------------------------------------------- autorisation : personne décédée
create table public.dossiers (
  id              uuid primary key default gen_random_uuid(),
  project_id      text not null references public.projects (id) on delete cascade,
  character_key   text not null,
  status          text not null default 'recu'
                  check (status in ('manquant', 'recu', 'analyse', 'correspondance', 'incoherence', 'verification', 'valide')),
  deceased_name   text not null,
  declared_role   text not null,
  reference       text not null,          -- DF-2026-xxxxx : seule donnée reprise au Passeport 360°
  file_path       text not null,          -- bucket privé « dossiers » : jamais public, jamais dans le passeport
  file_name       text not null,
  file_size       bigint not null,
  file_type       text not null,
  file_hash       text not null,
  received_at     timestamptz not null default now(),
  ai_check        jsonb,                  -- FamilyCheck renvoyé par le contrôle IA
  validated_at    timestamptz,
  validated_by    text,
  complementary_requested_at timestamptz,
  superseded      boolean not null default false
);
create index dossiers_project_idx on public.dossiers (project_id, character_key, received_at desc);

-- ------------------------------------------------- Passeports de voix (titulaires)
create table public.voice_profiles (
  voice_id        text primary key,       -- v_lina, v_user_<8 car.>
  account_id      uuid references public.accounts (id) on delete set null,  -- null : profil fictif d'exemple
  profile         jsonb not null,         -- VoiceProfile (nom public, langues, tarif, conditions…)
  published       boolean not null default true,
  sample          jsonb,                  -- {path,duration,peak,rms,recordedAt,transcript,wer,match}
  eleven_voice_id text,                   -- voix ElevenLabs de rendu (prédéfinie, ou clonée avec consentement)
  cloned          boolean not null default false,
  created_at      timestamptz not null default now()
);
create unique index voice_profiles_one_per_account on public.voice_profiles (account_id) where account_id is not null;

-- Règles signées du titulaire (VoiceLicense du moteur de règles, signée Ed25519 par le serveur).
create table public.voice_licenses (
  license_id  text primary key,
  voice_id    text not null,
  data        jsonb not null,
  status      text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  revoked_at  timestamptz,
  updated_at  timestamptz not null default now()
);
create index voice_licenses_voice_idx on public.voice_licenses (voice_id);

-- ------------------------------------------------- licences de projet (spéc. §5 : 72 h)
create table public.license_requests (
  id                 text primary key,     -- r_xxxxxxxx
  token_hash         text not null unique,
  project_id         text not null,        -- pas de FK : les exemples visent des projets d'autres studios
  project_title      text not null,
  character_key      text not null,
  character_name     text not null,
  voice_id           text not null,
  creator_account_id uuid references public.accounts (id) on delete set null,
  creator_name       text not null,
  owner_account_id   uuid references public.accounts (id) on delete set null,
  message            text not null default '',
  price              numeric(10, 2) not null default 0,
  sent_at            timestamptz not null default now(),
  expires_at         timestamptz not null,
  status             text not null default 'envoyee' check (status in ('envoyee', 'acceptee', 'refusee', 'expiree')),
  decided_at         timestamptz,
  payment            text not null default 'non_requis' check (payment in ('non_requis', 'en_attente', 'confirme', 'echoue')),
  payment_at         timestamptz,
  reference          text
);
create index license_requests_creator_idx on public.license_requests (creator_account_id, sent_at desc);
create index license_requests_owner_idx on public.license_requests (owner_account_id, sent_at desc);

-- ------------------------------------------------- paiements (prototype : gratuits et instantanés)
-- Le parcours de paiement est conservé ; « payer » confirme tout de suite et crédite
-- les jetons. Aucun argent réel ne circule : method = 'prototype_gratuit'.
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  kind        text not null check (kind in ('licence', 'jetons')),
  request_id  text references public.license_requests (id) on delete set null,
  plan        text,
  amount_dt   numeric(10, 2) not null default 0,  -- prix affiché ; 0 DT réellement débité
  tokens      integer not null default 0,         -- jetons crédités
  status      text not null default 'confirme' check (status in ('en_attente', 'confirme', 'echoue')),
  method      text not null default 'prototype_gratuit',
  created_at  timestamptz not null default now()
);
create index payments_account_idx on public.payments (account_id, created_at desc);

-- ------------------------------------------------- jetons (1 jeton = 1 caractère synthétisé)
create table public.token_ledger (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  delta       integer not null,          -- + crédit, − débit
  reason      text not null check (reason in ('allocation_plan', 'achat_prototype', 'synthese', 'part_titulaire', 'remboursement')),
  ref         text,
  created_at  timestamptz not null default now()
);
create index token_ledger_account_idx on public.token_ledger (account_id);

create view public.token_balances as
  select account_id, coalesce(sum(delta), 0)::bigint as balance
  from public.token_ledger
  group by account_id;

-- Lignes d'usage (UsageRow du front) : alimentent Paiements, Revenus et le panneau énergie.
create table public.usage_rows (
  id                 text primary key,
  at                 timestamptz not null default now(),
  project_id         text,
  project_label      text not null,
  creator_account_id uuid references public.accounts (id) on delete set null,
  creator_name       text not null,
  voice_id           text not null,
  chars              integer not null,
  cost               integer not null,
  owner              integer not null,
  platform           integer not null,
  ms                 integer,
  bytes              integer
);
create index usage_rows_voice_idx on public.usage_rows (voice_id, at desc);
create index usage_rows_creator_idx on public.usage_rows (creator_account_id, at desc);

-- ------------------------------------------------- notifications
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  space       text not null check (space in ('creator', 'owner')),
  at          timestamptz not null default now(),
  tone        text not null check (tone in ('ok', 'red', 'warn', 'plain')),
  title       text not null,
  body        text not null,
  link        text,
  read        boolean not null default false
);
create index notifications_account_idx on public.notifications (account_id, at desc);

-- ------------------------------------------------- journal d'audit (chaîne SHA-256)
-- Les 8 premiers champs sont exactement AuditEntry (web/src/core/audit.ts) :
-- entry_hash = sha256(canonicalJson(entrée sans entry_hash)). Les hachages sont
-- calculés en TypeScript par l'API (même code que le navigateur) puis insérés
-- sous verrou (pg_advisory_xact_lock) pour garder une chaîne unique et continue.
create table public.audit_entries (
  idx           integer primary key,     -- AuditEntry.index (0, 1, 2…)
  ts            text not null,           -- AuditEntry.timestamp, chaîne exacte hachée (nowIso)
  actor         text not null,
  action        text not null,
  payload_hash  text not null,
  decision      text not null default '',
  prev_hash     text not null,
  entry_hash    text not null unique,
  project_id    text,                    -- métadonnées hors hachage, pour filtrer par projet
  account_id    uuid,
  created_at    timestamptz not null default now()
);
create index audit_entries_project_idx on public.audit_entries (project_id);

-- ------------------------------------------------- Passeports 360° (publics par URL courte)
create table public.passports (
  id          text primary key,           -- S360-XXXX-XXXX
  project_id  text not null references public.projects (id) on delete cascade,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  data        jsonb not null,             -- Passport360 signé ; jamais le document familial
  created_at  timestamptz not null default now()
);
create index passports_project_idx on public.passports (project_id, created_at desc);

-- ------------------------------------------------- tâches longues
-- Analyse, relecture LLM 2, contrôle du dossier familial, contrôle de l'échantillon
-- de voix, génération. Le navigateur interroge GET /api/jobs/:id toutes les 1,5 s.
create table public.jobs (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references public.accounts (id) on delete cascade,
  project_id  text,
  kind        text not null check (kind in ('analysis', 'review', 'dossier_check', 'voice_check', 'generation')),
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  step        integer not null default 0,
  detail      text,
  result      jsonb,
  error       text,
  providers   jsonb,                      -- modèles réellement utilisés (affichés « Réel » dans l'interface)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index jobs_project_idx on public.jobs (project_id, created_at desc);

-- ------------------------------------------------- déclencheurs
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();
create trigger voice_licenses_touch before update on public.voice_licenses
  for each row execute function public.touch_updated_at();

-- Inscription : crée le compte et alloue les jetons du plan Créateur (tout est gratuit
-- dans le prototype). Le nom vient des métadonnées passées à supabase.auth.signUp().
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1));
begin
  insert into public.accounts (id, name, email, org, initials)
  values (
    new.id,
    v_name,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'org', ''),
    upper(left(v_name, 1) || coalesce(left(split_part(v_name, ' ', 2), 1), ''))
  );
  insert into public.token_ledger (account_id, delta, reason, ref)
  values (new.id, 100000, 'allocation_plan', 'createur');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------- aucun accès direct depuis le navigateur
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'projects', 'consents', 'dossiers', 'voice_profiles', 'voice_licenses',
    'license_requests', 'payments', 'token_ledger', 'usage_rows', 'notifications',
    'audit_entries', 'passports', 'jobs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on public.token_balances from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;

-- ------------------------------------------------- stockage : buckets privés
-- 50 Mo par fichier : la limite globale du plan gratuit Supabase (à vérifier dans
-- Storage → Settings). Pas de policy : on n'écrit et ne lit qu'avec des URL signées
-- délivrées par l'API (createSignedUploadUrl / createSignedUrl).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', false, 52428800, array[
    'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4',
    'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'
  ]),
  ('dossiers', 'dossiers', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('samples', 'samples', false, 20971520, array['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4'])
on conflict (id) do nothing;
