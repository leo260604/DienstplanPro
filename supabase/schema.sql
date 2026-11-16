-- =====================================================================
--  DienstPlan Pro – Datenbankschema für Supabase
--  Ausführen: Supabase-Dashboard → SQL Editor → New query → einfügen → Run
--  Das Skript kann gefahrlos mehrfach ausgeführt werden.
-- =====================================================================

-- Mitarbeitende (Kontakte)
create table if not exists public.employees (
  id           text primary key,
  sort_order   integer,
  name         text not null,
  initials     text,
  status_text  text,
  time_text    text,
  color        text,
  team         text,            -- Hauptteam (Anzeige)
  email        text,
  phone        text,            -- Bereitschaftsnummer
  photo        text,            -- Profilbild als Data-URL
  role         text,            -- Benutzerrolle
  teams_phone  text,            -- Microsoft-Teams-Telefonnummer
  extra        jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- Teams
create table if not exists public.teams (
  id             text primary key,
  sort_order     integer,
  name           text not null,
  member_ids     jsonb not null default '[]'::jsonb,
  leader_id      text,
  deputy_id      text,
  standby_color  text,
  settings       jsonb,          -- Teamregeln (Diensttausch, Selbst eintragen)
  extra          jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

-- Abteilungen
create table if not exists public.departments (
  id          text primary key,
  sort_order  integer,
  name        text not null,
  head_id     text,
  color       text,
  team_ids    jsonb not null default '[]'::jsonb,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Einträge: Dienste, Bereitschaften, Abwesenheiten, Arbeitsorte
create table if not exists public.assignments (
  id          text primary key,
  kind        text,              -- Dienstplan | Bereitschaft | Arbeitsort
  team        text,
  employee    text,
  shift       text,              -- Dienst / Bereitschaftszeit / Abwesenheitsart
  day         date,
  start_time  text,
  end_time    text,
  is_absence  boolean,
  note        text,
  color       text,
  group_id    text,
  group_name  text,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists assignments_day_idx on public.assignments (day);
create index if not exists assignments_team_day_idx on public.assignments (team, day);

-- Dienstzeiten (Schichtmodelle)
create table if not exists public.shift_types (
  id          text primary key,
  sort_order  integer,
  team        text,
  name        text not null,
  start_time  text,
  end_time    text,
  pause       integer,
  color       text,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Bereitschaftsgruppen (nur noch für ältere Einträge)
create table if not exists public.standby_groups (
  id          text primary key,
  sort_order  integer,
  name        text not null,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Bereitschaftszeiten
create table if not exists public.standby_times (
  id          text primary key,
  sort_order  integer,
  name        text not null,
  type        text,              -- fix | variabel
  start_time  text,
  end_time    text,
  color       text,
  team_ids    jsonb,             -- null = alle Teams
  group_id    text,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Diensttausch-Anfragen
create table if not exists public.swaps (
  id           text primary key,
  status       text,
  from_name    text,
  from_id      text,
  to_name      text,
  to_id        text,
  give         jsonb,
  take         jsonb,
  note         text,
  created_ms   bigint,
  decided_ms   bigint,
  extra        jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- Audit Log
create table if not exists public.audit_log (
  id            text primary key,
  ts            bigint,
  user_name     text,
  role          text,
  action        text,
  area          text,
  title         text,
  object        text,
  detail        text,
  before_value  text,
  after_value   text,
  extra         jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);
create index if not exists audit_log_ts_idx on public.audit_log (ts desc);

-- Export Audit
create table if not exists public.export_log (
  id          text primary key,
  ts          bigint,
  user_name   text,
  role        text,
  report      text,
  format      text,
  rows        integer,
  status      text,
  range_text  text,
  size        bigint,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists export_log_ts_idx on public.export_log (ts desc);

-- Benachrichtigungen
create table if not exists public.notifications (
  id              text primary key,
  recipient_id    text,
  recipient_role  text,
  created_ms      bigint,
  extra           jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- Rollen und Berechtigungen
create table if not exists public.roles (
  name         text primary key,
  sort_order   integer,
  listed       boolean not null default true,   -- erscheint in der Rollenliste
  permissions  jsonb,                           -- { Bereich: "N" | "R" | "E" }
  updated_at   timestamptz not null default now()
);

-- Sonstige Einstellungen (Links, Favoriten, Dashboard-Layouts, Benachrichtigungs-Einstellungen …)
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);

-- updated_at bei jeder Änderung setzen
create or replace function public.dp_touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['employees','teams','departments','assignments','shift_types','standby_groups',
                           'standby_times','swaps','audit_log','export_log','notifications','roles','app_settings']
  loop
    execute format('drop trigger if exists dp_touch on public.%I', t);
    execute format('create trigger dp_touch before update on public.%I for each row execute function public.dp_touch_updated_at()', t);
  end loop;
end $$;

-- =====================================================================
--  Zugriff – VORLÄUFIG OHNE ANMELDUNG
--  Jede Person mit dem Link der Seite kann alle Daten lesen und ändern.
--  Sobald eine echte Anmeldung eingebaut ist, werden diese Regeln ersetzt.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['employees','teams','departments','assignments','shift_types','standby_groups',
                           'standby_times','swaps','audit_log','export_log','notifications','roles','app_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dp_open_access on public.%I', t);
    execute format('create policy dp_open_access on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
