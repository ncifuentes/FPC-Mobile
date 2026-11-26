import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSync } from '../sync/sincronizador';
import { colores, espacios, radios } from '../theme/tokens';

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/**
 * Franja de estado de envío: movimientos pendientes, rechazados y sin conexión.
 * Con algo pendiente y señal, tocarla fuerza un intento de envío.
 */
export function EstadoEnvio() {
  const { pendientes, conError, enLinea, sincronizando, sincronizar } = useSync();

  const partes: string[] = [];
  if (pendientes > 0) partes.push(plural(pendientes, 'pendiente de envío', 'pendientes de envío'));
  if (conError > 0) partes.push(plural(conError, 'rechazado', 'rechazados'));
  if (!enLinea) partes.push('Sin conexión');
  if (sincronizando) partes.push('Enviando…');
  const texto = partes.length > 0 ? partes.join(' · ') : 'Todo enviado';

  const tono = conError > 0 || !enLinea ? 'alerta' : pendientes > 0 ? 'azul' : 'verde';
  const paleta = {
    alerta: { fondo: colores.alertaFondo, texto: colores.alerta },
    azul: { fondo: colores.azul[50], texto: colores.azul[700] },
    verde: { fondo: colores.verde[50], texto: colores.verde[700] },
  }[tono];
  const icono: React.ComponentProps<typeof Ionicons>['name'] = !enLinea
    ? 'cloud-offline-outline'
    : conError > 0
      ? 'alert-circle-outline'
      : pendientes > 0
        ? 'cloud-upload-outline'
        : 'cloud-done-outline';

  const puedeEnviar = enLinea && pendientes > 0 && !sincronizando;

  return (
    <Pressable
      accessibilityRole={puedeEnviar ? 'button' : undefined}
      accessibilityLabel={texto}
      onPress={puedeEnviar ? () => void sincronizar() : undefined}
      style={({ pressed }) => [
        estilos.franja,
        { backgroundColor: paleta.fondo },
        pressed && puedeEnviar && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={icono} size={18} color={paleta.texto} />
      <Text style={[estilos.texto, { color: paleta.texto }]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  franja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacios.sm,
    paddingVertical: espacios.sm,
    paddingHorizontal: espacios.md,
    borderRadius: radios.md,
  },
  texto: { flex: 1, fontSize: 13, fontWeight: '600' },
});
