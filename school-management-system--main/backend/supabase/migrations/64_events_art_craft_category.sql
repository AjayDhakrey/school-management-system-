-- Allow 'Art & Craft' in events.category check constraint
alter table public.events drop constraint if exists events_category_check;
alter table public.events add constraint events_category_check check (
  category in ('Sports', 'Academic', 'Meeting', 'Holiday', 'Cultural', 'Art & Craft')
);
