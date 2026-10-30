import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { EncabezadoMarca, iconoDeRuta } from '../../src/componentes/EncabezadoMarca';
import { colores } from '../../src/theme/tokens';

export default function LayoutTabs() {
  return (
    <Tabs
      screenOptions={{
        // Mismo encabezado en las tres pestañas: logo en Inicio, y título con
        // el ícono de la sección en Historial y Perfil.
        header: ({ options, route }) =>
          route.name === 'index' ? (
            <EncabezadoMarca logo />
          ) : (
            <EncabezadoMarca titulo={options.title} icono={iconoDeRuta(route.name)} />
          ),
        tabBarActiveTintColor: colores.azul[600],
        tabBarInactiveTintColor: colores.gris[400],
        tabBarStyle: { borderTopColor: colores.gris[200] },
        sceneStyle: { backgroundColor: colores.gris[50] },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="historial"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
