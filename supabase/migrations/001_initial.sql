-- Epic Music Space — Initial Database Schema
-- Run this in the Supabase SQL editor

-- ================================================================
-- EXTENSIONS
-- ================================================================
create extension if not exists "uuid-ossp";

-- ================================================================
-- PROFILES
-- Extended user profiles (linked to auth.users)
-- ================================================================
create table public.profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  username     text unique not null,
  display_name text,
  avatar_url   text,
  bio          text,
  website      text,
  is_artist    boolean default false,
  stripe_account_id text,           -- Stripe Connect account ID
  stripe_onboarded  boolean default false,
  followers_count   integer default 0,
  following_count   integer default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ================================================================
-- SONGS
-- ================================================================
create table public.songs (
  id            uuid default uuid_generate_v4() primary key,
  artist_id     uuid references public.profiles(id) on delete cascade not null,
  title         text not null,
  description   text,
  genre         text,
  cover_url     text,
  audio_url     text not null,
  duration      integer,               -- seconds
  plays_count   integer default 0,
  likes_count   integer default 0,
  comments_count integer default 0,
  is_published  boolean default true,

  -- Monetization
  sale_type     text default 'free'    -- 'free' | 'fixed' | 'pwyw' | 'auction'
    check (sale_type in ('free', 'fixed', 'pwyw', 'auction')),
  price         numeric(10,2),          -- for 'fixed' (in USD)
  min_price     numeric(10,2),          -- for 'pwyw' minimum
  max_price     numeric(10,2),          -- for 'pwyw' maximum
  auction_end   timestamptz,            -- for 'auction'

  -- Ownership
  allows_resale boolean default false,
  allows_investment boolean default false,
  investment_shares integer default 0, -- total investable shares

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ================================================================
-- LIKES
-- ================================================================
create table public.likes (
  id        uuid default uuid_generate_v4() primary key,
  user_id   uuid references public.profiles(id) on delete cascade not null,
  song_id   uuid references public.songs(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, song_id)
);

-- ================================================================
-- COMMENTS
-- ================================================================
create table public.comments (
  id         uuid default uuid_generate_v4() primary key,
  song_id    uuid references public.songs(id) on delete cascade not null,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  body       text not null,
  created_at timestamptz default now()
);

-- ================================================================
-- FOLLOWS
-- ================================================================
create table public.follows (
  id           uuid default uuid_generate_v4() primary key,
  follower_id  uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  created_at   timestamptz default now(),
  unique(follower_id, following_id),
  check (follower_id != following_id)
);

-- ================================================================
-- PURCHASES
-- ================================================================
create table public.purchases (
  id               uuid default uuid_generate_v4() primary key,
  buyer_id         uuid references public.profiles(id) on delete set null,
  song_id          uuid references public.songs(id) on delete set null not null,
  amount_paid      numeric(10,2) not null,
  stripe_session_id text,
  stripe_payment_intent text,
  status           text default 'pending'
    check (status in ('pending', 'completed', 'refunded')),
  created_at       timestamptz default now()
);

-- ================================================================
-- BIDS (Auction system)
-- ================================================================
create table public.bids (
  id         uuid default uuid_generate_v4() primary key,
  song_id    uuid references public.songs(id) on delete cascade not null,
  bidder_id  uuid references public.profiles(id) on delete cascade not null,
  amount     numeric(10,2) not null,
  status     text default 'active'
    check (status in ('active', 'won', 'outbid', 'cancelled')),
  created_at timestamptz default now()
);

-- ================================================================
-- TRANSACTIONS (Ledger)
-- ================================================================
create table public.transactions (
  id               uuid default uuid_generate_v4() primary key,
  from_user_id     uuid references public.profiles(id) on delete set null,
  to_user_id       uuid references public.profiles(id) on delete set null,
  song_id          uuid references public.songs(id) on delete set null,
  type             text not null
    check (type in ('sale', 'bid', 'investment', 'resale', 'payout', 'platform_fee')),
  amount           numeric(10,2) not null,
  platform_fee     numeric(10,2) default 0,
  net_amount       numeric(10,2),         -- amount - platform_fee
  stripe_transfer_id text,
  metadata         jsonb,
  created_at       timestamptz default now()
);

-- ================================================================
-- INVESTMENTS
-- ================================================================
create table public.investments (
  id         uuid default uuid_generate_v4() primary key,
  song_id    uuid references public.songs(id) on delete cascade not null,
  investor_id uuid references public.profiles(id) on delete cascade not null,
  shares     integer not null,
  amount_paid numeric(10,2) not null,
  created_at timestamptz default now(),
  unique(song_id, investor_id)
);

-- ================================================================
-- BILLBOARDS
-- ================================================================
create table public.billboards (
  id          uuid default uuid_generate_v4() primary key,
  owner_id    uuid references public.profiles(id) on delete cascade not null,
  slot        integer not null unique,        -- 1-20 limited billboard slots
  title       text not null,
  image_url   text not null,
  click_url   text,
  impressions integer default 0,
  price_paid  numeric(10,2) not null,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

-- ================================================================
-- NOTIFICATIONS
-- ================================================================
create table public.notifications (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  type       text not null,  -- 'like', 'comment', 'follow', 'purchase', 'bid', 'mention'
  actor_id   uuid references public.profiles(id) on delete cascade,
  song_id    uuid references public.songs(id) on delete cascade,
  message    text,
  read       boolean default false,
  created_at timestamptz default now()
);

-- ================================================================
-- INDEXES
-- ================================================================
create index on public.songs(artist_id);
create index on public.songs(sale_type);
create index on public.songs(created_at desc);
create index on public.likes(song_id);
create index on public.likes(user_id);
create index on public.comments(song_id);
create index on public.follows(follower_id);
create index on public.follows(following_id);
create index on public.bids(song_id, amount desc);
create index on public.notifications(user_id, read);

-- ================================================================
-- TRIGGERS — auto-update counters
-- ================================================================

create or replace function update_song_likes_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.songs set likes_count = likes_count + 1 where id = new.song_id;
  elsif tg_op = 'DELETE' then
    update public.songs set likes_count = likes_count - 1 where id = old.song_id;
  end if;
  return null;
end;
$$;

create trigger trg_song_likes
after insert or delete on public.likes
for each row execute function update_song_likes_count();

create or replace function update_song_comments_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.songs set comments_count = comments_count + 1 where id = new.song_id;
  elsif tg_op = 'DELETE' then
    update public.songs set comments_count = comments_count - 1 where id = old.song_id;
  end if;
  return null;
end;
$$;

create trigger trg_song_comments
after insert or delete on public.comments
for each row execute function update_song_comments_count();

create or replace function update_follow_counts()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = following_count - 1 where id = old.follower_id;
    update public.profiles set followers_count = followers_count - 1 where id = old.following_id;
  end if;
  return null;
end;
$$;

create trigger trg_follow_counts
after insert or delete on public.follows
for each row execute function update_follow_counts();

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function set_updated_at();

create trigger trg_songs_updated_at
before update on public.songs
for each row execute function set_updated_at();

-- ================================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.purchases enable row level security;
alter table public.bids enable row level security;
alter table public.transactions enable row level security;
alter table public.investments enable row level security;
alter table public.billboards enable row level security;
alter table public.notifications enable row level security;

-- Profiles: public read, owner write
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Songs: public read of published, owner full access
create policy "songs_select" on public.songs for select using (is_published = true or artist_id = auth.uid());
create policy "songs_insert" on public.songs for insert with check (artist_id = auth.uid());
create policy "songs_update" on public.songs for update using (artist_id = auth.uid());
create policy "songs_delete" on public.songs for delete using (artist_id = auth.uid());

-- Likes: authenticated users
create policy "likes_select" on public.likes for select using (true);
create policy "likes_insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on public.likes for delete using (auth.uid() = user_id);

-- Comments: public read, authenticated write, owner delete
create policy "comments_select" on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments_delete" on public.comments for delete using (auth.uid() = user_id);

-- Follows
create policy "follows_select" on public.follows for select using (true);
create policy "follows_insert" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows_delete" on public.follows for delete using (auth.uid() = follower_id);

-- Purchases: own purchases
create policy "purchases_select" on public.purchases for select using (auth.uid() = buyer_id);
create policy "purchases_insert" on public.purchases for insert with check (auth.uid() = buyer_id);

-- Bids
create policy "bids_select" on public.bids for select using (true);
create policy "bids_insert" on public.bids for insert with check (auth.uid() = bidder_id);

-- Transactions: parties involved
create policy "transactions_select" on public.transactions for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Investments
create policy "investments_select" on public.investments for select using (true);
create policy "investments_insert" on public.investments for insert with check (auth.uid() = investor_id);

-- Billboards: public read
create policy "billboards_select" on public.billboards for select using (true);
create policy "billboards_insert" on public.billboards for insert with check (auth.uid() = owner_id);

-- Notifications: owner only
create policy "notifications_select" on public.notifications for select using (auth.uid() = user_id);
create policy "notifications_update" on public.notifications for update using (auth.uid() = user_id);

-- ================================================================
-- STORAGE BUCKETS (run after enabling Storage in Supabase)
-- ================================================================
-- insert into storage.buckets(id, name, public) values ('songs', 'songs', true);
-- insert into storage.buckets(id, name, public) values ('covers', 'covers', true);
-- insert into storage.buckets(id, name, public) values ('avatars', 'avatars', true);
-- insert into storage.buckets(id, name, public) values ('billboards', 'billboards', true);
