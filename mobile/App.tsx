import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'search'>('home');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      {currentScreen === 'home' ? (
        <HomeScreen onNavigateSearch={() => setCurrentScreen('search')} />
      ) : (
        <SearchScreen onBack={() => setCurrentScreen('home')} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
