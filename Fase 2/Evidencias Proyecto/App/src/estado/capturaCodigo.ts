/**
 * Puente entre una pantalla de operación y la pantalla de escaneo.
 *
 * La pantalla de operación pide un código y queda esperando; el escáner (o el
 * ingreso manual) lo entrega y se cierra. Así hay un solo lugar donde se decide
 * qué hacer con el código, y la pantalla de escaneo no sabe nada del negocio.
 */

import type { OrigenCodigo } from '../dominio/tipos';

export interface CodigoCapturado {
  codigo: string;
  origen: OrigenCodigo;
}

let resolver: ((valor: CodigoCapturado | null) => void) | null = null;

/** La pantalla de operación llama esto ANTES de navegar al escáner. */
export function esperarCodigo(): Promise<CodigoCapturado | null> {
  cancelarCaptura();
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

/** El escáner o el ingreso manual entregan el código capturado. */
export function entregarCodigo(valor: CodigoCapturado): void {
  const r = resolver;
  resolver = null;
  r?.(valor);
}

/** El usuario cerró el escáner sin capturar nada. */
export function cancelarCaptura(): void {
  const r = resolver;
  resolver = null;
  r?.(null);
}
