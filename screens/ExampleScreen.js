import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ExampleScreen() {
  return (
    <View style={styles.container}>
      <Text>Pantalla de ejemplo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
}); 