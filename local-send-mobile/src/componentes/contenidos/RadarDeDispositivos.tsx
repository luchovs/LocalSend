import React, { useEffect, useRef } from 'react'
import { StyleSheet, Text, View, Animated, Easing } from 'react-native'

interface RadarProps {
  isDark: boolean
}

export function RadarDeDispositivos({ isDark }: RadarProps) {
  const pulse1 = useRef(new Animated.Value(0)).current
  const pulse2 = useRef(new Animated.Value(0)).current
  const pulse3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true })
        ])
      )

    const a1 = createPulse(pulse1, 0)
    const a2 = createPulse(pulse2, 600)
    const a3 = createPulse(pulse3, 1200)
    
    a1.start(); a2.start(); a3.start()
    return () => { a1.stop(); a2.stop(); a3.stop() }
  }, [])

  const ringStyle = (anim: Animated.Value) => ({
    position: 'absolute' as const,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#4CAF50',
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.8] }) }]
  })

  return (
    <View style={styles.radarContainer}>
      <Animated.View style={ringStyle(pulse1)} />
      <Animated.View style={ringStyle(pulse2)} />
      <Animated.View style={ringStyle(pulse3)} />
      <View style={[styles.radarCore, { backgroundColor: isDark ? '#1e1e24' : '#e8f5e9' }]}>
        <Text style={{ fontSize: 32 }}>📡</Text>
      </View>
      <Text style={[styles.radarLabel, { color: isDark ? '#a0a0b0' : '#666' }]}>Buscando...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  radarContainer: { alignItems: 'center', justifyContent: 'center', height: 140, marginVertical: 10 },
  radarCore: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  radarLabel: { marginTop: 8, fontSize: 12, fontStyle: 'italic' }
})