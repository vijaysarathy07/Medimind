-- ============================================================
-- MediMind – Supabase Schema + Row Level Security
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ─────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────
create type reminder_status  as enum ('pending', 'taken', 'skipped', 'missed');
create type meal_relation     as enum ('before_meal', 'with_meal', 'after_meal', 'independent');
create type alert_reason      as enum ('missed_dose', 'low_stock', 'skipped_dose');


-- ─────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────

-- users
-- Mirrors auth.users; one row per authenticated user.
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text        not null,
  phone        text,
  created_at   timestamptz not null default now()
);

-- medicines
create table public.medicines (
  id                uuid        primary key default uuid_generate_v4(),
  user_id           uuid        not null references public.users (id) on delete cascade,
  name              text        not null,
  dosage            text        not null,                     -- e.g. "500 mg"
  frequency         text        not null,                     -- e.g. "Daily", "Weekly"
  times_per_day     smallint    not null default 1 check (times_per_day > 0),
  meal_relation     meal_relation not null default 'independent',
  pill_count        integer     not null default 0 check (pill_count >= 0),
  refill_alert_at   integer     not null default 7  check (refill_alert_at >= 0),
  created_at        timestamptz not null default now()
);

-- reminders
-- One row per scheduled dose instance for a medicine.
create table public.reminders (
  id             uuid           primary key default uuid_generate_v4(),
  medicine_id    uuid           not null references public.medicines (id) on delete cascade,
  scheduled_time timestamptz    not null,
  taken_at       timestamptz,
  skipped_at     timestamptz,
  status         reminder_status not null default 'pending',

  -- A dose cannot be both taken and skipped
  constraint taken_xor_skipped check (
    not (taken_at is not null and skipped_at is not null)
  )
);

-- caregivers
create table public.caregivers (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users (id) on delete cascade,
  name         text not null,
  phone        text not null,
  relationship text not null,    -- e.g. "Spouse", "Doctor", "Nurse"
  created_at   timestamptz not null default now()
);

-- caregiver_alerts
create table public.caregiver_alerts (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  medicine_id  uuid        not null references public.medicines (id) on delete cascade,
  caregiver_id uuid        not null references public.caregivers (id) on delete cascade,
  sent_at      timestamptz not null default now(),
  reason       alert_reason not null
);


-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────

-- Fast per-user medicine lookups
create index idx_medicines_user_id        on public.medicines        (user_id);

-- Reminder queries by medicine and by upcoming schedule
create index idx_reminders_medicine_id    on public.reminders        (medicine_id);
create index idx_reminders_scheduled      on public.reminders        (scheduled_time);
create index idx_reminders_status         on public.reminders        (status);

-- Caregiver lookups per user
create index idx_caregivers_user_id       on public.caregivers       (user_id);

-- Alert queries by user, caregiver, or medicine
create index idx_alerts_user_id           on public.caregiver_alerts (user_id);
create index idx_alerts_caregiver_id      on public.caregiver_alerts (caregiver_id);
create index idx_alerts_medicine_id       on public.caregiver_alerts (medicine_id);
create index idx_alerts_sent_at           on public.caregiver_alerts (sent_at desc);


-- ─────────────────────────────────────────────────────────────
-- AUTO-CREATE USER PROFILE ON SIGN-UP
-- Fires after a new row is inserted into auth.users so every
-- authenticated user gets a matching public.users record.
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', null)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
alter table public.users            enable row level security;
alter table public.medicines        enable row level security;
alter table public.reminders        enable row level security;
alter table public.caregivers       enable row level security;
alter table public.caregiver_alerts enable row level security;


-- ── users ────────────────────────────────────────────────────

create policy "users: read own row"
  on public.users for select
  using (id = auth.uid());

create policy "users: update own row"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert is handled by the trigger (runs as security definer).
-- No direct insert policy needed from the client.


-- ── medicines ────────────────────────────────────────────────

create policy "medicines: read own"
  on public.medicines for select
  using (user_id = auth.uid());

create policy "medicines: insert own"
  on public.medicines for insert
  with check (user_id = auth.uid());

create policy "medicines: update own"
  on public.medicines for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "medicines: delete own"
  on public.medicines for delete
  using (user_id = auth.uid());


-- ── reminders ────────────────────────────────────────────────
-- No user_id column; ownership is resolved through the parent medicine.

create policy "reminders: read own"
  on public.reminders for select
  using (
    medicine_id in (
      select id from public.medicines where user_id = auth.uid()
    )
  );

create policy "reminders: insert own"
  on public.reminders for insert
  with check (
    medicine_id in (
      select id from public.medicines where user_id = auth.uid()
    )
  );

create policy "reminders: update own"
  on public.reminders for update
  using (
    medicine_id in (
      select id from public.medicines where user_id = auth.uid()
    )
  )
  with check (
    medicine_id in (
      select id from public.medicines where user_id = auth.uid()
    )
  );

create policy "reminders: delete own"
  on public.reminders for delete
  using (
    medicine_id in (
      select id from public.medicines where user_id = auth.uid()
    )
  );


-- ── caregivers ───────────────────────────────────────────────

create policy "caregivers: read own"
  on public.caregivers for select
  using (user_id = auth.uid());

create policy "caregivers: insert own"
  on public.caregivers for insert
  with check (user_id = auth.uid());

create policy "caregivers: update own"
  on public.caregivers for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "caregivers: delete own"
  on public.caregivers for delete
  using (user_id = auth.uid());


-- ── caregiver_alerts ─────────────────────────────────────────

create policy "alerts: read own"
  on public.caregiver_alerts for select
  using (user_id = auth.uid());

create policy "alerts: insert own"
  on public.caregiver_alerts for insert
  with check (user_id = auth.uid());

-- Alerts are append-only; no update or delete from the client.


-- ─────────────────────────────────────────────────────────────
-- HELPER VIEWS (optional, safe to skip)
-- ─────────────────────────────────────────────────────────────

-- Upcoming reminders for the signed-in user with medicine name attached
create or replace view public.upcoming_reminders as
select
  r.id,
  r.medicine_id,
  m.name           as medicine_name,
  m.dosage,
  m.meal_relation,
  r.scheduled_time,
  r.status
from public.reminders  r
join public.medicines   m on m.id = r.medicine_id
where
  r.status         = 'pending'
  and r.scheduled_time >= now()
  and m.user_id    = auth.uid()
order by r.scheduled_time;

-- Medicines whose pill_count has dropped to or below refill_alert_at
create or replace view public.low_stock_medicines as
select
  id,
  name,
  dosage,
  pill_count,
  refill_alert_at
from public.medicines
where
  pill_count  <= refill_alert_at
  and user_id  = auth.uid();
