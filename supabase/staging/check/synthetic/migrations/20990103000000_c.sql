-- uses the new value in a SQL function body (checked when it's created)
create function public.blue() returns public.colour language sql as $$ select 'blue'::public.colour $$;
