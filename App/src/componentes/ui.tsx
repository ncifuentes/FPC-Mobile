/**
 * Componentes de interfaz reutilizables, construidos sobre los tokens de
 * `src/theme/tokens.ts`. Ninguna pantalla debería escribir colores a mano.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colores, espacios, radios, sombras } from '../theme/tokens';

type NombreIcono = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ Tarjeta */

export function Tarjeta({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[estilos.tarjeta, style]}>{children}</View>;
}

/* -------------------------------------------------------------------- Botón */

type VarianteBoton = 'primario' | 'exito' | 'secundario' | 'fantasma';

export function Boton({
  titulo,
  onPress,
  icono,
  variante = 'primario',
  cargando = false,
  deshabilitado = false,
  style,
}: {
  titulo: string;
  onPress: () => void;
  icono?: NombreIcono;
  variante?: VarianteBoton;
  cargando?: boolean;
  deshabilitado?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactivo = deshabilitado || cargando;
  const fondo: Record<VarianteBoton, string> = {
    primario: colores.azul[600],
    exito: colores.verde[500],
    secundario: colores.gris[0],
    fantasma: 'transparent',
  };
  const textoColor: Record<VarianteBoton, string> = {
    primario: colores.gris[0],
    exito: colores.gris[0],
    secundario: colores.azul[700],
    fantasma: colores.gris[500],
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo }}
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        estilos.boton,
        { backgroundColor: fondo[variante] },
        variante === 'secundario' && estilos.botonBorde,
        pressed && !inactivo && estilos.botonPresionado,
        inactivo && estilos.botonInactivo,
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={textoColor[variante]} />
      ) : (
        <>
          {icono ? <Ionicons name={icono} size={18} color={textoColor[variante]} /> : null}
          <Text style={[estilos.botonTexto, { color: textoColor[variante] }]}>{titulo}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Etiqueta */

export function Etiqueta({
  texto,
  tono = 'verde',
}: {
  texto: string;
  tono?: 'verde' | 'azul' | 'alerta' | 'neutro';
}) {
  const paleta = {
    verde: { fondo: colores.verde[100], texto: colores.verde[600] },
    azul: { fondo: colores.azul[100], texto: colores.azul[700] },
    alerta: { fondo: colores.alertaFondo, texto: colores.alerta },
    neutro: { fondo: colores.gris[100], texto: colores.gris[500] },
  }[tono];

  return (
    <View style={[estilos.etiqueta, { backgroundColor: paleta.fondo }]}>
      <Text style={[estilos.etiquetaTexto, { color: paleta.texto }]}>{texto}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ Campo de texto */

export function Campo({
  valor,
  onChange,
  placeholder,
  icono,
  secreto = false,
  autoCapitalize = 'none',
  keyboardType,
  onSubmit,
}: {
  valor: string;
  onChange: (t: string) => void;
  placeholder: string;
  icono?: NombreIcono;
  secreto?: boolean;
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
  keyboardType?: 'default' | 'numeric' | 'email-address';
  onSubmit?: () => void;
}) {
  const [verSecreto, setVerSecreto] = React.useState(false);
  return (
    <View style={estilos.campo}>
      {icono ? <Ionicons name={icono} size={18} color={colores.gris[400]} /> : null}
      <TextInput
        style={estilos.campoInput}
        value={valor}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colores.gris[400]}
        secureTextEntry={secreto && !verSecreto}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        onSubmitEditing={onSubmit}
        returnKeyType={onSubmit ? 'done' : 'default'}
      />
      {secreto ? (
        <Pressable onPress={() => setVerSecreto((v) => !v)} hitSlop={8}>
          <Ionicons
            name={verSecreto ? 'eye-outline' : 'eye-off-outline'}
            size={18}
            color={colores.gris[400]}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------------- Nota */

export function Nota({ texto, tono = 'info' }: { texto: string; tono?: 'info' | 'alerta' }) {
  const esAlerta = tono === 'alerta';
  return (
    <View
      style={[
        estilos.nota,
        { backgroundColor: esAlerta ? colores.alertaFondo : colores.azul[50] },
      ]}
    >
      <Ionicons
        name={esAlerta ? 'warning-outline' : 'information-circle-outline'}
        size={18}
        color={esAlerta ? colores.alerta : colores.azul[600]}
      />
      <Text
        style={[estilos.notaTexto, { color: esAlerta ? colores.alerta : colores.gris[700] }]}
      >
        {texto}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------- Contador XXL */

export function Contador({
  cantidad,
  leyenda,
  onPress,
  tono = 'azul',
}: {
  cantidad: number;
  leyenda: string;
  onPress?: () => void;
  tono?: 'azul' | 'verde';
}) {
  const color = tono === 'verde' ? colores.verde[500] : colores.azul[600];
  const contenido = (
    <>
      <Ionicons name="flask-outline" size={30} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.contadorNumero}>{cantidad}</Text>
        <Text style={estilos.contadorLeyenda}>{leyenda}</Text>
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colores.gris[400]} />
      ) : null}
    </>
  );

  if (!onPress) return <View style={estilos.contador}>{contenido}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [estilos.contador, pressed && estilos.botonPresionado]}
    >
      {contenido}
    </Pressable>
  );
}

/* ------------------------------------------------------------- Fila de lista */

export function Fila({
  titulo,
  subtitulo,
  derecha,
  icono = 'flask-outline',
  onPress,
}: {
  titulo: string;
  subtitulo?: string;
  derecha?: string;
  icono?: NombreIcono;
  onPress?: () => void;
}) {
  const contenido = (
    <>
      <Ionicons name={icono} size={18} color={colores.azul[600]} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.filaTitulo}>{titulo}</Text>
        {subtitulo ? <Text style={estilos.filaSubtitulo}>{subtitulo}</Text> : null}
      </View>
      {derecha ? <Text style={estilos.filaDerecha}>{derecha}</Text> : null}
      {onPress ? (
        <Ionicons name="chevron-forward" size={16} color={colores.gris[300]} />
      ) : null}
    </>
  );

  if (!onPress) return <View style={estilos.fila}>{contenido}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [estilos.fila, pressed && { backgroundColor: colores.gris[50] }]}
    >
      {contenido}
    </Pressable>
  );
}

