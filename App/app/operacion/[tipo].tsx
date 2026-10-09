import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

import { Boton, Campo, Contador, Etiqueta, Fila, Nota, Seccion, Tarjeta, Vacio } from '../../src/componentes/ui';
import { repos } from '../../src/datos';
import { esperarCodigo } from '../../src/estado/capturaCodigo';
import { useSesion } from '../../src/estado/sesion';
import {
  ETIQUETA_MOVIMIENTO,
  formatearCapacidad,
  type Cilindro,
  type Cliente,
  type Movimiento,
  type MovimientoDetallado,
  type TipoMovimiento,
} from '../../src/dominio/tipos';
import { colores, espacios, radios } from '../../src/theme/tokens';

const TIPOS_VALIDOS: TipoMovimiento[] = ['carga', 'entrega', 'retiro'];

const TITULO: Record<TipoMovimiento, string> = {
  carga: 'Carga de camión',
  entrega: 'Entrega',
  retiro: 'Retiro',
};

const LEYENDA_CONTADOR: Record<TipoMovimiento, string> = {
  carga: 'cilindros cargados',
  entrega: 'cilindros entregados',
  retiro: 'cilindros retirados',
};

const NOTA: Record<TipoMovimiento, string> = {
  carga: 'Puedes realizar más cargas en el mismo día. Los registros anteriores se guardarán.',
  entrega: 'Los cilindros entregados quedan registrados con la fecha, el cliente y el usuario.',
  retiro: 'Los cilindros retirados quedan registrados con la fecha, el cliente y el usuario.',
};

const CONFIRMACION: Record<TipoMovimiento, { titulo: string; texto: string }> = {
  carga: {
    titulo: 'Cilindro registrado',
    texto: 'El cilindro se agregó correctamente a la carga del camión.',
  },
  entrega: {
    titulo: 'Entrega registrada',
    texto: 'El cilindro fue entregado correctamente al cliente.',
  },
  retiro: {
    titulo: 'Retiro registrado',
    texto: 'El cilindro fue retirado correctamente desde el cliente.',
  },
};

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CL')} · ${hora(iso)}`;
}

