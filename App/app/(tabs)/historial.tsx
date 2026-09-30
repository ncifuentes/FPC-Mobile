import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Campo, Fila, Seccion, Tarjeta, Vacio } from '../../src/componentes/ui';
import { repos } from '../../src/datos';
import { ETIQUETA_ESTADO, formatearCapacidad, type Cilindro } from '../../src/dominio/tipos';
import { espacios } from '../../src/theme/tokens';

export default function Historial() {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [cilindros, setCilindros] = useState<Cilindro[]>([]);

  useEffect(() => {
    let vivo = true;
    void repos.cilindros.buscar(busqueda).then((r) => {
      if (vivo) setCilindros(r);
    });
    return () => {
      vivo = false;
    };
  }, [busqueda]);

  return (
    <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <Campo
        valor={busqueda}
        onChange={setBusqueda}
        placeholder="Buscar cilindro por N° de serie..."
        icono="search-outline"
        autoCapitalize="characters"
      />

      <View>
        <Seccion texto="Cilindros" />
        <Tarjeta style={{ paddingVertical: espacios.sm }}>
          {cilindros.length === 0 ? (
            <Vacio texto="No hay cilindros que coincidan con la búsqueda." />
          ) : (
            cilindros.map((c) => (
              <Fila
                key={c.id}
                titulo={c.codigo}
                subtitulo={`${c.tipoGas} · ${formatearCapacidad(c)} · ${ETIQUETA_ESTADO[c.estado]}`}
                onPress={() =>
                  router.push({ pathname: '/cilindro/[codigo]', params: { codigo: c.codigo } })
                }
              />
            ))
          )}
        </Tarjeta>
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacios.lg, gap: espacios.lg },
});
