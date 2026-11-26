import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { EncabezadoMarca, iconoDeRuta } from '../src/componentes/EncabezadoMarca';
import { ProveedorSesion, useSesion } from '../src/estado/sesion';
import { ProveedorSync } from '../src/sync/sincronizador';
import { colores } from '../src/theme/tokens';

/**
 * La sincronización vive dentro de la sesión y solo trabaja con usuario
 * autenticado. Se monta siempre (inactiva sin usuario) para no cambiar la forma
 * del árbol al iniciar o cerrar sesión, que remontaría el Stack completo.
 */
function SyncDeSesion({ children }: { children: React.ReactNode }) {
  const { usuario } = useSesion();
  return <ProveedorSync usuarioId={usuario?.id ?? null}>{children}</ProveedorSync>;
}

/**
 * Stack raíz y proveedores globales.
 *
 * Monta la sesión, la sincronización de movimientos y declara el escáner como
 * modal.
 */
export default function LayoutRaiz() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ProveedorSesion>
          <SyncDeSesion>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colores.azul[700] },
              headerTintColor: colores.gris[0],
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colores.gris[50] },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* Pantallas que se abren desde las pestañas: encabezado de marca con volver. */}
            <Stack.Screen
              name="operacion/[tipo]"
              options={{
                header: ({ options, route, back, navigation }) => (
                  <EncabezadoMarca
                    titulo={options.title}
                    icono={iconoDeRuta(route.name, route.params)}
                    onAtras={back ? navigation.goBack : undefined}
                  />
                ),
              }}
            />
            <Stack.Screen
              name="cilindro/[codigo]"
              options={{
                header: ({ options, route, back, navigation }) => (
                  <EncabezadoMarca
                    titulo={options.title}
                    icono={iconoDeRuta(route.name, route.params)}
                    onAtras={back ? navigation.goBack : undefined}
                  />
                ),
              }}
            />
            <Stack.Screen
              name="escaner"
              options={{ presentation: 'modal', title: 'Escanear cilindro' }}
            />
          </Stack>
          </SyncDeSesion>
        </ProveedorSesion>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
