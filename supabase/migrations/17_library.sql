create table public.library_books (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  title text not null,
  author text,
  status text not null default 'Available'
);
create index idx_library_books_school on public.library_books (school_id);

create table public.library_records (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools (id) on delete cascade,
  book_id uuid references public.library_books (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,
  issued_on date not null default current_date,
  returned_on date
);
create index idx_library_records_school on public.library_records (school_id);
