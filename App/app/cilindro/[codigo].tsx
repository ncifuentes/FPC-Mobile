import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Etiqueta, Nota, Seccion, Tarjeta, Vacio } from '../../src/componentes/ui';
import { repos } from '../../src/datos';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_MOVIMIENTO,
  formatearCapacidad,
  type Cilindro,
  type Cliente,
  type MovimientoDetallado,
} from '../../src/dominio/tipos';
import { colores, espacios, radios } from '../../src/theme/tokens';

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CL')} · ${d.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** Días completos que el envase lleva en poder del cliente. Base del arriendo. */
function diasEnCliente(desde: string): number {
  const ms = Date.now() - new Date(desde).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export default function DetalleCilindro() {
  const { codigo } = useLocalSearchParams<{ codigo: string }>();
  const [cilindro, setCilindro] = useState<Cilindro | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoDetallado[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const c = await repos.cilindros.obtenerPorCodigo(String(codigo ?? ''));
      if (!vivo) return;
      setCilindro(c);
      if (c) {
        const [movs, cli] = await Promise.all([
          repos.movimientos.listarPorCilindro(c.id),
          c.clienteActualId ? repos.clientes.obtener(c.clienteActualId) : Promise.resolve(null),
        ]);
        if (!vivo) return;
        setMovimientos(movs);
        setCliente(cli);
      }
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [codigo]);

  if (cargando) {
    return (
      <>
        <Stack.Screen options={{ title: 'Detalle del cilindro' }} />
        <View style={estilos.centro}>
          <Text style={estilos.tenue}>Cargando…</Text>
        </View>
      </>
    );
  }

  if (!cilindro) {
    return (
      <>
        <Stack.Screen options={{ title: 'Detalle del cilindro' }} />
        <View style={estilos.contenido}>
          <Nota tono="alerta" texto={`No se encontró el cilindro ${codigo}.`} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Detalle del cilindro' }} />
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Tarjeta>
          <View style={estilos.encabezado}>
            <View style={estilos.codigoFila}>
              <Ionicons name="flask-outline" size={24} color={colores.azul[600]} />
              <Text style={estilos.codigo}>{cilindro.codigo}</Text>
            </View>
            <Etiqueta
              texto={ETIQUETA_ESTADO[cilindro.estado]}
              tono={cilindro.estado === 'en_cliente' ? 'azul' : 'verde'}
            />
          </View>

          <View style={estilos.datos}>
            <Dato etiqueta="Tipo de gas" valor={cilindro.tipoGas} />
            <Dato etiqueta="Capacidad" valor={formatearCapacidad(cilindro)} />
            <Dato
              etiqueta="Tipo de envase"
              valor={
                cilindro.tipoEnvase === 'cilindro'
                  ? 'Cilindro'
                  : cilindro.tipoEnvase === 'paquete'
                    ? 'Paquete'
                    : 'Termo'
              }
            />
            <Dato
              etiqueta="Código de fábrica"
              valor={cilindro.sinCodigoFabrica ? 'No (ingreso manual)' : 'Sí'}
            />
            {cliente ? <Dato etiqueta="Cliente actual" valor={cliente.nombre} /> : null}
            {cilindro.enClienteDesde ? (
              <Dato
                etiqueta="En cliente desde"
                valor={`${fechaHora(cilindro.enClienteDesde)} (${diasEnCliente(
                  cilindro.enClienteDesde,
                )} días)`}
              />
            ) : null}
          </View>
        </Tarjeta>

        {cilindro.enClienteDesde ? (
          <Nota
            texto={`El arriendo se cobra por día calendario desde la entrega hasta el retiro. Este envase lleva ${diasEnCliente(
              cilindro.enClienteDesde,
            )} día(s) devengando.`}
          />
        ) : null}

        <View>
          <Seccion texto="Movimientos" />
          <Tarjeta>
            {movimientos.length === 0 ? (
              <Vacio texto="Este cilindro todavía no tiene movimientos registrados en la app." />
            ) : (
              movimientos
                .slice()
                .reverse()
                .map((m, indice) => (
                  <View key={m.uuidLocal} style={estilos.linea}>
                    <View style={estilos.lineaIzquierda}>
                      <View
                        style={[
                          estilos.punto,
                          {
                            backgroundColor:
                              m.tipo === 'entrega'
                                ? colores.azul[600]
                                : m.tipo === 'retiro'
                                  ? colores.verde[500]
                                  : colores.gris[400],
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            m.tipo === 'entrega'
                              ? 'cube-outline'
                              : m.tipo === 'retiro'
                                ? 'refresh-outline'
                                : 'bus-outline'
                          }
                          size={14}
                          color={colores.gris[0]}
                        />
                      </View>
                      {indice < movimientos.length - 1 ? <View style={estilos.hilo} /> : null}
                    </View>

                    <View style={{ flex: 1, paddingBottom: espacios.lg }}>
                      <View style={estilos.encabezadoLinea}>
                        <Text style={estilos.lineaTitulo}>{ETIQUETA_MOVIMIENTO[m.tipo]}</Text>
                        {m.origenCodigo === 'manual' ? (
                          <Etiqueta texto="Manual" tono="alerta" />
                        ) : null}
                        {m.fechaSync === null ? (
                          <Etiqueta texto="Sin enviar" tono="neutro" />
                        ) : null}
                      </View>
                      <Text style={estilos.tenue}>{fechaHora(m.fechaEvento)}</Text>
                      {m.nombreCliente ? (
                        <Text style={estilos.tenue}>Cliente: {m.nombreCliente}</Text>
                      ) : null}
                      <Text style={estilos.tenue}>Registró: {m.nombreUsuario}</Text>
                    </View>
                  </View>
                ))
            )}
          </Tarjeta>
        </View>

        <Nota texto="Ver en mapa es una funcionalidad opcional: la geolocalización no está comprometida en el alcance del proyecto." />
      </ScrollView>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.tenue}>{etiqueta}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacios.lg, gap: espacios.lg, paddingBottom: espacios.xxl },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacios.md,
  },
  codigoFila: { flexDirection: 'row', alignItems: 'center', gap: espacios.md, flexShrink: 1 },
  codigo: { fontSize: 20, fontWeight: '700', color: colores.gris[900] },
  datos: { marginTop: espacios.lg, gap: espacios.md },
  dato: { flexDirection: 'row', justifyContent: 'space-between', gap: espacios.lg },
  datoValor: {
    fontSize: 13,
    fontWeight: '600',
    color: colores.gris[900],
    flexShrink: 1,
    textAlign: 'right',
  },
  tenue: { fontSize: 12, color: colores.gris[500] },
  linea: { flexDirection: 'row', gap: espacios.md },
  lineaIzquierda: { alignItems: 'center', width: 28 },
  punto: {
    width: 28,
    height: 28,
    borderRadius: radios.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hilo: { flex: 1, width: 2, backgroundColor: colores.gris[200], marginVertical: 4 },
  encabezadoLinea: { flexDirection: 'row', alignItems: 'center', gap: espacios.sm },
  lineaTitulo: { fontSize: 14, fontWeight: '700', color: colores.gris[900] },
});
