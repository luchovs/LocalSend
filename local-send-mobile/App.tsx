import React, { useState, useEffect } from 'react'
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native'
import NetInfo from '@react-native-community/netinfo'

interface DiscoveredDevice {
  alias: string
  ip: string
  deviceType: string
}

export default function App() {
  const [isWifi, setIsWifi] = useState<boolean | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [baseIp, setBaseIp] = useState<string>('')

  // 1. Validar requisitos de red al arrancar y calcular la raíz de la IP
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnectedToWifi = state.isConnected && state.type === 'wifi'
      setIsWifi(isConnectedToWifi)

      // Si estamos en Wi-Fi, extraemos los primeros dos octetos (Ej: de 10.56.5.14 dejamos "10.56.")
      if (isConnectedToWifi && state.details && 'ipAddress' in state.details) {
        const ip = state.details.ipAddress as string
        const segments = ip.split('.')

        // Sacamos los últimos dos números para adaptarnos a las subredes del colegio
        segments.pop()
        segments.pop()

        setBaseIp(segments.join('.') + '.') // Guarda "10.56."
      }
    })

    return () => unsubscribe()
  }, [])

  // 2. Escáner Concurrente de Red Optimizado para dos subredes clave
  const scanNetwork = async () => {
    if (!baseIp) return
    setLoading(true)
    setDevices([])

    // Definimos a mano solo las subredes que sabemos que están activas hoy (la tuya y la de la PC)
    const subredesAInterrogar = [2, 5]
    const promises = []

    console.log(`[Radar] Escaneando subredes seleccionadas...`)

    for (const subred of subredesAInterrogar) {
      for (let i = 1; i <= 254; i++) {
        const targetIp = `${baseIp}${subred}.${i}`

        // Subimos el timeout a 1000ms por si la red del colegio está lenta,
        // pero al ser menos IPs en total, el celu se lo banca perfecto.
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000)

        const fetchPromise = fetch(`http://${targetIp}:53319/ping`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        })
          .then((res) => res.json())
          .then((data) => {
            clearTimeout(timeoutId)
            if (data.type === 'BEACON_RESPONSE') {
              console.log(`[Radar] ¡PC encontrada en! -> ${targetIp}`)
              setDevices((prev) => {
                if (prev.some((d) => d.ip === targetIp)) return prev
                return [...prev, { alias: data.alias, ip: targetIp, deviceType: data.deviceType }]
              })
            }
          })
          .catch(() => {
            clearTimeout(timeoutId)
          })

        promises.push(fetchPromise)
      }
    }

    // Esperamos las respuestas de las subredes de forma segura
    await Promise.all(promises)
    console.log(`[Radar] Escaneo finalizado.`)
    setLoading(false)
  }

  if (isWifi === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>⚠️ Se requiere conexión Wi-Fi para usar LocalSend</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Radar LocalSend</Text>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={scanNetwork}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Buscar Dispositivos</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.subtitle}>Dispositivos en tu red:</Text>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.ip}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardIcon}>{item.deviceType === 'desktop' ? '💻' : '📱'}</Text>
            <View>
              <Text style={styles.cardAlias}>{item.alias}</Text>
              <Text style={styles.cardIp}>{item.ip}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No se encontraron PCs todavía. Dale a Buscar.</Text>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e24', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#a0a0b0', marginTop: 20, marginBottom: 10 },
  button: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10
  },
  buttonDisabled: { backgroundColor: '#356937' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  errorText: {
    color: '#F44336',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 40
  },
  card: {
    backgroundColor: '#2a2a32',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3a3a45'
  },
  cardIcon: { fontSize: 28, marginRight: 15 },
  cardAlias: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cardIp: { color: '#a0a0b0', fontSize: 12, marginTop: 2 },
  emptyText: { color: '#a0a0b0', textAlign: 'center', fontStyle: 'italic', marginTop: 20 }
})
