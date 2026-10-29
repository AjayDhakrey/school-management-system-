-- Fix payroll leave deduction calculation to prevent unrecorded attendance from wiping out 100% of gross salary
-- and properly deduct only explicit unapproved absences, keeping PF / fixed deductions accurate.

create or replace function public.generate_monthly_payroll(p_month date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_school text;
  v_role text;
  v_department text;
  v_count integer := 0;
  v_start date;
  v_end date;
  r record;
  v_work numeric;
  v_emp_records numeric;
  v_unpaid numeric;
  v_paid numeric;
  v_gross numeric;
  v_leave numeric;
  v_days_in_month numeric;
begin
  select school_id, role, department into v_school, v_role, v_department from user_profiles where id = auth.uid();
  if not (v_role = 'SCHOOL_ADMIN' or (v_role = 'STAFF' and v_department = 'ACCOUNTS')) then
    raise exception 'Not authorized to generate payroll';
  end if;

  v_start := date_trunc('month', p_month)::date;
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_days_in_month := extract(day from v_end);

  for r in
    select distinct on (employee_type, employee_id) * from salary_structures
    where school_id = v_school and active and effective_from <= v_end
    order by employee_type, employee_id, effective_from desc
  loop
    if r.employee_type = 'TEACHER' then
      -- Count working days where any teacher attendance was logged in the school
      select count(distinct date) into v_work
      from teacher_attendance
      where school_id = v_school and date between v_start and v_end;

      -- Check how many attendance records exist for this specific teacher
      select count(*) into v_emp_records
      from teacher_attendance
      where school_id = v_school and teacher_id = r.employee_id and date between v_start and v_end;

      if v_emp_records > 0 then
        -- Count explicit absences that were NOT approved leave
        select count(*) into v_unpaid
        from teacher_attendance a
        where a.school_id = v_school
          and a.teacher_id = r.employee_id
          and a.date between v_start and v_end
          and a.status::text = 'Absent'
          and not exists (
            select 1 from leave_requests l
            where l.school_id = v_school
              and l.requester_type = 'TEACHER'
              and l.requester_id = r.employee_id
              and upper(l.status) = 'APPROVED'
              and a.date between l.from_date and l.to_date
          );
        v_work := greatest(coalesce(v_work, 0), v_emp_records);
        v_paid := greatest(v_work - v_unpaid, 0);
      else
        -- No attendance records logged for this employee: do not penalize with 100% leave deduction
        v_work := coalesce(nullif(v_work, 0), v_days_in_month);
        v_unpaid := 0;
        v_paid := v_work;
      end if;
    else
      -- Staff attendance
      select count(distinct date) into v_work
      from staff_attendance
      where school_id = v_school and date between v_start and v_end;

      select count(*) into v_emp_records
      from staff_attendance
      where school_id = v_school and staff_id = r.employee_id and date between v_start and v_end;

      if v_emp_records > 0 then
        select count(*) into v_unpaid
        from staff_attendance a
        where a.school_id = v_school
          and a.staff_id = r.employee_id
          and a.date between v_start and v_end
          and a.status::text = 'Absent'
          and not exists (
            select 1 from leave_requests l
            where l.school_id = v_school
              and l.requester_type = 'STAFF'
              and l.requester_id = r.employee_id
              and upper(l.status) = 'APPROVED'
              and a.date between l.from_date and l.to_date
          );
        v_work := greatest(coalesce(v_work, 0), v_emp_records);
        v_paid := greatest(v_work - v_unpaid, 0);
      else
        v_work := coalesce(nullif(v_work, 0), v_days_in_month);
        v_unpaid := 0;
        v_paid := v_work;
      end if;
    end if;

    v_gross := r.basic_salary + r.hra + r.special_allowance;
    v_leave := case when v_work > 0 and v_unpaid > 0 then round(v_gross / v_work * v_unpaid, 2) else 0 end;

    insert into payroll_items(
      school_id, employee_type, employee_id, salary_structure_id,
      payroll_month, working_days, paid_days, unpaid_days,
      gross_salary, leave_deduction, fixed_deductions, net_salary,
      status, updated_at
    )
    values(
      v_school, r.employee_type, r.employee_id, r.id,
      v_start, v_work, v_paid, v_unpaid,
      v_gross, v_leave, r.fixed_deductions,
      greatest(v_gross - v_leave - r.fixed_deductions, 0),
      'CALCULATED', now()
    )
    on conflict(school_id, employee_type, employee_id, payroll_month) do update set
      salary_structure_id = excluded.salary_structure_id,
      working_days = excluded.working_days,
      paid_days = excluded.paid_days,
      unpaid_days = excluded.unpaid_days,
      gross_salary = excluded.gross_salary,
      leave_deduction = excluded.leave_deduction,
      fixed_deductions = excluded.fixed_deductions,
      net_salary = excluded.net_salary,
      status = 'CALCULATED',
      updated_at = now()
    where payroll_items.status not in ('PAID', 'APPROVED');

    v_count := v_count + 1;
  end loop;

  -- Auto-heal existing unfinalized payroll items where paid_days = 0 wiped 100% of gross
  update payroll_items p
  set leave_deduction = 0,
      unpaid_days = 0,
      paid_days = p.working_days,
      net_salary = greatest(p.gross_salary - p.fixed_deductions, 0),
      updated_at = now()
  where p.school_id = v_school
    and p.payroll_month = v_start
    and p.status not in ('PAID', 'APPROVED')
    and p.paid_days = 0
    and p.leave_deduction >= p.gross_salary;

  return v_count;
end $$;

grant execute on function public.generate_monthly_payroll(date) to authenticated;

-- Immediately heal existing unfinalized rows in database that suffered from the 100% deduction bug
update public.payroll_items
set leave_deduction = 0,
    unpaid_days = 0,
    paid_days = greatest(working_days, 1),
    net_salary = greatest(gross_salary - fixed_deductions, 0),
    updated_at = now()
where status not in ('PAID', 'APPROVED')
  and paid_days = 0
  and leave_deduction >= gross_salary;
