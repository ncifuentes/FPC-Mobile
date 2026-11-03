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
cp .env.example .env      # en Windows: copy .env.example .env
npx expo start
```

`.env` lleva la URL y la clave publicable del proyecto Supabase (`EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_KEY`). No se sube al repositorio.

Después, en el terminal de Expo: `a` para Android, `i` para iOS, o escanea el QR con
**Expo Go** en el teléfono.

> La cámara y SQLite **no funcionan en el navegador**. `npm run web` sirve para revisar
> maquetación, pero el escáner y la cola offline sólo corren en un dispositivo o emulador.

El inicio de sesión es con **Supabase Auth** (correo y contraseña). Entran las cuentas
con rol `tecnico` o `admin` creadas en el proyecto; las cuentas de prueba no se anotan acá.

Verificación de tipos:

```bash
npm run typecheck
```

---

## Stack

| Capa | Decisión |
|---|---|
| App móvil | **Expo (SDK 58) + React Native 0.88 + expo-router** |
| Lenguaje | TypeScript en modo `strict` |
| Escáner | `expo-camera` con formatos de **código de barras lineal** (code128, code39, EAN, UPC, ITF) |
| Almacén offline | `expo-sqlite` (cola de movimientos) y AsyncStorage (respaldo del catálogo y la sesión) |
| Estilos | Tokens propios en `src/theme/tokens.ts`, consumidos por `StyleSheet` |
| Backend | **Supabase** (Postgres + Auth + RLS + RPC), con `supabase-js` v2 |
| Plataforma web de administración | Astro + islas de React, sobre el mismo backend (ver `Web/README.md`) |

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
está construida contra Reanimated 3, y Expo usa **Reanimated 4** desde el SDK 57. La versión que sí
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
    index.tsx             Inicio: accesos a las tres operaciones y franja de envío
    historial.tsx         Buscador de cilindros
    perfil.tsx            Usuario y vehículo de la jornada
  operacion/[tipo].tsx    Carga, entrega y retiro (una sola pantalla parametrizada)
  cilindro/[codigo].tsx   Ficha del cilindro con su línea de tiempo

src/
  theme/tokens.ts         Tema compartido con la plataforma web
  componentes/ui.tsx      Componentes reutilizables
  componentes/EstadoEnvio.tsx  Franja de pendientes, errores y conexión
  dominio/tipos.ts        Tipos del esquema (clientes, cilindros, movimientos, ...)
  dominio/repositorios.ts Contratos de acceso a datos
  datos/index.ts          Cableado: qué implementación usa cada repositorio
  datos/repositorioSupabase*.ts  Auth, camiones y catálogo desde Supabase
  datos/cacheCatalogo.ts  Respaldo del catálogo para operar sin señal
  datos/repositorioProyectado.ts Estado de los cilindros con lo que aún no se envía
  datos/red.ts            Clasificación de errores (de red o rechazo definitivo)
  sync/colaLocal.ts       Cola de pendientes en SQLite
  sync/procesarCola.ts    Ciclo de envío: movimientos y folio (sin React, probado en Node)
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
- [x] Validaciones de negocio por tipo de movimiento y aviso de capacidad del vehículo
- [x] Inicio de sesión con Supabase Auth (HU-01)
- [x] Clientes, sucursales, cilindros y camiones desde Supabase, con respaldo local para
      operar sin señal (HU-03, HU-09)
- [x] Cola offline en SQLite: los movimientos se envían solos al volver la señal, con
      `upsert` idempotente y folio de despacho asignado por el servidor (HU-06 a HU-08)
- [x] Visibilidad restringida con RLS: el técnico solo ve y registra sus propios
      movimientos (HU-10 la planteó por camión; quedó por usuario)

Pruebas (desde la raíz del repositorio):

```bash
node supabase/pruebas/prueba_sync_local.mjs        # ciclo de envío, sin red
node supabase/pruebas/prueba_sync_movimientos.mjs  # contra Supabase, requiere .env y link
```

En pausa (rama `feat/comprobantes`):

- [ ] **Comprobante de visita por correo.** Al finalizar la visita se confirma o se pide el
      correo del cliente, y el comprobante sale por correo con Resend. La base y la función
      `enviar-comprobante` ya están en producción; falta que FPC defina el dominio remitente.
- [ ] **Un folio por visita.** Hoy, con señal, cada cilindro de una misma visita recibe un
      folio distinto. El arreglo está en la misma rama.

Pendiente:

- [ ] **Estado de sincronización en Perfil:** conexión, última sincronización y envío manual.
- [ ] **Detalle de movimientos rechazados.** La franja de Inicio los cuenta, pero el técnico
      no puede ver el motivo ni hacer nada con ellos.
- [ ] Definir si un **paquete de 90 m³** se mueve y se cobra como unidad o cilindro por cilindro.
- [ ] Prueba de aceptación offline en un teléfono (PB-28): modo avión → una carga y dos
      entregas (una con código escrito a mano) → restablecer conexión → verificar que en el
      panel web aparecen **tres** movimientos y no seis, y que el ingreso manual quedó marcado.

---

## Advertencia sobre datos

`src/datos/datosEjemplo.ts` contiene datos **inventados** de la etapa previa a Supabase; la
app ya no lo usa. El export
`KAME ONE Fichas.xlsx` tiene datos personales reales (RUT, teléfono, e-mail) y no debe
copiarse a este repositorio ni a ningún entregable.
