# FPC Mobile

Sistema para que **FPC Servicios** registre y siga sus cilindros de gas: **carga** en el
vehículo, **entrega** al cliente y **retiro** del envase vacío, con historial por cilindro e
informe de arriendo.

Proyecto Capstone APT122 / PTY4614 — Duoc UC.
Equipo: Bastián Núñez (app móvil y UI) · Nicolás Castillo (base de datos y backend) ·
Nicolás Cifuentes (análisis, documentación y pruebas).

---

## Partes del repositorio

| Carpeta | Qué es | Detalle |
|---|---|---|
| `App/` | App móvil del técnico en terreno: Expo + React Native, funciona sin señal | [App/README.md](App/README.md) |
| `Web/` | Plataforma web del administrador y el gerente: Astro + React | [Web/README.md](Web/README.md) |
| `supabase/` | Esquema, RLS, funciones, Edge Functions y pruebas del backend | [supabase/PRUEBAS_ESQUEMA.md](supabase/PRUEBAS_ESQUEMA.md) |
| `Fase 1/`, `Fase 2/`, `Fase 3/` | Evidencias del curso (informes, backlog, sprints, arquitectura) | — |

Las tres partes de software usan el mismo proyecto Supabase. Los permisos viven en la base
(Row Level Security por rol: `tecnico`, `admin`, `gerente`), no en la app ni en la web.

---

## Base de datos

Las migraciones están en `supabase/migrations/` y se aplican con la CLI de Supabase:

```bash
npx supabase migration list --linked   # comparar local con el proyecto
npx supabase db push --linked          # aplicar las pendientes
```

Cada migración se prueba antes dentro de una transacción que se revierte; los resultados
quedan en `supabase/PRUEBAS_ESQUEMA.md`.

---

## Estado

- **App móvil:** login, carga, entrega y retiro con escáner o código manual, operación sin
  señal y sincronización automática con folio de despacho.
- **Web:** tablero del día en tiempo real, fichas de cilindro y cliente, e informe de
  arriendo del mes. Faltan los mantenedores y la corrección de movimientos.
- **En pausa:** comprobante de visita por correo (rama `feat/comprobantes`), a la espera de
  que FPC defina el dominio remitente.

El detalle de lo hecho y lo pendiente está en el README de cada parte.

---

## Advertencia sobre datos

El export `KAME ONE Fichas.xlsx` del sistema actual de FPC tiene datos personales reales
(RUT, teléfono, e-mail) y no debe copiarse a este repositorio ni a ningún entregable. Los
archivos `.env` tampoco se suben.