/* --------------------------------------------------------- Título de sección */

export function Seccion({ texto, style }: { texto: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[estilos.seccion, style]}>{texto}</Text>;
}

/* ------------------------------------------------------------ Estado vacío */

export function Vacio({ texto }: { texto: string }) {
  return (
    <View style={estilos.vacio}>
      <Ionicons name="file-tray-outline" size={28} color={colores.gris[300]} />
      <Text style={estilos.vacioTexto}>{texto}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ Estilos */

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.gris[0],
    borderRadius: radios.lg,
    borderWidth: 1,
    borderColor: colores.gris[200],
    padding: espacios.lg,
    ...sombras.tarjeta,
  },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacios.sm,
    height: 52,
    borderRadius: radios.md,
    paddingHorizontal: espacios.lg,
  },
  botonBorde: { borderWidth: 1, borderColor: colores.gris[200] },
  botonPresionado: { opacity: 0.85 },
  botonInactivo: { opacity: 0.5 },
  botonTexto: { fontSize: 15, fontWeight: '600' },
  etiqueta: {
    paddingHorizontal: espacios.md,
    paddingVertical: 4,
    borderRadius: radios.full,
  },
  etiquetaTexto: { fontSize: 12, fontWeight: '600' },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacios.md,
    height: 50,
    paddingHorizontal: espacios.lg,
    borderRadius: radios.md,
    borderWidth: 1,
    borderColor: colores.gris[200],
    backgroundColor: colores.gris[0],
  },
  campoInput: { flex: 1, fontSize: 15, color: colores.gris[900] },
  nota: {
    flexDirection: 'row',
    gap: espacios.md,
    padding: espacios.lg,
    borderRadius: radios.md,
  },
  notaTexto: { flex: 1, fontSize: 13, lineHeight: 18 },
  contador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacios.lg,
    padding: espacios.lg,
    borderRadius: radios.md,
    backgroundColor: colores.gris[50],
    borderWidth: 1,
    borderColor: colores.gris[200],
  },
  contadorNumero: { fontSize: 30, fontWeight: '700', color: colores.gris[900], lineHeight: 34 },
  contadorLeyenda: { fontSize: 13, color: colores.gris[500] },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacios.md,
    paddingVertical: espacios.md,
    paddingHorizontal: espacios.sm,
    borderBottomWidth: 1,
    borderBottomColor: colores.gris[100],
  },
  filaTitulo: { fontSize: 14, fontWeight: '600', color: colores.azul[700] },
  filaSubtitulo: { fontSize: 12, color: colores.gris[500], marginTop: 2 },
  filaDerecha: { fontSize: 12, color: colores.gris[500] },
  seccion: {
    fontSize: 15,
    fontWeight: '700',
    color: colores.gris[900],
    marginBottom: espacios.md,
  },
  vacio: { alignItems: 'center', gap: espacios.sm, paddingVertical: espacios.xl },
  vacioTexto: { fontSize: 13, color: colores.gris[400], textAlign: 'center' },
});
