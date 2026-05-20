-- Formalize the Studio project persistence tables in Prisma and add a
-- durable waveform peak cache for decoded imports.

alter table public."StudioTrack"
  add column if not exists kind varchar(40) not null default 'audio',
  add column if not exists "gainDb" double precision not null default 0,
  add column if not exists pan double precision not null default 0,
  add column if not exists muted boolean not null default false,
  add column if not exists solo boolean not null default false,
  add column if not exists armed boolean not null default false;

create table if not exists public."StudioWaveformPeak" (
  id text primary key default gen_random_uuid()::text,
  "audioFileId" text not null references public."StudioAudioFile"(id) on delete cascade,
  resolution varchar(32) not null default 'overview',
  channel integer not null default 0,
  "samplesPerPeak" integer not null default 0,
  "durationSec" double precision not null default 0,
  "sampleRate" integer,
  peaks jsonb not null,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create unique index if not exists "StudioWaveformPeak_audio_resolution_channel_idx"
  on public."StudioWaveformPeak"("audioFileId", resolution, channel);

create index if not exists "StudioWaveformPeak_audio_idx"
  on public."StudioWaveformPeak"("audioFileId");

create index if not exists "StudioAudioFile_checksum_idx"
  on public."StudioAudioFile"(checksum);

alter table public."StudioWaveformPeak" enable row level security;
