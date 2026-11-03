/**
 * Proyección local del estado de los cilindros y combinación de historiales.
 *
 * El servidor recalcula `cilindros.estado` con un trigger cuando el movimiento
 * LLEGA. Mientras está en la cola, la app tiene que ver el cilindro como si ya
 * hubiera llegado: si no, cargarlo y entregarlo en el mismo turno sin señal se
 * rechaza con "no está cargado en el vehículo".
 *
 * Funciones puras, sin React Native: las prueba `supabase/pruebas/prueba_sync_local.mjs`.
 *
 * Misma regla que `private.recalcular_estado_cilindro`: manda el movimiento más
 * reciente por `fecha_evento` (desempate por `uuid_local` descendente). El
 * servidor no expone la fecha de su último movimiento, solo `en_cliente_desde`;
 * con eso se respeta el caso que importa para el arriendo: si el servidor ya
 * tiene al envase en un cliente desde DESPUÉS del movimiento pendiente, gana el
 * servidor.
 */

import type { Cilindro, Movimiento, MovimientoDetallado, Uuid } from '../dominio/tipos';

function instante(iso: string): number {
  return new Date(iso).getTime();
}

/** true si `a` es más reciente que `b` con la regla del trigger. */
function masReciente(a: Movimiento, b: Movimiento): boolean {
  const d = instante(a.fechaEvento) - instante(b.fechaEvento);
  return d !== 0 ? d > 0 : a.uuidLocal > b.uuidLocal;
}

/** Último movimiento local de cada cilindro. */
export function ultimoPorCilindro(movimientos: Movimiento[]): Map<Uuid, Movimiento> {
  const ultimos = new Map<Uuid, Movimiento>();
  for (const m of movimientos) {
    const actual = ultimos.get(m.cilindroId);
    if (!actual || masReciente(m, actual)) ultimos.set(m.cilindroId, m);
  }
  return ultimos;
}

/** Lo mismo que hace el trigger con el último movimiento. */
export function efectoMovimiento(
  m: Movimiento,
): Pick<Cilindro, 'estado' | 'sucursalActualId' | 'enClienteDesde'> {
  if (m.tipo === 'entrega') {
    return { estado: 'en_cliente', sucursalActualId: m.sucursalId, enClienteDesde: m.fechaEvento };
  }
  // carga y retiro dejan el envase en el vehículo
  return { estado: 'en_camion', sucursalActualId: null, enClienteDesde: null };
}

/** Aplica sobre el dato del servidor (o de la caché) el último movimiento local. */
export function proyectarCilindro(cilindro: Cilindro, ultimo: Movimiento | undefined): Cilindro {
  if (!ultimo) return cilindro;
  if (
    cilindro.estado === 'en_cliente' &&
    cilindro.enClienteDesde !== null &&
    instante(cilindro.enClienteDesde) > instante(ultimo.fechaEvento)
  ) {
    return cilindro;
  }
  return { ...cilindro, ...efectoMovimiento(ultimo) };
}

/**
 * Une el historial del servidor con el local. Si un movimiento está en los dos
 * (ya llegó pero sigue en la cola esperando folio), gana el del servidor. Orden
 * por `fecha_evento` ascendente, desempate por `uuid_local`.
 */
export function combinarHistorial(
  servidor: MovimientoDetallado[],
  locales: MovimientoDetallado[],
): MovimientoDetallado[] {
  const porUuid = new Map<Uuid, MovimientoDetallado>();
  for (const m of locales) porUuid.set(m.uuidLocal, m);
  for (const m of servidor) porUuid.set(m.uuidLocal, m);
  return Array.from(porUuid.values()).sort(
    (a, b) =>
      instante(a.fechaEvento) - instante(b.fechaEvento) || a.uuidLocal.localeCompare(b.uuidLocal),
  );
}
