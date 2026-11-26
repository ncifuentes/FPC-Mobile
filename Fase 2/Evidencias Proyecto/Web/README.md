# FPC Mobile — Plataforma web de administración

Panel web para el administrador y el gerente de FPC Servicios: tablero de la operación,
trazabilidad de cilindros, informe de arriendo y mantenedores. Corre sobre el mismo Supabase
que la app móvil (Sprint 6).

| Capa | Decisión |
|---|---|
| Framework | **Astro 7** con islas de **React 19** (sitio estático) |
| Estilos | **Tailwind 4**, con el tema importado de `App/src/theme/tokens.ts` |
| Datos y sesión | **supabase-js** desde el navegador; los permisos los imponen las políticas RLS |
| Lenguaje | TypeScript estricto (`astro check`) |

## Cómo levantarlo

Requiere Node.js 22.23.4 o superior (`node -v`).

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
│   ├── pages/          rutas: login, inicio, tablero, informe, mantenedores, cilindros/ y clientes/ (listado y ficha)
│   ├── layouts/        Base (html) y Panel (menú, barra superior y guardia de sesión)
│   ├── components/     islas de React y piezas de Astro (mantenedores/: una pestaña por archivo)
│   ├── lib/
│   │   ├── supabase.ts        cliente único de Supabase
│   │   ├── sesion.ts          inicio y cierre de sesión, perfil y rol
│   │   ├── formato.ts         fechas en hora de Chile y textos de la interfaz
│   │   ├── estilos.ts         colores por tipo de movimiento y por estado
│   │   ├── tablero.ts         datos y cálculos del tablero del día
│   │   ├── cilindros.ts       listado buscable y ficha de un cilindro
│   │   ├── tiempoReal.ts      suscripción Realtime a los cambios de movimientos
│   │   ├── clientes.ts        cartera de clientes y ficha de un cliente
│   │   ├── informe.ts         parámetros, totales y exportación del informe de arriendo
│   │   ├── mantenedores.ts    altas y ediciones; validación de RUT y patente; errores legibles
│   │   ├── correccion.ts      corrección de movimientos y lectura de su auditoría
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
- **Astro 7 (desde el 03-11-2026).** La web partió en Astro 6 para no obligar a actualizar
  Node, pero `npm audit` reportó vulnerabilidades (una crítica de Astro, una alta de `sharp` y
  una baja de `esbuild`) que no tienen arreglo en la rama 6. Se subió a Astro 7.3.8, que las
  cierra todas (`npm audit`: 0 vulnerabilidades). Exige Node 22.23.4 o superior. Con Astro 7 ya
  no hace falta fijar la versión de Vite: Astro, React y Tailwind usan la misma (Vite 8).
- **Tablero en tiempo real.** El tablero se suscribe por Realtime a los cambios de
  `movimientos`; cada inserción o corrección vuelve a leer el día desde `v_movimientos`
  (varios cambios seguidos se juntan en una sola lectura). El aviso «con retraso» marca lo que
  llegó al servidor 30 minutos o más después de ocurrir: lo que aún está en el teléfono sin
  señal no existe en la base y no se puede mostrar (ver bitácora 20-10).
- **Ficha por parámetro.** Como el sitio es estático, la ficha de un cilindro vive en
  `/cilindros/ficha?serie=<serie>` y no en `/cilindros/<serie>` (así no hay que generar una
  página por cada uno de los 2.178 envases). La serie se busca por `serie_normalizada`, así que
  da lo mismo escribirla con espacios o en minúsculas.
- **El informe no recalcula nada.** El informe de arriendo llama a la función
  `informe_envases_arrendados` de la base y solo muestra, suma y exporta su resultado: la
  regla de días (fin exclusivo, PRO excluido, corte como foto) vive en un único lugar. Se
  exporta como CSV con punto y coma y BOM, para que Excel en español lo abra directo, y se
  imprime o guarda en PDF con los estilos `print:` (sin menú ni filtros).

- **Gestión (mantenedores) sin borrado.** En el menú la sección se llama «Gestión»; en las
  historias de usuario y en el código (`/mantenedores`, `components/mantenedores/`) sigue
  llamándose mantenedores. Clientes, sucursales, cilindros, usuarios y camiones se crean y
  editan, pero no se eliminan: se dan de baja (`activo = false`), porque el historial de
  movimientos los referencia. Solo el admin ve los botones; el gerente consulta. El estado de un
  cilindro no se edita: lo calcula el trigger a partir de los movimientos. Al guardar un cilindro,
  `es_propiedad_cliente` queda igual a «es de categoría PRO», el criterio del arriendo.
- **Cuentas de acceso.** El navegador no puede crear cuentas de Supabase Auth (requiere la clave
  de servicio). La cuenta se crea en el panel de Supabase y el mantenedor de usuarios le asigna
  el perfil; para listar correos y cuentas sin perfil usa la función `cuentas_de_acceso()`
  (migración `20261103233054`), que solo responde a admin y gerente.

- **Corrección de movimientos.** Desde el historial de la ficha del cilindro, el admin corrige
  tipo, fecha y hora o sucursal de un movimiento. No se borran movimientos (no hay política de
  borrado). El trigger `movimientos_auditoria_trg` guarda el antes, el después, quién y cuándo, y
  la ficha lo muestra como «corregido» con el detalle de cada corrección; el gerente lo ve sin
  poder editar. La fecha se edita en hora de Chile y se guarda con su desfase.

## Avance

| Pantalla | Historias | Estado |
|---|---|---|
| Login, menú y roles | HU-11, HU-20 | Listo |
| Inicio: parque por estado y últimos movimientos | HU-15 (parcial) | Listo |
| Tablero del día y movimientos en vivo | HU-15, HU-19 | Listo |
| Listado y ficha del cilindro | HU-16 | Listo |
| Informe de arriendo del mes | HU-23 | Listo |
| Listado y ficha del cliente | HU-17 | Listo |
| Mantenedores de clientes, cilindros, usuarios y camiones | HU-12 a HU-14 | Listo |
| Corrección de movimientos con auditoría | HU-18 | Listo |
