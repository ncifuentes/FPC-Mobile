import type { Conexion } from '../lib/tiempoReal';

/** Píldora que dice si la pantalla se está actualizando en vivo. */
export default function IndicadorConexion({ conexion }: { conexion: Conexion }) {
  const estilos: Record<Conexion, { texto: string; clase: string; punto: string }> = {
    en_vivo: { texto: 'En vivo', clase: 'bg-verde-100 text-verde-700', punto: 'bg-verde-500 animate-pulse' },
    conectando: { texto: 'Conectando…', clase: 'bg-gris-100 text-gris-700', punto: 'bg-gris-400' },
    sin_conexion: { texto: 'Sin actualización en vivo', clase: 'bg-alerta-fondo text-alerta', punto: 'bg-alerta' },
  };
  const e = estilos[conexion];
  return (
    <span
      role="status"
      title={conexion === 'en_vivo' ? 'Los movimientos nuevos aparecen sin recargar la página' : 'Recarga la página para ver lo último'}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${e.clase}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${e.punto}`} />
      {e.texto}
    </span>
  );
}
