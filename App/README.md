# FPC Mobile

Aplicación móvil para que **FPC Servicios** registre y siga sus cilindros de gas:
**carga** en el vehículo, **entrega** al cliente y **retiro** del envase vacío, con
historial de movimientos por cilindro.

Proyecto Capstone APT122 / PTY4614 — Duoc UC.
Equipo: Bastián Núñez (app móvil y UI) · Nicolás Castillo (base de datos y backend) ·
Nicolás Cifuentes (análisis, documentación y pruebas).

---

## Cómo levantarlo

```bash
npm install
npx expo start
```

Después, en el terminal de Expo: `a` para Android, `i` para iOS, o escanea el QR con
**Expo Go** en el teléfono.

> La cámara y SQLite **no funcionan en el navegador**. `npm run web` sirve para revisar
> maquetación, pero el escáner y la cola offline sólo corren en un dispositivo o emulador.

Credenciales de desarrollo: usuario `bnunez` (técnico) o `ncastillo` (admin), con
cualquier contraseña no vacía. La autenticación real es Supabase Auth y llega en el Sprint 5.

Verificación de tipos:

```bash
npm run typecheck
```

---

## Stack

| Capa | Decisión |
|---|---|
| App móvil | **Expo (SDK 57) + React Native + expo-router** |
| Lenguaje | TypeScript en modo `strict` |
| Escáner | `expo-camera` con formatos de **código de barras lineal** (code128, code39, EAN, UPC, ITF) |
| Almacén offline | `expo-sqlite` |
| Estilos | Tokens propios en `src/theme/tokens.ts`, consumidos por `StyleSheet` |
| Backend | **Supabase** (Postgres + Auth + RLS + API autogenerada) — todavía no conectado |
| Plataforma web de administración | Astro + islas de React, sobre el mismo backend (Sprint 6) |

### Por qué Expo y no Astro + Capacitor

Ambas opciones resuelven cámara y offline. Se eligió Expo por rendimiento y por
encaje con el resto del proyecto:

- **Rendimiento.** Capacitor ejecuta la app dentro de un WebView. Las dos pantallas
  más exigentes de FPC Mobile son la vista de cámara en vivo del escáner y las listas
  de registros que crecen durante la jornada; en WebView ambas dependen del puente
  JavaScript–nativo. React Native dibuja con componentes nativos y, en la nueva
  arquitectura de RN 0.86, sin puente asíncrono.
- **Astro no aporta en móvil.** Astro brilla generando HTML estático por página. Una app
  con navegación por pestañas, estado de sesión y cola offline es una SPA; con Astro
  igual habría que montar React dentro, y quedaría Astro sirviendo de envoltorio inútil.
- **Lo que se comparte con la web se comparte igual.** El tema visual vive en
  `src/theme/tokens.ts` sin ninguna dependencia de React Native: el proyecto Astro lo
  importa desde su `tailwind.config.js` y genera las clases de Tailwind con la misma
  paleta. Los tipos del dominio y los tipos generados por Supabase también se comparten.
  Lo único que no se reutiliza son las vistas, que igual serían distintas: el técnico en
  terreno y el administrador en escritorio no ven lo mismo.
- **Astro sigue siendo la elección para la plataforma web**, que es siempre conectada,
  sin cámara y sin modo offline.

> **Pendiente de gestión:** la Guía 1.5 entregada especifica **Flutter**. Hay que avisar
> al docente del cambio y actualizar ese documento, junto con el cambio de alcance por la
> arquitectura dual (app móvil + plataforma web).

### Por qué no NativeWind

La decisión de arquitectura era «Tailwind con tema compartido». NativeWind es Tailwind
para React Native, pero su versión estable (4.2.x, sobre `react-native-css-interop` 0.2.x)
está construida contra Reanimated 3, y el SDK 57 usa **Reanimated 4**. La versión que sí
lo soporta todavía está en *release candidate*. Para un proyecto evaluado no conviene
apoyarse en un RC, así que el tema compartido se implementó con tokens en TypeScript,
que es lo que realmente cruza entre los dos frontends. Si NativeWind 5 sale estable
durante el proyecto, migrar es mecánico: los tokens ya están centralizados.

---

## Estructura

