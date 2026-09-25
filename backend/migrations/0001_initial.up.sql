-- The records, in Postgres.
--
-- Every table lives in its own schema (`jura` unless JURA_DB_SCHEMA says
-- otherwise), not in `public`. Supabase publishes `public` through its REST
-- API to anyone holding the publishable key, and that key is designed to be
-- public. Nothing here should be reachable that way — the only door is the
-- Railway API, which checks a session first.
--
-- Unqualified names throughout: the runner sets search_path to the schema.

-- ------------------------------------------------------------------ settings
-- One row. The company details, payment details, terms and panel settings.
create table settings (
  id         smallint primary key default 1 check (id = 1),
  config     jsonb not null check (jsonb_typeof(config) = 'object'),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- clients
create table clients (
  id         text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  data       jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_row_matches_data check (data ->> 'id' = id)
);

-- ----------------------------------------------------------------- templates
create table templates (
  slug       text primary key check (slug ~ '^[A-Za-z0-9_-]{1,80}$'),
  name       text not null,
  sort_order integer not null default 50,
  data       jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ counters
-- The next number is one statement:
--
--   insert into counters (doc_type, period, seq) values ($1, $2, 1)
--   on conflict (doc_type, period) do update set seq = counters.seq + 1
--   returning seq;
--
-- Two concurrent issues serialise on the row lock, and because the counter and
-- the document are written in one transaction, a failed issue rolls the counter
-- back with it. No lock file to leave behind, and no gap either.
create table counters (
  doc_type text    not null check (doc_type in ('quotation', 'invoice', 'receipt', 'credit_note')),
  period   text    not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  seq      integer not null check (seq >= 1),
  primary key (doc_type, period)
);

-- ----------------------------------------------------------------- documents
-- The whole document is `data`. The columns beside it are copies of the fields
-- the database has to reason about, and a check keeps them honest.
create table documents (
  id         text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  type       text not null check (type in ('quotation', 'invoice', 'receipt', 'credit_note')),
  number     text,
  status     text not null,
  issued_at  text,
  data       jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A number is never handed out twice, by any route — including one written
  -- by hand in the SQL editor.
  constraint documents_number_unique unique (number),

  -- A draft has no number. Anything past draft has one, except a draft that
  -- was voided before it was ever issued.
  constraint documents_draft_has_no_number check (status <> 'draft' or number is null),
  constraint documents_issued_has_number check (status in ('draft', 'void') or number is not null),

  constraint documents_row_matches_data check (
    data ->> 'id' = id
    and data ->> 'type' = type
    and data ->> 'status' = status
    and (data ->> 'number') is not distinct from number
  )
);

create index documents_type_status on documents (type, status);

-- An issued document is frozen. The API refuses edits by name before they get
-- here; this makes the same rule true for anything else that can reach the
-- table. The list of what may still change is MUTABLE_AFTER_ISSUE in
-- shared/src/document.js, and the two must agree.
create function guard_issued_document() returns trigger
language plpgsql as $$
declare
  mutable text[] := array[
    'status', 'sent_at', 'paid_at', 'accepted_at', 'voided_at',
    'void_reason', 'payments', 'links', 'updated_at'
  ];
begin
  if tg_op = 'DELETE' then
    if old.number is not null then
      raise exception '% has been issued and cannot be deleted. Void it instead.', old.number;
    end if;
    return old;
  end if;

  if old.number is not null then
    if new.number is distinct from old.number then
      raise exception '% has been issued, so its number cannot be changed.', old.number;
    end if;
    if (new.data - mutable) is distinct from (old.data - mutable) then
      raise exception '% has been issued, so its content cannot be changed. Raise a credit note instead.', old.number;
    end if;
  end if;
  return new;
end;
$$;

create trigger documents_guard_issued
  before update or delete on documents
  for each row execute function guard_issued_document();

-- --------------------------------------------------------------------- users
create table users (
  id            bigint generated always as identity primary key,
  username      text not null unique check (username ~ '^[A-Za-z0-9._@-]{1,80}$'),
  password_hash text not null check (password_hash like 'scrypt$%'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Row level security with no policies: nothing gets in through Supabase's own
-- APIs even if this schema is exposed there by mistake later. The API connects
-- as the table owner, which RLS does not apply to.
alter table settings  enable row level security;
alter table clients   enable row level security;
alter table templates enable row level security;
alter table counters  enable row level security;
alter table documents enable row level security;
alter table users     enable row level security;
