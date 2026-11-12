-- a: an enum and a table
create type public.colour as enum ('red');
create table public.paint (id int primary key, c public.colour);
