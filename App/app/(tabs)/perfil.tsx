import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Boton, Etiqueta, Fila, Nota, Seccion, Tarjeta } from '../../src/componentes/ui';
import { useSesion } from '../../src/estado/sesion';
import { colores, espacios, radios } from '../../src/theme/tokens';

const NOMBRE_ROL = {
  tecnico: 'Técnico de distribución',
  admin: 'Administrador',
  gerente: 'Gerencia',
} as const;

/**
 * Perfil del técnico y vehículo de la jornada.
 *
 * El bloque de estado de sincronización va acá cuando exista la cola local:
 * conexión, movimientos pendientes, última sincronización y envío manual.
 */
export default function Perfil() {
  const router = useRouter();
  const { usuario, camion, camionesDisponibles, cambiarCamion, cerrarSesion } = useSesion();

  if (!usuario) return null;

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
          {camionesDisponibles.map((c) => (
            <Fila
              key={c.id}
              icono={c.id === camion?.id ? 'checkmark-circle' : 'bus-outline'}
              titulo={`${c.descripcion} · ${c.patente}`}
              subtitulo={`Capacidad: ${c.capacidadCilindros} cilindros`}
              onPress={() => void cambiarCamion(c.id)}
            />
          ))}
        </Tarjeta>
      </View>

      <Nota texto="Los permisos no se aplican en el teléfono: se resuelven con Row Level Security en la base de datos. El técnico sólo puede insertar movimientos a su nombre." />

      <Boton
        titulo="Cerrar sesión"
        icono="log-out-outline"
        variante="secundario"
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
