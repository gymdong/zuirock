import { DEFAULT_CONFIG } from '@zuirock/game-rules';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>쥐락펴락</Text>
      <Text style={styles.caption}>config {DEFAULT_CONFIG.configVersion}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8EE' },
  title: { fontSize: 32, fontWeight: '700', color: '#241B4D' },
  caption: { marginTop: 8, color: '#7C6CF2' },
});
