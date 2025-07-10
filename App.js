import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AppNavigator from './navigation/AppNavigator';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        boxShadow: "0px 2px 4px rgba(0,0,0,0.25)",
      },
      android: {
        elevation: 4,
        backgroundColor: "#fff",
        borderRadius: 8,
      },
      default: {
        boxShadow: '0px 2px 4px rgba(0,0,0,0.3)',
      },
    }),
  },
});
