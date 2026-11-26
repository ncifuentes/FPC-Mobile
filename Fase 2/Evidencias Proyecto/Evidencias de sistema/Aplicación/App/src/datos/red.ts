/**
 * Clasificación de errores de Supabase y último estado de red conocido.
 *
 * Sin dependencias de React Native: lo usan los repositorios, el sincronizador
 * y las pruebas en Node (`supabase/pruebas/prueba_sync_local.mjs`).
 *
 * La distinción que importa es una sola: ¿el servidor contestó que NO, o no
 * contestó? Lo primero (constraint, RLS, dato inválido) no se arregla
 * reintentando; lo segundo sí.
 */

/** Forma mínima de un error de PostgREST / supabase-js. */
export interface ErrorServidor {
  message: string;
  code?: string | null;
  /** postgrest-js devuelve 0 cuando el `fetch` ni siquiera obtuvo respuesta. */
  status?: number | null;
}

/** No hubo respuesta del servidor: sin señal, DNS, corte a mitad, timeout. */
export function esErrorDeRed(error: ErrorServidor | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 0) return true;
  const m = (error.message ?? '').toLowerCase();
  return (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('failed to connect') ||
    m.includes('timeout')
  );
}

/**
 * El servidor rechazó el dato y reintentar daría lo mismo. Solo cuentan los
 * SQLSTATE de Postgres que dependen del contenido de la fila:
 *  - clase 22 (dato inválido: uuid mal formado, enum desconocido),
 *  - clase 23 (integridad: check `movimientos_sucursal_coherente`, FK, not null),
 *  - 42501 (RLS: `usuario_id` que no es el de la sesión),
 *  - P0001 (`raise exception` de `asignar_folio_despacho`).
 * Todo lo demás —401 por token vencido, 5xx, errores PGRST de esquema— se
 * trata como transitorio: si un despliegue rompe la API no queremos marcar
 * como rechazada la jornada entera.
 */
export function esRechazoDefinitivo(error: ErrorServidor | null | undefined): boolean {
  if (!error || esErrorDeRed(error)) return false;
  const code = error.code ?? '';
  return /^2[23]/.test(code) || code === '42501' || code === 'P0001';
}

let enLinea = true;

/** Lo mantiene `ProveedorSync` con lo que informa `expo-network`. */
export function fijarEnLinea(valor: boolean): void {
  enLinea = valor;
}

/** Último estado conocido. Sin red, los repositorios van directo al respaldo local. */
export function hayRed(): boolean {
  return enLinea;
}
