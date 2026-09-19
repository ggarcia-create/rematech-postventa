create table public.rematech_profiles (
 id uuid primary key references auth.users(id),
 name text not null check(length(name) between 1 and 120),
 email text not null unique,
 role text not null check(role in ('admin','ingresos','reparacion','calidad')),
 must_change_password boolean not null default true,
 active boolean not null default true
);
create table public.rematech_cases (
 id uuid primary key,
 folio_key text not null unique,
 revision integer not null,
 body jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.rematech_profiles enable row level security;
alter table public.rematech_cases enable row level security;
-- All business access goes through the authenticated Edge Function. No client writes.
revoke all on public.rematech_profiles, public.rematech_cases from anon, authenticated;
grant all on public.rematech_profiles, public.rematech_cases to service_role;
create function public.rematech_save_case(p_id uuid, p_revision integer, p_body jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare saved jsonb;
begin
 if p_revision is null then
   insert into rematech_cases(id,folio_key,revision,body)
   values(p_id,lower(trim(p_body->'intake'->>'folio')),(p_body->>'revision')::integer,p_body)
   returning body into saved;
 else
   update rematech_cases set body=p_body, revision=(p_body->>'revision')::integer,updated_at=now()
   where id=p_id and revision=p_revision returning body into saved;
   if not found then raise exception 'Otro usuario actualizó el expediente. Vuelve a abrirlo.' using errcode='40001'; end if;
 end if;
 return saved;
end $$;
revoke all on function public.rematech_save_case(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.rematech_save_case(uuid,integer,jsonb) to service_role;
-- Read receipts are stored separately, so case updates cannot overwrite them.
create table public.rematech_notification_reads (
 user_id uuid not null references auth.users(id),
 case_id uuid not null references public.rematech_cases(id),
 notification_id uuid not null,
 primary key(user_id,case_id,notification_id)
);
alter table public.rematech_notification_reads enable row level security;
revoke all on public.rematech_notification_reads from anon,authenticated;
grant all on public.rematech_notification_reads to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rematech-evidence','rematech-evidence',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create table public.rematech_email_limits(user_id uuid primary key references auth.users(id),period timestamptz not null,hits integer not null);
alter table public.rematech_email_limits enable row level security;
revoke all on public.rematech_email_limits from anon,authenticated;
grant all on public.rematech_email_limits to service_role;
create function public.rematech_claim_email(p_user uuid) returns void language plpgsql set search_path=public as $$
declare total integer;
begin
 insert into rematech_email_limits values(p_user,date_trunc('hour',now()),1)
 on conflict(user_id) do update set
 hits=case when rematech_email_limits.period=date_trunc('hour',now()) then rematech_email_limits.hits+1 else 1 end,
 period=date_trunc('hour',now()) returning hits into total;
 if total>30 then raise exception 'Límite de 30 correos por hora alcanzado.'; end if;
end $$;
revoke all on function public.rematech_claim_email(uuid) from public,anon,authenticated;
grant execute on function public.rematech_claim_email(uuid) to service_role;
