import { createContext, useContext, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const themes = {
  default: { accent: '#dc0030', soft: '#fff0f3', secondary: '#a72c47' },
  deudas: { accent: '#c2410c', soft: '#fff3e9', secondary: '#dc2626' },
  ingresos: { accent: '#15803d', soft: '#effaf2', secondary: '#0d9488' },
  inversiones: { accent: '#2563eb', soft: '#eff6ff', secondary: '#0891b2' }
};
export const ThemeContext = createContext(themes.default);
export const useTheme = () => useContext(ThemeContext);
export function ActionButton({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [ui.button, { backgroundColor: secondary ? theme.soft : theme.accent, opacity: disabled ? .5 : pressed ? .8 : 1 }]}><Text style={[ui.buttonText, { color: secondary ? theme.accent : '#fff' }]}>{title}</Text></Pressable>;
}
export function Panel({ children }: { children: ReactNode }) { return <View style={ui.panel}>{children}</View>; }
export function LoginScreen({ onLogin, busy, error, message, demo }: { onLogin?: () => void; busy?: boolean; error?: string; message?: string; demo?: boolean }) {
  return <SafeAreaView style={ui.page}><ScrollView contentContainerStyle={ui.login}>
    <Text style={ui.brand}>BANORTE<Text style={{ color: '#263638', fontWeight: '400' }}>HACK</Text></Text>
    <View style={{ gap: 16, marginVertical: 30 }}><Text style={ui.eyebrow}>TU ESPACIO FINANCIERO</Text><Text style={ui.hero}>Tu dinero,{"\n"}con más claridad.</Text><Text style={ui.body}>Pregunta, descubre y construye una vista de tus finanzas a tu medida.</Text></View>
    <Panel><Text style={ui.eyebrow}>BIENVENIDO A NORTE</Text><Text style={ui.title}>Inicia sesión</Text><Text style={ui.body}>{message ?? 'Un solo espacio para entender tus movimientos y explorar nuevas posibilidades.'}</Text>
      {busy && <ActivityIndicator color="#dc0030" accessibilityLabel="Conectando" />}
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      {onLogin && <ActionButton title={busy ? 'Conectando…' : demo ? 'Entrar a la demostración' : 'Iniciar sesión'} disabled={busy} onPress={onLogin} />}
      <Text style={ui.caption}>{demo ? 'Perfil ficticio de demostración.' : 'Continúa con tu cuenta mediante el acceso seguro.'}</Text>
    </Panel><Text style={[ui.caption, { marginTop: 28 }]}>Prototipo con datos sintéticos · Sin cuentas bancarias reales</Text>
  </ScrollView></SafeAreaView>;
}
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f8' },
  login: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  brand: { fontSize: 18, fontWeight: '800', letterSpacing: 2, color: '#dc0030' },
  hero: { fontSize: 38, lineHeight: 44, letterSpacing: -1.4, fontWeight: '800', color: '#203537' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: '#788987' },
  title: { fontSize: 20, fontWeight: '700', color: '#203537' },
  body: { fontSize: 14, lineHeight: 22, color: '#627473' },
  caption: { fontSize: 11, lineHeight: 17, color: '#788987' },
  panel: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5ebe8', borderRadius: 18, padding: 20, gap: 14 },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#dce4e0', borderRadius: 10, padding: 12, backgroundColor: '#fff', fontSize: 16, color: '#203537', minHeight: 48 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  error: { color: '#b4233b', fontSize: 13, lineHeight: 20 },
  value: { color: '#203537', fontSize: 30, fontWeight: '800', letterSpacing: -.8 },
  stack: { gap: 16 }
});
