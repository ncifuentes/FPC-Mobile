import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

import { Boton, Campo, Contador, Etiqueta, Fila, Nota, Seccion, Tarjeta, Vacio } from '../../src/componentes/ui';
import { repos } from '../../src/datos';
import { esperarCodigo } from '../../src/estado/capturaCodigo';
import { useSesion } from '../../src/estado/sesion';
import { useSync } from '../../src/sync/sincronizador';
import {
  ETIQUETA_MOVIMIENTO,
  formatearCapacidad,
  type Cilindro,
  type Cliente,
  type MovimientoDetallado,
  type MovimientoNuevo,
  type Sucursal,
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

function mensajeDe(e: unknown, respaldo: string): string {
  return e instanceof Error && e.message ? e.message : respaldo;
}

/** Fila de "registros del día": lo que no llegó al servidor se marca sin rediseñar la lista. */
function FilaRegistro({ m }: { m: MovimientoDetallado }) {
  const lugar = m.nombreSucursal ?? m.nombreCliente ?? undefined;
  if (m.envio === 'rechazado') {
    return (
      <Fila
        icono="alert-circle-outline"
        titulo={m.codigoCilindro}
        subtitulo={`Rechazado por el servidor${m.errorEnvio ? `: ${m.errorEnvio}` : ''}`}
        derecha={hora(m.fechaEvento)}
      />
    );
  }
  return (
    <Fila
      icono={m.envio === 'pendiente' ? 'cloud-upload-outline' : 'flask-outline'}
      titulo={m.codigoCilindro}
      subtitulo={lugar}
      derecha={m.envio === 'pendiente' ? `${hora(m.fechaEvento)} · sin enviar` : hora(m.fechaEvento)}
    />
  );
}

const AVISO_INCOMPLETO =
  'Sin conexión con el servidor: se muestran solo los registros guardados en este teléfono.';

export default function PantallaOperacion() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tipo?: string }>();
  const tipo = (TIPOS_VALIDOS.includes(params.tipo as TipoMovimiento)
    ? params.tipo
    : 'carga') as TipoMovimiento;

  const { usuario, camion } = useSesion();
  const { registrar, revision } = useSync();

  const necesitaCliente = tipo !== 'carga';

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [listaAbierta, setListaAbierta] = useState(false);

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursal, setSucursal] = useState<Sucursal | null>(null);
  const [cargandoSucursales, setCargandoSucursales] = useState(false);

  const [registros, setRegistros] = useState<MovimientoDetallado[]>([]);
  const [incompleto, setIncompleto] = useState(false);
  // Un despacho = los movimientos de esta pantalla en una misma sucursal. Al
  // sincronizar se pide un solo folio para todos. Cambiar de sucursal (o salir
  // de la pantalla) empieza otro. Las cargas no llevan despacho.
  const [despachoId, setDespachoId] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<{ movimiento: MovimientoDetallado; cilindro: Cilindro } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const refrescar = useCallback(async () => {
    if (!camion) return;
    const delDia = await repos.movimientos.listarDelDia(camion.id, new Date());
    setRegistros(delDia.movimientos.filter((m) => m.tipo === tipo));
    setIncompleto(delDia.incompleto);
  }, [camion, tipo]);

  // `revision` cambia al registrar y cada vez que un envío cambia algo: así el
  // marcador "sin enviar" desaparece solo cuando el movimiento llega.
  useEffect(() => {
    void refrescar();
  }, [refrescar, revision]);

  useEffect(() => {
    setDespachoId(necesitaCliente && sucursal ? Crypto.randomUUID() : null);
  }, [necesitaCliente, sucursal?.id]);

  useEffect(() => {
    if (!necesitaCliente) return;
    let vivo = true;
    void repos.clientes
      .buscar(busqueda)
      .then((r) => {
        if (vivo) setResultados(r);
      })
      .catch((e: unknown) => {
        if (vivo) setError(mensajeDe(e, 'No se pudo cargar la lista de clientes.'));
      });
    return () => {
      vivo = false;
    };
  }, [busqueda, necesitaCliente]);

  // Al elegir cliente se cargan sus sucursales activas: con una sola, se
  // selecciona sola; con más de una, el técnico elige cuál.
  useEffect(() => {
    if (!cliente) {
      setSucursales([]);
      setSucursal(null);
      return;
    }
    let vivo = true;
    setSucursal(null);
    setCargandoSucursales(true);
    void repos.sucursales
      .listarPorCliente(cliente.id)
      .then((lista) => {
        if (!vivo) return;
        setSucursales(lista);
        if (lista.length === 1) setSucursal(lista[0]);
      })
      .catch((e: unknown) => {
        if (vivo) setError(mensajeDe(e, 'No se pudo cargar las sucursales del cliente.'));
      })
      .finally(() => {
        if (vivo) setCargandoSucursales(false);
      });
    return () => {
      vivo = false;
    };
  }, [cliente]);

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
    if (sucursal && cilindro.sucursalActualId !== sucursal.id) {
      return `${cilindro.codigo} figura en poder de otra sucursal. Verifica antes de retirarlo.`;
    }
    return null;
  }

  async function capturarYRegistrar() {
    setError(null);

    if (necesitaCliente && !(cliente && sucursal)) {
      setError('Selecciona primero el cliente y la sucursal.');
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
      // Con red consulta Supabase; sin red, el respaldo del catálogo. En ambos
      // casos el estado ya trae aplicados los movimientos pendientes de la cola.
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

      const movimiento: MovimientoNuevo = {
        uuidLocal: Crypto.randomUUID(),
        tipo,
        cilindroId: cilindro.id,
        sucursalId: necesitaCliente ? (sucursal?.id ?? null) : null,
        usuarioId: usuario.id,
        camionId: camion.id,
        fechaEvento: new Date().toISOString(),
        fechaSync: null,
        origenCodigo: capturado.origen,
        despachoId: necesitaCliente ? despachoId : null,
        codigoCilindro: cilindro.codigo,
        nombreCliente: necesitaCliente ? (cliente?.nombre ?? null) : null,
        nombreSucursal: necesitaCliente ? (sucursal?.nombre ?? null) : null,
      };

      // A la cola local (idempotente por uuidLocal) y, si hay señal, sale de
      // inmediato. Mientras no llegue, la proyección de la cola ya muestra el
      // cilindro con su nuevo estado.
      await registrar(movimiento);
      await refrescar();

      setUltimo({
        cilindro,
        movimiento: {
          ...movimiento,
          nombreUsuario: usuario.nombre,
          envio: 'pendiente',
          errorEnvio: null,
        },
      });
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo registrar el cilindro. Intenta de nuevo.'));
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
              <Dato etiqueta="Tipo de gas" valor={ultimo.cilindro.tipoGas ?? 'No especificado'} />
              <Dato etiqueta="Capacidad" valor={formatearCapacidad(ultimo.cilindro)} />
              {ultimo.movimiento.nombreCliente ? (
                <Dato etiqueta="Cliente" valor={ultimo.movimiento.nombreCliente} />
              ) : null}
              {ultimo.movimiento.nombreSucursal ? (
                <Dato etiqueta="Sucursal" valor={ultimo.movimiento.nombreSucursal} />
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
          {incompleto ? <Nota tono="alerta" texto={AVISO_INCOMPLETO} /> : null}
          <Tarjeta style={{ paddingVertical: espacios.sm }}>
            {registros.length === 0 ? (
              <Vacio texto="Todavía no hay registros." />
            ) : (
              registros.map((m) => <FilaRegistro key={m.uuidLocal} m={m} />)
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
                  <ScrollView
                    style={estilos.listaClientes}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    {resultados.map((c) => (
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
                    ))}
                  </ScrollView>
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
                <Pressable
                  onPress={() => {
                    setCliente(null);
                    setSucursal(null);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle-outline" size={20} color={colores.gris[400]} />
                </Pressable>
              </Tarjeta>
            ) : null}

            {cliente && cargandoSucursales ? (
              <Nota texto="Cargando sucursales del cliente…" />
            ) : null}

            {cliente && !cargandoSucursales && sucursales.length === 0 ? (
              <Nota tono="alerta" texto="Este cliente no tiene sucursales activas registradas." />
            ) : null}

            {cliente && sucursales.length > 1 && !sucursal ? (
              <View style={{ gap: espacios.sm }}>
                <Seccion texto="Selecciona sucursal" style={{ marginBottom: 0 }} />
                <Tarjeta style={{ paddingVertical: espacios.sm }}>
                  {sucursales.map((s) => (
                    <Fila
                      key={s.id}
                      icono="location-outline"
                      titulo={s.nombre}
                      subtitulo={s.direccion}
                      onPress={() => setSucursal(s)}
                    />
                  ))}
                </Tarjeta>
              </View>
            ) : null}

            {sucursal ? (
              <Tarjeta style={estilos.filaEntreLados}>
                <View style={estilos.codigoFila}>
                  <Ionicons name="location-outline" size={24} color={colores.azul[600]} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.valorFuerte}>{sucursal.nombre}</Text>
                    <Text style={estilos.etiquetaTenue}>{sucursal.direccion}</Text>
                  </View>
                </View>
                {sucursales.length > 1 ? (
                  <Pressable onPress={() => setSucursal(null)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={20} color={colores.gris[400]} />
                  </Pressable>
                ) : null}
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
          deshabilitado={necesitaCliente && !(cliente && sucursal)}
        />

        <Seccion texto="Registros del día" style={{ marginBottom: 0 }} />
        {incompleto ? <Nota tono="alerta" texto={AVISO_INCOMPLETO} /> : null}
        <Tarjeta style={{ paddingVertical: espacios.sm }}>
          {registros.length === 0 ? (
            <Vacio texto="Todavía no hay registros del día." />
          ) : (
            registros.map((m) => <FilaRegistro key={m.uuidLocal} m={m} />)
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
  listaClientes: { maxHeight: 340 },
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
