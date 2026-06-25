-- 登記完了予定日アプリ：事務所共有モード用 Supabase schema
-- Supabase SQL Editor で実行します。
-- 重要：案件名を扱うため、RLS（行単位セキュリティ）を必ず有効にします。

create extension if not exists pgcrypto;

create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.office_members (
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (office_id, user_id)
);

create table if not exists public.office_cases (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  label text not null default '',
  jurisdiction_id text not null,
  registration_type text not null check (registration_type in ('realEstate', 'commercial')),
  registry_office text not null,
  apply_date date not null,
  due_date date,
  status text not null default 'active' check (status in ('active', 'done')),
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists office_cases_office_due_idx on public.office_cases (office_id, due_date, created_at desc);
create index if not exists office_members_user_idx on public.office_members (user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists office_cases_touch_updated_at on public.office_cases;
create trigger office_cases_touch_updated_at
before update on public.office_cases
for each row execute function public.touch_updated_at();

create or replace function public.is_office_member(target_office_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.office_members m
    where m.office_id = target_office_id
      and m.user_id = (select auth.uid())
  );
$$;

alter table public.offices enable row level security;
alter table public.office_members enable row level security;
alter table public.office_cases enable row level security;

grant select on public.offices to authenticated;
grant select on public.office_members to authenticated;
grant select, insert, update, delete on public.office_cases to authenticated;
grant execute on function public.is_office_member(uuid) to authenticated;

-- 既存ポリシーがある場合の再実行に備えて削除
DROP POLICY IF EXISTS "Members can view their offices" ON public.offices;
DROP POLICY IF EXISTS "Members can view office members" ON public.office_members;
DROP POLICY IF EXISTS "Members can view office cases" ON public.office_cases;
DROP POLICY IF EXISTS "Members can insert office cases" ON public.office_cases;
DROP POLICY IF EXISTS "Members can update office cases" ON public.office_cases;
DROP POLICY IF EXISTS "Members can delete office cases" ON public.office_cases;

create policy "Members can view their offices"
on public.offices for select
to authenticated
using (public.is_office_member(id));

create policy "Members can view office members"
on public.office_members for select
to authenticated
using (public.is_office_member(office_id));

create policy "Members can view office cases"
on public.office_cases for select
to authenticated
using (public.is_office_member(office_id));

create policy "Members can insert office cases"
on public.office_cases for insert
to authenticated
with check (
  public.is_office_member(office_id)
  and created_by = (select auth.uid())
);

create policy "Members can update office cases"
on public.office_cases for update
to authenticated
using (public.is_office_member(office_id))
with check (public.is_office_member(office_id));

create policy "Members can delete office cases"
on public.office_cases for delete
to authenticated
using (public.is_office_member(office_id));

-- 初期設定例：
-- 1) Supabase Dashboard > Authentication > Users で先生・事務員さんのユーザーを作成
-- 2) 下記を実行して事務所を作る
-- insert into public.offices (name) values ('○○司法書士事務所') returning id;
-- 3) Users画面で各ユーザーのUUIDを確認し、事務所に紐づける
-- insert into public.office_members (office_id, user_id, role, display_name)
-- values ('上で返ってきたoffice id', 'ユーザーUUID', 'owner', '先生の表示名');