-- ==========================================================================
-- My-Guion - Base de datos para sincronizar dispositivos (Supabase)
-- Pegar completo en Supabase > SQL Editor > New query > Run.
-- Antes de ejecutar, cambia los correos del final por los del equipo.
-- ==========================================================================

-- Equipo (workspace) y quienes pueden entrar
create table if not exists public.workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.members (
    workspace_id uuid not null references public.workspaces on delete cascade,
    email text not null,
    primary key (workspace_id, email)
);

-- Guiones, semanas y personas del equipo: un registro por cada uno
create table if not exists public.items (
    workspace_id uuid not null references public.workspaces on delete cascade,
    kind text not null check (kind in ('script', 'week', 'team')),
    id text not null,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by text,
    primary key (workspace_id, kind, id)
);

-- La hora de cada cambio la pone el servidor (no la del celular de cada uno)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
for each row execute function public.touch_updated_at();

-- Solo ven y cambian los datos las personas cuyo correo esta en members
create or replace function public.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.members
        where workspace_id = ws
          and lower(email) = lower(auth.jwt() ->> 'email')
    );
$$;

alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.items enable row level security;

drop policy if exists "ver su equipo" on public.workspaces;
create policy "ver su equipo" on public.workspaces for select using (public.is_member(id));

drop policy if exists "ver los miembros" on public.members;
create policy "ver los miembros" on public.members for select using (public.is_member(workspace_id));

drop policy if exists "leer" on public.items;
create policy "leer" on public.items for select using (public.is_member(workspace_id));
drop policy if exists "crear" on public.items;
create policy "crear" on public.items for insert with check (public.is_member(workspace_id));
drop policy if exists "editar" on public.items;
create policy "editar" on public.items for update using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists "borrar" on public.items;
create policy "borrar" on public.items for delete using (public.is_member(workspace_id));

-- Cambios en vivo: cuando alguien marca algo, los demas lo ven sin recargar
do $$
begin
    alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;

-- Equipo inicial: cambia estos correos por los reales (uno por persona)
with ws as (
    insert into public.workspaces (name) values ('Seamos Genios') returning id
)
insert into public.members (workspace_id, email)
select ws.id, lower(correo)
from ws, unnest(array[
    'correo-gemelo-1@ejemplo.com',
    'correo-gemelo-2@ejemplo.com'
]) as correo;

-- Para agregar a alguien despues (por ejemplo la colaboradora o el editor):
-- insert into public.members (workspace_id, email)
-- select id, 'correo@ejemplo.com' from public.workspaces where name = 'Seamos Genios';
