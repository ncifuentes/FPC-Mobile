import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Boton, Etiqueta, Fila, Nota, Seccion, Tarjeta, Vacio } from '../../src/componentes/ui';
import { useSesion } from '../../src/estado/sesion';
import { useSync } from '../../src/sync/sincronizador';
import { colores, espacios, radios } from '../../src/theme/tokens';

const NOMBRE_ROL = {
  tecnico: 'Técnico de distribución',
  admin: 'Administrador',
  gerente: 'Gerencia',
} as const;

/** «hoy 14:05», «ayer 09:10» o «02-11-2026 14:05». */
function cuando(fecha: Date): string {
  const hora = fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const dia = (d: Date) => d.toDateString();
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (dia(fecha) === dia(hoy)) return `hoy ${hora}`;
  if (dia(fecha) === dia(ayer)) return `ayer ${hora}`;
  return `${fecha.toLocaleDateString('es-CL')} ${hora}`;
}

/** Perfil del técnico, vehículo de la jornada y estado de sincronización. */
export default function Perfil() {
  const router = useRouter();
  const { usuario, camion, cerrarSesion } = useSesion();
  const {
    pendientes,
    conError,
    enLinea,
    sincronizando,
    ultimaSync,
    catalogoActualizado,
    actualizandoCatalogo,
    sincronizar,
    actualizarCatalogo,
  } = useSync();
  const [aviso, setAviso] = useState<{ texto: string; tono: 'info' | 'alerta' } | null>(null);

  if (!usuario) return null;

  const ocupado = sincronizando || actualizandoCatalogo;

  async function sincronizarAhora() {
    setAviso(null);
    await sincronizar();
    const ok = await actualizarCatalogo();
    setAviso(
      ok
        ? { texto: 'Listo: se revisó la cola de envío y se actualizó el catálogo.', tono: 'info' }
        : {
            texto: 'No se pudo actualizar el catálogo. Se sigue usando el último descargado.',
            tono: 'alerta',
          },
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Tarjeta>
        <View style={estilos.encabezado}>
          <View style={estilos.avatar}>
            <Ionicons name="person" size={26} color={colores.gris[0]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.nombre}>{usuario.nombre}</Text>
            <Text style={estilos.tenue}>{NOMBRE_ROL[usuario.rol]}</Text>
          </View>
          <Etiqueta texto={usuario.rol} tono="azul" />
        </View>
      </Tarjeta>

      <View>
        <Seccion texto="Vehículo de la jornada" />
        <Tarjeta style={{ paddingVertical: espacios.sm }}>
          {camion ? (
            <Fila
              icono="bus-outline"
              titulo={`${camion.descripcion} · ${camion.patente}`}
              subtitulo={`Capacidad: ${camion.capacidadCilindros} cilindros`}
            />
          ) : (
            <Vacio texto="Sin camión asignado. Pídele al administrador que te asigne uno." />
          )}
        </Tarjeta>
      </View>

      <View>
        <Seccion texto="Sincronización" />
        <Tarjeta style={{ paddingVertical: espacios.sm }}>
          <Fila
            icono={enLinea ? 'wifi-outline' : 'cloud-offline-outline'}
            titulo={enLinea ? 'En línea' : 'Sin conexión'}
            subtitulo={
              enLinea
                ? undefined
                : 'Los registros se guardan en el teléfono y se envían solos al volver la señal.'
            }
          />
          <Fila
            icono="cloud-upload-outline"
            titulo="Por enviar"
            subtitulo={pendientes > 0 ? 'Se envían solos cuando hay señal.' : undefined}
            derecha={String(pendientes)}
          />
          {conError > 0 ? (
            <Fila icono="alert-circle-outline" titulo="Rechazados" derecha={String(conError)} />
          ) : null}
          <Fila
            icono="time-outline"
            titulo="Último envío"
            derecha={ultimaSync ? cuando(ultimaSync) : 'Sin envíos aún'}
          />
          <Fila
            icono="albums-outline"
            titulo="Catálogo sin señal"
            subtitulo="Clientes, sucursales y cilindros guardados en el teléfono."
            derecha={catalogoActualizado ? cuando(catalogoActualizado) : 'Sin descargar'}
          />
        </Tarjeta>
      </View>

      <View style={{ gap: espacios.sm }}>
        {conError > 0 ? (
          <Nota
            tono="alerta"
            texto={`El servidor rechazó ${conError === 1 ? '1 movimiento' : `${conError} movimientos`}. No se reintentan solos: avísale al administrador.`}
          />
        ) : null}

        <Boton
          titulo={ocupado ? 'Sincronizando…' : 'Sincronizar ahora'}
          icono="sync-outline"
          variante="secundario"
          cargando={ocupado}
          deshabilitado={!enLinea}
          onPress={() => void sincronizarAhora()}
        />
        {!enLinea ? (
          <Nota texto="Sin conexión no se puede sincronizar. Lo pendiente se envía solo al volver la señal." />
        ) : aviso ? (
          <Nota texto={aviso.texto} tono={aviso.tono} />
        ) : null}
      </View>

      <Nota texto="Los permisos no se aplican en el teléfono: se resuelven con Row Level Security en la base de datos. El técnico sólo puede insertar movimientos a su nombre." />

      <Boton
        titulo="Cerrar sesión"
        icono="log-out-outline"
        variante="peligro"
        onPress={async () => {
          await cerrarSesion();
          router.replace('/login');
        }}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacios.lg, gap: espacios.lg, paddingBottom: espacios.xxl },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: espacios.lg },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: radios.full,
    backgroundColor: colores.azul[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  nombre: { fontSize: 17, fontWeight: '700', color: colores.gris[900] },
  tenue: { fontSize: 13, color: colores.gris[500] },
});
