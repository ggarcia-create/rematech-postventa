alter table public.rematech_profiles
  add column if not exists permissions jsonb not null default '[]'::jsonb;

update public.rematech_profiles
set permissions = case role
  when 'admin' then '["dashboard","ingresos","reparacion","calidad","settings"]'::jsonb
  when 'ingresos' then '["dashboard","ingresos"]'::jsonb
  when 'reparacion' then '["dashboard","reparacion"]'::jsonb
  when 'calidad' then '["dashboard","calidad"]'::jsonb
  else '[]'::jsonb
end
where permissions = '[]'::jsonb;
