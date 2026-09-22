-- Keep approved and paid payroll amounts immutable during recalculation.
create or replace function public.generate_monthly_payroll(p_month date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_school text; v_role text; v_department text; v_count integer := 0; v_start date; v_end date; r record; v_work numeric; v_paid numeric; v_gross numeric; v_leave numeric;
begin
  select school_id, role, department into v_school, v_role, v_department from user_profiles where id = auth.uid();
  if not (v_role = 'SCHOOL_ADMIN' or (v_role = 'STAFF' and v_department = 'ACCOUNTS')) then raise exception 'Not authorized to generate payroll'; end if;
  v_start := date_trunc('month', p_month)::date; v_end := (v_start + interval '1 month - 1 day')::date;
  for r in
    select distinct on (employee_type, employee_id) * from salary_structures
    where school_id=v_school and active and effective_from <= v_end order by employee_type, employee_id, effective_from desc
  loop
    if r.employee_type='TEACHER' then
      select count(distinct date) into v_work from teacher_attendance where school_id=v_school and date between v_start and v_end;
      select coalesce(sum(case when status::text in ('Present','Late','Leave') then 1 else 0 end),0) into v_paid from teacher_attendance where school_id=v_school and teacher_id=r.employee_id and date between v_start and v_end;
      select v_paid + count(*) into v_paid from (select distinct date from teacher_attendance where school_id=v_school and date between v_start and v_end) d
      where exists(select 1 from leave_requests l where l.school_id=v_school and l.requester_type='TEACHER' and l.requester_id=r.employee_id and upper(l.status)='APPROVED' and d.date between l.from_date and l.to_date)
      and not exists(select 1 from teacher_attendance a where a.teacher_id=r.employee_id and a.date=d.date and a.status::text in ('Present','Late','Leave'));
    else
      select count(distinct date) into v_work from staff_attendance where school_id=v_school and date between v_start and v_end;
      select coalesce(sum(case when status::text in ('Present','Late','Leave') then 1 else 0 end),0) into v_paid from staff_attendance where school_id=v_school and staff_id=r.employee_id and date between v_start and v_end;
      select v_paid + count(*) into v_paid from (select distinct date from staff_attendance where school_id=v_school and date between v_start and v_end) d
      where exists(select 1 from leave_requests l where l.school_id=v_school and l.requester_type='STAFF' and l.requester_id=r.employee_id and upper(l.status)='APPROVED' and d.date between l.from_date and l.to_date)
      and not exists(select 1 from staff_attendance a where a.staff_id=r.employee_id and a.date=d.date and a.status::text in ('Present','Late','Leave'));
    end if;
    v_gross := r.basic_salary+r.hra+r.special_allowance;
    v_leave := case when v_work>0 then round(v_gross/greatest(v_work,1)*greatest(v_work-v_paid,0),2) else 0 end;
    insert into payroll_items(school_id,employee_type,employee_id,salary_structure_id,payroll_month,working_days,paid_days,unpaid_days,gross_salary,leave_deduction,fixed_deductions,net_salary,status,updated_at)
    values(v_school,r.employee_type,r.employee_id,r.id,v_start,v_work,v_paid,greatest(v_work-v_paid,0),v_gross,v_leave,r.fixed_deductions,greatest(v_gross-v_leave-r.fixed_deductions,0),'CALCULATED',now())
    on conflict(school_id,employee_type,employee_id,payroll_month) do update set salary_structure_id=excluded.salary_structure_id,working_days=excluded.working_days,paid_days=excluded.paid_days,unpaid_days=excluded.unpaid_days,gross_salary=excluded.gross_salary,leave_deduction=excluded.leave_deduction,fixed_deductions=excluded.fixed_deductions,net_salary=excluded.net_salary,status='CALCULATED',updated_at=now()
    where payroll_items.status not in ('PAID','APPROVED');
    v_count:=v_count+1;
  end loop; return v_count;
end $$;
grant execute on function public.generate_monthly_payroll(date) to authenticated;
