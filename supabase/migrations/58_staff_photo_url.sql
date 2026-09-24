-- Staff (Admin/Accounts/Library/Transport departments) never had a photo_url column, unlike
-- students and teachers — so Accountants/Librarians/Transport Managers/plain Staff had no way
-- to upload a profile photo. Purely additive; nothing existing reads or depends on its absence.
alter table public.staff add column if not exists photo_url text;