```
app/                      Rutas (expo-router, navegación basada en archivos)
  _layout.tsx             Proveedores globales + Stack raíz
  index.tsx               Puerta de entrada: login o app según sesión
  login.tsx               Inicio de sesión
  escaner.tsx             Modal de escaneo + ingreso manual del código
  (tabs)/
    _layout.tsx           Pestañas Inicio / Historial / Perfil
    index.tsx             Inicio: accesos a las tres operaciones y estado de sync
    historial.tsx         Buscador de cilindros
    perfil.tsx            Usuario, vehículo de la jornada, estado de sincronización
  operacion/[tipo].tsx    Carga, entrega y retiro (una sola pantalla parametrizada)
  cilindro/[codigo].tsx   Ficha del cilindro con su línea de tiempo

src/
  theme/tokens.ts         Tema compartido con la plataforma web
  componentes/ui.tsx      Componentes reutilizables
  dominio/tipos.ts        Tipos del esquema (clientes, cilindros, movimientos, ...)
  dominio/repositorios.ts Contratos de acceso a datos
  datos/                  Implementación en memoria + datos de ejemplo
  sync/colaLocal.ts       Cola de pendientes en SQLite
  sync/sincronizador.tsx  Estado de sincronización y envío automático
  estado/sesion.tsx       Sesión y vehículo de la jornada
  estado/capturaCodigo.ts Puente entre pantalla de operación y escáner
```

---

## Decisiones de diseño que vienen del levantamiento

- **El ingreso manual del código es de primera clase, no un respaldo.** Es la falla número
  uno del software actual (KAME ONE): si el envase no trae código de barras, no se puede
  registrar. Acá el teclado está a un toque de la cámara y el movimiento queda marcado con
  `origenCodigo: 'manual'` para poder regularizar el parque después.
- **El escáner lee código de barras lineal**, no QR: el parque ya viene rotulado de fábrica.
- **Todo movimiento nace con `uuidLocal`.** Se envía por lotes con
  `on conflict (uuid_local) do nothing`, así reintentar nunca duplica. Se guardan
  `fechaEvento` (cuándo ocurrió en terreno) y `fechaSync` (cuándo llegó al servidor).
- **El contador de pendientes está siempre visible.** El técnico tiene que saber si su
  jornada llegó al servidor; hay reparto en la Sexta y Séptima Región.
- **Aviso de capacidad.** El camión lleva 30 cilindros y la camioneta 16: la app avisa
  cuando la carga del día alcanza el límite del vehículo.
- **Los permisos no se resuelven acá.** Se resuelven una sola vez con Row Level Security
  en Postgres (`tecnico` / `admin` / `gerente`).

---

## Estado actual y qué falta

Hecho:

- [x] Navegación completa y las ocho pantallas de los mockups
- [x] Escáner de código de barras lineal con ingreso manual
- [x] Validaciones de negocio por tipo de movimiento
- [x] Cola offline en SQLite con detección de conexión y reenvío automático
- [x] Capa de datos con interfaces y una implementación en memoria

Pendiente:

- [ ] **Conectar Supabase.** Escribir `src/datos/repositorioSupabase.ts` cumpliendo la
      interfaz `Repositorios` y cambiar una línea en `src/datos/index.ts`.
- [ ] **Envío real del lote** en `src/sync/sincronizador.tsx` (`enviarLote`), donde ya está
      escrito el `upsert` que corresponde.
- [ ] **Migrar el maestro de clientes** desde el export de KAME ONE. Bloqueado: el export
      trae 434 fichas activas con rol de cliente y el jefe declara **120 activos**; hay que
      pedirle la marca de cuáles son. `region` y `rubro` no existen en el origen y hay que
      levantarlos.
- [ ] Definir si un **paquete de 90 m³** se mueve y se cobra como unidad o cilindro por cilindro.
- [ ] Prueba de aceptación offline: modo avión → una carga y dos entregas (una con código
      escrito a mano) → restablecer conexión → verificar que en el panel web aparecen
      **tres** movimientos y no seis, y que el ingreso manual quedó marcado.

---

## Advertencia sobre datos

`src/datos/datosEjemplo.ts` contiene datos **inventados**. El export
`KAME ONE Fichas.xlsx` tiene datos personales reales (RUT, teléfono, e-mail) y no debe
copiarse a este repositorio ni a ningún entregable.
