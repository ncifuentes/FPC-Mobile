-- Migración 01 · Sprint 3 · Tarjeta: Crear el esquema en Supabase
-- Crea los seis dominios enumerados y las siete tablas, en orden de claves foráneas.
-- Decisión no obvia: se habilita RLS acá mismo en las siete tablas. El proyecto tiene activado
-- el RLS automático, pero eso es configuración del proyecto y no viaja en las migraciones: una
-- base creada con `supabase db reset` no lo tendría.

create type rol_usuario      as enum ('tecnico', 'admin', 'gerente');
create type tipo_envase      as enum ('cilindro', 'paquete', 'termo');
create type unidad_capacidad as enum ('m3', 'kg');
create type estado_cilindro  as enum ('en_planta', 'en_camion', 'en_cliente');
create type tipo_movimiento  as enum ('carga', 'entrega', 'retiro');
create type origen_codigo    as enum ('escaner', 'manual');

-- ---------------------------------------------------------------- camiones
create table camiones (
  id                  uuid primary key default gen_random_uuid(),
  patente             text not null unique,
  descripcion         text,
  capacidad_cilindros smallint not null,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now(),
  constraint camiones_capacidad_positiva check (capacidad_cilindros > 0),
  constraint camiones_patente_normalizada
    check (patente = upper(patente) and position('-' in patente) = 0)
);

-- ---------------------------------------------------------------- clientes
create table clientes (
  id             uuid primary key default gen_random_uuid(),
  rut            text not null unique,
  codigo_kame    text unique,
  nombre         text not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint clientes_rut_normalizado check (rut ~ '^[0-9]{1,8}-[0-9K]$')
);

create schema if not exists private;

create or replace function private.tocar_actualizado_en()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;
revoke execute on function private.tocar_actualizado_en() from public, anon, authenticated;

create trigger clientes_toca_actualizado_en
before update on clientes
for each row execute function private.tocar_actualizado_en();

-- ---------------------------------------------------------------- sucursales
create table sucursales (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes (id) on delete restrict,
  nombre       text not null,
  direccion    text not null,
  comuna       text,
  ciudad       text,
  region       text,
  contacto     text,
  telefono     text,
  email        text,
  es_principal boolean not null default false,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  unique (cliente_id, nombre)
);

-- ---------------------------------------------------------------- productos
-- Catálogo de TIPOS DE ENVASE, no de gases. El código de arriendo con que la empresa factura
-- es 'REN' || envase_codigo: el envase A64 da el producto RENA64.
create table productos (
  id            uuid primary key default gen_random_uuid(),
  envase_codigo text not null unique,
  codigo        text not null unique,
  nombre        text not null,
  gas_habitual  text,
  tipo_envase   tipo_envase not null,
  capacidad     numeric(6,2),
  unidad        unidad_capacidad,
  activo        boolean not null default true,
  -- capacidad y unidad son nulables SOLO por el código PRO (propiedad del cliente), del que
  -- KAME no guarda capacidad porque el envase no es de FPC.
  constraint productos_capacidad_con_unidad check (
    (capacidad is null and unidad is null)
    or (capacidad is not null and unidad is not null and capacidad > 0)
  ),
  constraint productos_codigo_derivado check (codigo = 'REN' || envase_codigo)
);

-- ---------------------------------------------------------------- cilindros
create table cilindros (
  id                   uuid primary key default gen_random_uuid(),
  numero_serie         text not null unique,
  codigo_barras        text unique,
  codigo_generado      boolean not null default false,
  producto_id          uuid not null references productos (id) on delete restrict,
  es_propiedad_cliente boolean not null default false,
  deposito             text,
  estado               estado_cilindro not null default 'en_planta',
  sucursal_actual_id   uuid references sucursales (id) on delete restrict,
  en_cliente_desde     timestamptz,
  activo               boolean not null default true,
  creado_en            timestamptz not null default now(),
  -- Guarda de coherencia del estado derivado: si el trigger se equivoca, que falle fuerte.
  constraint cilindros_estado_coherente check (
    (estado  = 'en_cliente' and sucursal_actual_id is not null and en_cliente_desde is not null)
    or
    (estado <> 'en_cliente' and sucursal_actual_id is null     and en_cliente_desde is null)
  )
);

-- ---------------------------------------------------------------- usuarios
create table usuarios (
  id                uuid primary key references auth.users (id) on delete cascade,
  nombre            text not null,
  rol               rol_usuario not null default 'tecnico',
  camion_jornada_id uuid references camiones (id) on delete set null,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

-- ---------------------------------------------------------------- movimientos
create sequence folio_operacion_seq as bigint start 1;

create table movimientos (
  uuid_local           uuid primary key,
  tipo                 tipo_movimiento not null,
  cilindro_id          uuid not null references cilindros (id) on delete restrict,
  sucursal_id          uuid references sucursales (id) on delete restrict,
  usuario_id           uuid not null references usuarios (id) on delete restrict,
  camion_id            uuid not null references camiones (id) on delete restrict,
  fecha_evento         timestamptz not null,
  fecha_sync           timestamptz not null default now(),
  codigo_origen        origen_codigo not null,
  folio_operacion      bigint,
  documento_referencia text,
  constraint movimientos_sucursal_coherente check (
       (tipo  = 'carga' and sucursal_id is null)
    or (tipo <> 'carga' and sucursal_id is not null)
  )
);

-- fecha_sync la fija el servidor, nunca el dispositivo.
create or replace function private.sellar_fecha_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.fecha_sync := now();
  return new;
end;
$$;
revoke execute on function private.sellar_fecha_sync() from public, anon, authenticated;

create trigger movimientos_sella_fecha_sync
before insert on movimientos
for each row execute function private.sellar_fecha_sync();

alter table camiones    enable row level security;
alter table clientes    enable row level security;
alter table sucursales  enable row level security;
alter table productos   enable row level security;
alter table cilindros   enable row level security;
alter table usuarios    enable row level security;
alter table movimientos enable row level security;