export default function PantallaOperacion() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tipo?: string }>();
  const tipo = (TIPOS_VALIDOS.includes(params.tipo as TipoMovimiento)
    ? params.tipo
    : 'carga') as TipoMovimiento;

  const { usuario, camion } = useSesion();

  const necesitaCliente = tipo !== 'carga';

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [listaAbierta, setListaAbierta] = useState(false);

  const [registros, setRegistros] = useState<MovimientoDetallado[]>([]);
  const [ultimo, setUltimo] = useState<{ movimiento: MovimientoDetallado; cilindro: Cilindro } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const refrescar = useCallback(async () => {
    if (!camion) return;
    const delDia = await repos.movimientos.listarDelDia(camion.id, new Date());
    setRegistros(delDia.filter((m) => m.tipo === tipo));
  }, [camion, tipo]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  useEffect(() => {
    if (!necesitaCliente) return;
    let vivo = true;
    void repos.clientes.buscar(busqueda).then((r) => {
      if (vivo) setResultados(r);
    });
    return () => {
      vivo = false;
    };
  }, [busqueda, necesitaCliente]);

  const cargadosHoy = useMemo(
    () => (tipo === 'carga' ? registros.length : 0),
    [tipo, registros.length],
  );

  const sobreCapacidad = Boolean(
    camion && tipo === 'carga' && cargadosHoy >= camion.capacidadCilindros,
  );

  /**
   * Valida el movimiento contra el estado actual del cilindro.
   * Devuelve null si es válido, o el mensaje de error para el técnico.
   */
  function validar(cilindro: Cilindro): string | null {
    if (tipo === 'carga') {
      if (cilindro.estado === 'en_cliente') {
        return `${cilindro.codigo} figura en poder de un cliente. Primero registra el retiro.`;
      }
      if (registros.some((m) => m.codigoCilindro === cilindro.codigo)) {
        return `${cilindro.codigo} ya está en la carga de hoy.`;
      }
      return null;
    }

    if (tipo === 'entrega') {
      if (cilindro.estado !== 'en_camion') {
        return `${cilindro.codigo} no está cargado en el vehículo. Regístralo primero en "Carga de camión".`;
      }
      return null;
    }

    // retiro
    if (cilindro.estado !== 'en_cliente') {
      return `${cilindro.codigo} no figura en poder de ningún cliente.`;
    }
    if (cliente && cilindro.clienteActualId !== cliente.id) {
      return `${cilindro.codigo} figura en poder de otro cliente. Verifica antes de retirarlo.`;
    }
    return null;
  }

  async function capturarYRegistrar() {
    setError(null);

    if (necesitaCliente && !cliente) {
      setError('Selecciona primero el cliente.');
      return;
    }
    if (!usuario || !camion) {
      setError('No hay sesión o vehículo asignado.');
      return;
    }
    if (sobreCapacidad) {
      setError(
        `El vehículo ya alcanzó su capacidad de ${camion.capacidadCilindros} cilindros.`,
      );
      return;
    }

    const promesa = esperarCodigo();
    router.push({ pathname: '/escaner', params: { tipo } });
    const capturado = await promesa;
    if (!capturado) return;

    setOcupado(true);
    try {
      const cilindro = await repos.cilindros.obtenerPorCodigo(capturado.codigo);
      if (!cilindro) {
        setError(
          `El código ${capturado.codigo} no está en el catálogo. Verifícalo o da de alta el envase desde la plataforma web.`,
        );
        return;
      }

      const problema = validar(cilindro);
      if (problema) {
        setError(problema);
        return;
      }

      const movimiento: Movimiento = {
        uuidLocal: Crypto.randomUUID(),
        tipo,
        cilindroId: cilindro.id,
        clienteId: necesitaCliente ? (cliente?.id ?? null) : null,
        usuarioId: usuario.id,
        camionId: camion.id,
        fechaEvento: new Date().toISOString(),
        fechaSync: null,
        origenCodigo: capturado.origen,
      };

      // Se registra directo contra el repositorio: la cola de pendientes y el
      // envío por lotes llegan con el backend. El repositorio ya aplica el
      // efecto sobre el estado del cilindro y es idempotente por uuidLocal.
      await repos.movimientos.registrar(movimiento);
      await refrescar();

      setUltimo({
        cilindro,
        movimiento: {
          ...movimiento,
          codigoCilindro: cilindro.codigo,
          nombreCliente: cliente?.nombre ?? null,
          nombreUsuario: usuario.nombre,
        },
      });
    } finally {
      setOcupado(false);
    }
  }

  /* ------------------------------------------------ pantalla de confirmación */

  if (ultimo) {
    const conf = CONFIRMACION[tipo];
    return (
      <>
        <Stack.Screen options={{ title: TITULO[tipo] }} />
        <ScrollView contentContainerStyle={estilos.contenido}>
          <View style={estilos.confirmacion}>
            <Ionicons name="checkmark-circle" size={28} color={colores.verde[500]} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.confirmacionTitulo}>{conf.titulo}</Text>
              <Text style={estilos.confirmacionTexto}>{conf.texto}</Text>
            </View>
          </View>

          <Tarjeta>
            <View style={estilos.filaEntreLados}>
              <View style={estilos.codigoFila}>
                <Ionicons name="flask-outline" size={22} color={colores.azul[600]} />
                <Text style={estilos.codigo}>{ultimo.cilindro.codigo}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={colores.verde[500]} />
            </View>

            <View style={estilos.datos}>
              <Dato etiqueta="Tipo de gas" valor={ultimo.cilindro.tipoGas} />
              <Dato etiqueta="Capacidad" valor={formatearCapacidad(ultimo.cilindro)} />
              {ultimo.movimiento.nombreCliente ? (
                <Dato etiqueta="Cliente" valor={ultimo.movimiento.nombreCliente} />
              ) : null}
              <Dato etiqueta="Fecha / Hora" valor={fechaHora(ultimo.movimiento.fechaEvento)} />
              <Dato etiqueta="Usuario" valor={ultimo.movimiento.nombreUsuario} />
              <Dato
                etiqueta="Código capturado"
                valor={ultimo.movimiento.origenCodigo === 'manual' ? 'Manual' : 'Escáner'}
              />
            </View>
          </Tarjeta>

          <Boton
            titulo="Escanear otro cilindro"
            icono="scan-outline"
            onPress={() => {
              setUltimo(null);
              void capturarYRegistrar();
            }}
          />
          <Boton
            titulo={`Volver a ${tipo}`}
            icono="arrow-back"
            variante="secundario"
            onPress={() => setUltimo(null)}
          />

          <Seccion texto={`${ETIQUETA_MOVIMIENTO[tipo]}s de hoy`} />
          <Tarjeta style={{ paddingVertical: espacios.sm }}>
            {registros.length === 0 ? (
              <Vacio texto="Todavía no hay registros." />
            ) : (
              registros.map((m) => (
                <Fila
                  key={m.uuidLocal}
                  titulo={m.codigoCilindro}
                  subtitulo={m.nombreCliente ?? undefined}
                  derecha={hora(m.fechaEvento)}
                />
              ))
            )}
          </Tarjeta>
        </ScrollView>
      </>
    );
  }

  /* ---------------------------------------------------- pantalla de operación */

  return (
    <>
      <Stack.Screen options={{ title: TITULO[tipo] }} />
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        {tipo === 'carga' && camion ? (
          <Tarjeta style={estilos.filaEntreLados}>
            <View style={estilos.codigoFila}>
              <Ionicons name="bus" size={24} color={colores.azul[600]} />
              <View>
                <Text style={estilos.etiquetaTenue}>Vehículo actual</Text>
                <Text style={estilos.valorFuerte}>Patente: {camion.patente}</Text>
              </View>
            </View>
            <Etiqueta texto="Activo" tono="verde" />
          </Tarjeta>
        ) : null}

        {necesitaCliente ? (
          <View style={{ gap: espacios.md }}>
            <Seccion texto="Selecciona cliente" style={{ marginBottom: 0 }} />
            <View style={estilos.buscador}>
              <View style={{ flex: 1 }}>
                <Campo
                  valor={busqueda}
                  onChange={(t) => {
                    setBusqueda(t);
                    setListaAbierta(true);
                  }}
                  placeholder="Buscar cliente..."
                  icono="search-outline"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mostrar lista de clientes"
                onPress={() => setListaAbierta((v) => !v)}
                style={estilos.buscadorBoton}
                hitSlop={8}
              >
                <Ionicons
                  name={listaAbierta ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colores.gris[500]}
                />
              </Pressable>
            </View>

            {listaAbierta ? (
              <Tarjeta style={{ paddingVertical: espacios.sm }}>
                {resultados.length === 0 ? (
                  <Vacio texto="Sin coincidencias." />
                ) : (
                  resultados.slice(0, 8).map((c) => (
                    <Fila
                      key={c.id}
                      icono="business-outline"
                      titulo={c.nombre}
                      subtitulo={`RUT: ${c.rut}`}
                      onPress={() => {
                        setCliente(c);
                        setListaAbierta(false);
                        setBusqueda('');
                        setError(null);
                      }}
                    />
                  ))
                )}
              </Tarjeta>
            ) : null}

            {cliente ? (
              <Tarjeta style={estilos.filaEntreLados}>
                <View style={estilos.codigoFila}>
                  <Ionicons name="person-circle-outline" size={26} color={colores.azul[600]} />
                  <View>
                    <Text style={estilos.valorFuerte}>{cliente.nombre}</Text>
                    <Text style={estilos.etiquetaTenue}>RUT: {cliente.rut}</Text>
                  </View>
                </View>
                <Pressable onPress={() => setCliente(null)} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={20} color={colores.gris[400]} />
                </Pressable>
              </Tarjeta>
            ) : null}
          </View>
        ) : null}

        <Contador
          cantidad={registros.length}
          leyenda={LEYENDA_CONTADOR[tipo]}
          tono={tipo === 'carga' ? 'azul' : 'verde'}
        />

        {sobreCapacidad && camion ? (
          <Nota
            tono="alerta"
            texto={`La carga de hoy alcanzó la capacidad del vehículo (${camion.capacidadCilindros} cilindros).`}
          />
        ) : null}

        {error ? <Nota tono="alerta" texto={error} /> : null}

        <Boton
          titulo="Escanear cilindro"
          icono="scan-outline"
          onPress={() => void capturarYRegistrar()}
          cargando={ocupado}
          deshabilitado={necesitaCliente && !cliente}
        />

        <Seccion texto="Registros del día" style={{ marginBottom: 0 }} />
        <Tarjeta style={{ paddingVertical: espacios.sm }}>
          {registros.length === 0 ? (
            <Vacio texto="Todavía no hay registros del día." />
          ) : (
            registros.map((m) => (
              <Fila
                key={m.uuidLocal}
                titulo={m.codigoCilindro}
                subtitulo={m.nombreCliente ?? undefined}
                derecha={hora(m.fechaEvento)}
              />
            ))
          )}
        </Tarjeta>

        <Nota texto={NOTA[tipo]} />

        <Boton
          titulo={`Finalizar ${tipo}`}
          icono="checkmark-circle-outline"
          variante={registros.length > 0 ? 'exito' : 'secundario'}
          onPress={() => router.back()}
        />
      </ScrollView>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.etiquetaTenue}>{etiqueta}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacios.lg, gap: espacios.lg, paddingBottom: espacios.xxl },
  filaEntreLados: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacios.md,
  },
  codigoFila: { flexDirection: 'row', alignItems: 'center', gap: espacios.md, flexShrink: 1 },
  buscador: { flexDirection: 'row', alignItems: 'center', gap: espacios.sm },
  buscadorBoton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radios.md,
    borderWidth: 1,
    borderColor: colores.gris[200],
    backgroundColor: colores.gris[0],
  },
  codigo: { fontSize: 20, fontWeight: '700', color: colores.gris[900] },
  etiquetaTenue: { fontSize: 12, color: colores.gris[500] },
  valorFuerte: { fontSize: 15, fontWeight: '600', color: colores.gris[900] },
  datos: { marginTop: espacios.lg, gap: espacios.md },
  dato: { flexDirection: 'row', justifyContent: 'space-between', gap: espacios.lg },
  datoValor: { fontSize: 13, fontWeight: '600', color: colores.gris[900], flexShrink: 1, textAlign: 'right' },
  confirmacion: {
    flexDirection: 'row',
    gap: espacios.md,
    padding: espacios.lg,
    borderRadius: radios.md,
    backgroundColor: colores.verde[50],
    borderWidth: 1,
    borderColor: colores.verde[100],
  },
  confirmacionTitulo: { fontSize: 15, fontWeight: '700', color: colores.verde[700] },
  confirmacionTexto: { fontSize: 12, color: colores.gris[700], marginTop: 2 },
});
