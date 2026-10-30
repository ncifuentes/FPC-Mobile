import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useSesion } from '../../src/estado/sesion';
import { colores, espacios, radios } from '../../src/theme/tokens';

type Opcion = {
  titulo: string;
  descripcion: string;
  icono: React.ComponentProps<typeof Ionicons>['name'];
  ruta: string;
  tono: 'azul' | 'verde';
};

const OPCIONES: Opcion[] = [
  {
    titulo: 'Carga de camión',
    descripcion: 'Registra los cilindros que se cargan en el camión.',
    icono: 'bus-outline',
    ruta: '/operacion/carga',
    tono: 'azul',
  },
  {
    titulo: 'Entrega',
    descripcion: 'Registra la entrega de cilindros a clientes.',
    icono: 'cube-outline',
    ruta: '/operacion/entrega',
    tono: 'verde',
  },
  {
    titulo: 'Retiro',
    descripcion: 'Registra el retiro de cilindros vacíos desde clientes.',
    icono: 'refresh-outline',
    ruta: '/operacion/retiro',
    tono: 'verde',
  },
  {
    titulo: 'Historial',
    descripcion: 'Consulta el historial de movimientos de los cilindros.',
    icono: 'document-text-outline',
    ruta: '/(tabs)/historial',
    tono: 'azul',
  },
];

/**
 * Disposición de los accesos: 'grilla' (2 x 2, como en Mockup1) o 'lista'
 * (una tarjeta por fila, como en Mockup2). Es solo una constante de
 * presentación: para comparar basta cambiarla y recargar.
 */
const DISPOSICION: 'grilla' | 'lista' = 'grilla';

/**
 * Pantalla de inicio: accesos a las tres operaciones y vehículo de la jornada.
 *
 * La tarjeta de estado de sincronización —conectado, movimientos en espera,
 * envío manual— va acá cuando exista la cola local de pendientes.
 */
export default function Inicio() {
  const router = useRouter();
  const { usuario, camion } = useSesion();

  const primerNombre = usuario?.nombre.split(' ')[0] ?? '';

  return (
    <View style={estilos.pantalla}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <View>
          <Text style={estilos.saludo}>Hola, {primerNombre}</Text>
          <Text style={estilos.subtitulo}>
            Gestiona las operaciones de cilindros de forma simple y segura.
          </Text>
        </View>

        {camion ? (
          <View style={estilos.vehiculo}>
            <Ionicons name="bus" size={22} color={colores.azul[600]} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.vehiculoTitulo}>Vehículo de la jornada</Text>
              <Text style={estilos.vehiculoTexto}>
                {camion.descripcion} · {camion.patente} · capacidad{' '}
                {camion.capacidadCilindros} cilindros
              </Text>
            </View>
          </View>
        ) : null}

        {DISPOSICION === 'grilla' ? (
          <View style={{ gap: espacios.md }}>
            {[OPCIONES.slice(0, 2), OPCIONES.slice(2, 4)].map((fila, i) => (
              <View key={i} style={estilos.filaGrilla}>
                {fila.map((op) => (
                  <Pressable
                    key={op.titulo}
                    accessibilityRole="button"
                    onPress={() => router.push(op.ruta as never)}
                    style={({ pressed }) => [
                      estilos.celda,
                      {
                        backgroundColor: op.tono === 'verde' ? colores.verde[50] : colores.azul[50],
                        borderColor: op.tono === 'verde' ? colores.verde[100] : colores.azul[100],
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={estilos.celdaCabecera}>
                      <View
                        style={[
                          estilos.opcionIcono,
                          {
                            backgroundColor:
                              op.tono === 'verde' ? colores.verde[500] : colores.azul[600],
                          },
                        ]}
                      >
                        <Ionicons name={op.icono} size={22} color={colores.gris[0]} />
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colores.gris[400]} />
                    </View>
                    <View>
                      <Text style={estilos.opcionTitulo}>{op.titulo}</Text>
                      <Text style={estilos.opcionTexto} numberOfLines={3}>
                        {op.descripcion}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View style={{ gap: espacios.md }}>
            {OPCIONES.map((op) => (
              <Pressable
                key={op.titulo}
                accessibilityRole="button"
                onPress={() => router.push(op.ruta as never)}
                style={({ pressed }) => [
                  estilos.opcion,
                  {
                    backgroundColor: op.tono === 'verde' ? colores.verde[50] : colores.azul[50],
                    borderColor: op.tono === 'verde' ? colores.verde[100] : colores.azul[100],
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View
                  style={[
                    estilos.opcionIcono,
                    {
                      backgroundColor:
                        op.tono === 'verde' ? colores.verde[500] : colores.azul[600],
                    },
                  ]}
                >
                  <Ionicons name={op.icono} size={22} color={colores.gris[0]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.opcionTitulo}>{op.titulo}</Text>
                  <Text style={estilos.opcionTexto}>{op.descripcion}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colores.gris[400]} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.gris[50] },
  contenido: {
    padding: espacios.lg,
    gap: espacios.lg,
  },
  saludo: { fontSize: 24, fontWeight: '700', color: colores.gris[900] },
  subtitulo: { fontSize: 14, color: colores.gris[500], marginTop: 2 },
  vehiculo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacios.md,
    padding: espacios.lg,
    borderRadius: radios.md,
    backgroundColor: colores.azul[50],
  },
  vehiculoTitulo: { fontSize: 13, fontWeight: '700', color: colores.azul[800] },
  vehiculoTexto: { fontSize: 12, color: colores.gris[500], marginTop: 2 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacios.lg,
    padding: espacios.lg,
    borderRadius: radios.lg,
    borderWidth: 1,
  },
  filaGrilla: { flexDirection: 'row', gap: espacios.md },
  celda: {
    flex: 1,
    minHeight: 150,
    justifyContent: 'space-between',
    gap: espacios.md,
    padding: espacios.lg,
    borderRadius: radios.lg,
    borderWidth: 1,
  },
  celdaCabecera: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  opcionIcono: {
    width: 44,
    height: 44,
    borderRadius: radios.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcionTitulo: { fontSize: 15, fontWeight: '700', color: colores.gris[900] },
  opcionTexto: { fontSize: 12, color: colores.gris[500], marginTop: 2 },
});
