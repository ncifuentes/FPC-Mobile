import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colores, espacios, radios } from '../theme/tokens';

type NombreIcono = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Encabezado común de la app (Mockup1 y Mockup2): barra azul, con el logo de
 * FPC en Inicio o con flecha de volver y título en el resto, un ícono de la
 * sección a la derecha y el borde superior redondeado del contenido.
 *
 * El redondeo es una franja del color del fondo (`gris[50]`) con las esquinas
 * de arriba redondas, pegada al borde inferior de la barra: así todas las
 * pantallas lo tienen sin tocar su contenido.
 */
export function EncabezadoMarca({
  titulo,
  icono,
  logo = false,
  onAtras,
}: {
  titulo?: string;
  icono?: NombreIcono;
  logo?: boolean;
  onAtras?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[estilos.barra, { paddingTop: insets.top + espacios.sm }]}>
      <View style={estilos.fila}>
        {onAtras ? (
          <Pressable
            onPress={onAtras}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={12}
            style={estilos.lado}
          >
            <Ionicons name="arrow-back" size={24} color={colores.gris[0]} />
          </Pressable>
        ) : (
          <View style={estilos.lado} />
        )}

        {logo ? (
          <Image
            source={require('../../assets/logo-fpc-horizontal-blanco.png')}
            style={estilos.logo}
            resizeMode="contain"
            accessibilityLabel="FPC Servicios"
          />
        ) : (
          <Text style={estilos.titulo} numberOfLines={1}>
            {titulo}
          </Text>
        )}

        <View style={[estilos.lado, { alignItems: 'flex-end' }]}>
          {icono ? <Ionicons name={icono} size={24} color={colores.gris[0]} /> : null}
        </View>
      </View>
      <View style={estilos.borde} />
    </View>
  );
}

const ICONO_POR_TIPO: Record<string, NombreIcono> = {
  carga: 'bus-outline',
  entrega: 'cube-outline',
  retiro: 'refresh-outline',
};

/** Ícono de la sección según la ruta (nombre de expo-router y sus parámetros). */
export function iconoDeRuta(nombre: string, params?: object): NombreIcono | undefined {
  if (nombre === 'historial') return 'time-outline';
  if (nombre === 'perfil') return 'person-outline';
  if (nombre === 'cilindro/[codigo]') return 'flask-outline';
  if (nombre === 'operacion/[tipo]') {
    const tipo = (params as { tipo?: string } | undefined)?.tipo;
    return (tipo && ICONO_POR_TIPO[tipo]) || 'bus-outline';
  }
  return undefined;
}

const estilos = StyleSheet.create({
  barra: { backgroundColor: colores.azul[700] },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espacios.lg,
    paddingBottom: espacios.md,
    minHeight: 52,
  },
  // Los dos lados miden lo mismo para que el centro quede centrado.
  lado: { width: 40, justifyContent: 'center' },
  // Proporción del archivo (1274 x 599): alto fijo, ancho calculado.
  logo: { flex: 1, height: 44 },
  titulo: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colores.gris[0],
    marginLeft: espacios.sm,
  },
  borde: {
    height: espacios.lg,
    backgroundColor: colores.gris[50],
    borderTopLeftRadius: radios.xl,
    borderTopRightRadius: radios.xl,
  },
});
