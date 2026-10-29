-- Remove the SUPER_ADMIN cross-school people search.

drop function if exists public.platform_search_people(text, integer);
