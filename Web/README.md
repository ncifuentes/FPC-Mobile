# FPC Mobile — Plataforma web de administración

Panel web para el administrador y el gerente de FPC Servicios: tablero de la operación,
trazabilidad de cilindros, informe de arriendo y mantenedores. Corre sobre el mismo Supabase
que la app móvil (Sprint 6).

| Capa | Decisión |
|---|---|
| Framework | **Astro 6** con islas de **React 19** (sitio estático) |
| Estilos | **Tailwind 4**, con el tema importado de `App/src/theme/tokens.ts` |
| Datos y sesión | **supabase-js** desde el navegador; los permisos los imponen las políticas RLS |
| Lenguaje | TypeScript estricto (`astro check`) |

## Cómo levantarlo

Requiere Node.js 22.12 o superior.

```bash
cd web
npm install
cp .env.example .env      # en Windows: copy .env.example .env
npm run dev
```

Abre <http://localhost:4321> e inicia sesión con una cuenta de rol **admin** o **gerente**.
Las cuentas de técnico se rechazan: el técnico trabaja en la app móvil.

Otros comandos:

```bash
npm run check    # verificación de tipos
npm run build    # verificación + sitio estático en Web/dist
npm run preview  # sirve Web/dist para revisarlo
```

## Cómo está organizado

```
Web/
├── src/
│   ├── pages/          rutas: login, inicio, tablero, cilindros/ (listado y ficha)
│   ├── layouts/        Base (html) y Panel (menú, barra superior y guardia de sesión)
│   ├── components/     islas de React y piezas de Astro
│   ├── lib/
│   │   ├── supabase.ts        cliente único de Supabase
│   │   ├── sesion.ts          inicio y cierre de sesión, perfil y rol
│   │   ├── formato.ts         fechas en hora de Chile y textos de la interfaz
│   │   ├── estilos.ts         colores por tipo de movimiento y por estado
│   │   ├── tablero.ts         datos y cálculos del tablero del día
│   │   ├── cilindros.ts       listado buscable y ficha de un cilindro
│   │   ├── tiempoReal.ts      suscripción Realtime a los cambios de movimientos
│   │   └── database.types.ts  tipos generados desde el esquema
│   └── styles/global.css
└── tailwind.config.ts  toma la paleta y los radios de App/src/theme/tokens.ts
```

## Decisiones

- **Sitio estático, sesión en el navegador.** La web no tiene servidor propio: todas las
  páginas se generan en el build y los datos se leen desde el navegador con la sesión del
  usuario. La seguridad no depende de la web sino de la RLS: un gerente no puede modificar
  datos aunque manipule la interfaz, porque la base lo rechaza.
- **Guardia de sesión.** Las páginas del panel quedan ocultas hasta confirmar que hay una
  sesión de admin o gerente; si no la hay, redirigen al login.
- **Hora de Chile.** Las fechas se muestran y se agrupan en `America/Santiago`, sin importar
  la zona horaria del computador.
- **Astro 6 y no 7.** Astro 6 corre desde Node 22.12, así que funciona en los computadores de
  todo el equipo sin actualizar Node; Astro 7 exige Node 22.23 o superior y no trae nada que
  este panel necesite. Se evalúa subir de versión después de la entrega.
- **Tablero en tiempo real.** El tablero se suscribe por Realtime a los cambios de
  `movimientos`; cada inserción o corrección vuelve a leer el día desde `v_movimientos`
  (varios cambios seguidos se juntan en una sola lectura). El aviso «con retraso» marca lo que
  llegó al servidor 30 minutos o más después de ocurrir: lo que aún está en el teléfono sin
  señal no existe en la base y no se puede mostrar (ver bitácora 20-10).
- **Ficha por parámetro.** Como el sitio es estático, la ficha de un cilindro vive en
  `/cilindros/ficha?serie=<serie>` y no en `/cilindros/<serie>` (así no hay que generar una
  página por cada uno de los 2.178 envases). La serie se busca por `serie_normalizada`, así que
  da lo mismo escribirla con espacios o en minúsculas.
- **Vite fijado en 7.3.7** (`overrides` en `package.json`): Astro 6 usa Vite 7 y el plugin de
  Tailwind trae Vite 8 por defecto; sin el override, `astro check` falla por tipos
  incompatibles entre ambas versiones.

## Avance

| Pantalla | Historias | Estado |
|---|---|---|
| Login, menú y roles | HU-11, HU-20 | Listo |
| Inicio: parque por estado y últimos movimientos | HU-15 (parcial) | Listo |
| Tablero del día y movimientos en vivo | HU-15, HU-19 | Listo |
| Listado y ficha del cilindro | HU-16 | Listo |
| Informe de arriendo del mes | HU-23 | Pendiente |
| Ficha del cliente | HU-17 | Pendiente |
| Mantenedores de clientes, cilindros y usuarios | HU-12 a HU-14 | Pendiente |
| Corrección de movimientos con auditoría | HU-18 | Pendiente |
