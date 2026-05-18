-- Production backend layer for EMS Studio.
-- Idempotent because this was first applied directly through Supabase while hardening the live studio.

create table if not exists public."StudioAudioFile" (
  id text primary key default gen_random_uuid()::text,
  "projectId" text not null references public."StudioProject"(id) on delete cascade,
  "uploadedById" text references public."User"(id) on delete set null,
  "storageBucket" text not null default 'studio-audio',
  "storagePath" text not null,
  "publicUrl" text,
  "fileName" varchar(220) not null,
  "mimeType" varchar(120),
  "sizeBytes" bigint not null default 0,
  "durationSec" double precision not null default 0,
  checksum text,
  "peaksJson" jsonb,
  "createdAt" timestamp without time zone not null default current_timestamp
);

create table if not exists public."StudioClip" (
  id text primary key default gen_random_uuid()::text,
  "projectId" text not null references public."StudioProject"(id) on delete cascade,
  "trackId" text references public."StudioTrack"(id) on delete set null,
  name varchar(160) not null,
  "audioFileId" text,
  "startSec" double precision not null default 0,
  "durationSec" double precision not null default 0,
  "trimStartSec" double precision not null default 0,
  "trimEndSec" double precision not null default 0,
  "gainDb" double precision not null default 0,
  muted boolean not null default false,
  locked boolean not null default false,
  color varchar(16),
  "peaksJson" jsonb,
  metadata jsonb not null default '{}'::jsonb,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'StudioClip_audioFileId_fkey') then
    alter table public."StudioClip"
      add constraint "StudioClip_audioFileId_fkey"
      foreign key ("audioFileId") references public."StudioAudioFile"(id) on delete set null;
  end if;
end $$;

create table if not exists public."StudioProjectCollaborator" (
  id text primary key default gen_random_uuid()::text,
  "projectId" text not null references public."StudioProject"(id) on delete cascade,
  "userId" text references public."User"(id) on delete cascade,
  "inviteEmail" text,
  "inviteToken" text unique,
  role text not null default 'viewer' check (role in ('viewer','commenter','editor','engineer','owner')),
  status text not null default 'active' check (status in ('invited','active','revoked')),
  "createdById" text references public."User"(id) on delete set null,
  "acceptedAt" timestamp without time zone,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  constraint "StudioProjectCollaborator_user_or_email" check ("userId" is not null or "inviteEmail" is not null)
);

create table if not exists public."StudioProjectLock" (
  "projectId" text primary key references public."StudioProject"(id) on delete cascade,
  "lockedById" text references public."User"(id) on delete set null,
  "clientId" text not null,
  mode text not null default 'edit' check (mode in ('edit','record','mix','export')),
  "expiresAt" timestamp without time zone not null,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create table if not exists public."StudioExportJob" (
  id text primary key default gen_random_uuid()::text,
  "projectId" text not null references public."StudioProject"(id) on delete cascade,
  "requestedById" text references public."User"(id) on delete set null,
  preset text not null default 'wav_master' check (preset in ('mp3_demo','wav_master','stems','social_preview','session_archive')),
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','cancelled')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  "outputUrl" text,
  "errorMessage" text,
  metadata jsonb not null default '{}'::jsonb,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  "completedAt" timestamp without time zone
);

create index if not exists "StudioClip_project_track_start_idx" on public."StudioClip"("projectId", "trackId", "startSec");
create index if not exists "StudioAudioFile_project_idx" on public."StudioAudioFile"("projectId", "createdAt");
create unique index if not exists "StudioProjectCollaborator_project_user_idx" on public."StudioProjectCollaborator"("projectId", "userId") where "userId" is not null;
create index if not exists "StudioProjectCollaborator_project_role_idx" on public."StudioProjectCollaborator"("projectId", role, status);
create index if not exists "StudioExportJob_project_status_idx" on public."StudioExportJob"("projectId", status, "createdAt");

alter table public."StudioClip" enable row level security;
alter table public."StudioAudioFile" enable row level security;
alter table public."StudioProjectCollaborator" enable row level security;
alter table public."StudioProjectLock" enable row level security;
alter table public."StudioExportJob" enable row level security;
