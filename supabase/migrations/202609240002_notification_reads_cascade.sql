-- El recibo de lectura es información auxiliar del expediente.
-- Al borrar un expediente, sus recibos deben desaparecer automáticamente.
alter table public.rematech_notification_reads
  drop constraint if exists rematech_notification_reads_case_id_fkey;

alter table public.rematech_notification_reads
  add constraint rematech_notification_reads_case_id_fkey
  foreign key (case_id)
  references public.rematech_cases(id)
  on delete cascade;
