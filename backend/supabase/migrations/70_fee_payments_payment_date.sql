-- ============================================================================
-- The live fee_payments table still has an older, required `payment_date` (date) column
-- that collect_fee_payment() doesn't fill (it writes `paid_on`). Collecting a fee then
-- failed with: null value in column "payment_date" violates not-null constraint.
-- Fill it from paid_on (India time) whenever it's missing, so the two always agree.
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fee_payments' and column_name = 'payment_date'
  ) then
    alter table public.fee_payments alter column payment_date set default current_date;

    create or replace function public.tg_fee_payments_payment_date()
    returns trigger
    language plpgsql set search_path = public, pg_temp as $f$
    begin
      if new.payment_date is null then
        new.payment_date := coalesce(
          (new.paid_on at time zone 'Asia/Kolkata')::date,
          (now() at time zone 'Asia/Kolkata')::date
        );
      end if;
      return new;
    end;
    $f$;

    drop trigger if exists trg_fee_payments_payment_date on public.fee_payments;
    create trigger trg_fee_payments_payment_date
      before insert or update on public.fee_payments
      for each row execute function public.tg_fee_payments_payment_date();
  end if;
end;
$$;
