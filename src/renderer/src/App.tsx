import { useEffect, useState } from 'react'

interface Device {
  alias: string
  ip: string
  deviceType: string
}

function App() {
  const [isServerOnline, setIsServerOnline] = useState<boolean>(false)
  const [devices, setDevices] = useState<Device[]>([])

  useEffect(() => {
    // 1. Escuchar el estado del servidor UDP desde el Main Process
    window.api.onServerStatus((status: boolean) => {
      setIsServerOnline(status)
    })

    // 2. Escuchar cuando aparezca un nuevo dispositivo en la red
    window.api.onDeviceDiscovered((newDevice: Device) => {
      setDevices((prevDevices) => {
        // Evitamos duplicar el dispositivo si ya existe en la lista por su IP
        if (prevDevices.some((d) => d.ip === newDevice.ip)) {
          return prevDevices
        }
        return [...prevDevices, newDevice]
      })
    })
  }, [])

  return (
    <div style={styles.container}>
      {/* Encabezado con el LED de Estado */}
      <header style={styles.header}>
        <h1>LocalSend Desktop</h1>
        <div style={styles.statusContainer}>
          <span
            style={{
              ...styles.led,
              backgroundColor: isServerOnline ? '#4CAF50' : '#F44336'
            }}
          />
          <p style={styles.statusText}>
            {isServerOnline ? 'Servidor de recepción activo' : 'Servidor desconectado'}
          </p>
        </div>
      </header>

      <hr style={styles.divider} />

      {/* Panel de Dispositivos Descubiertos */}
      <main style={styles.mainContent}>
        <h2>Dispositivos en la red local</h2>
        {devices.length === 0 ? (
          <p style={styles.noDevices}>
            Buscando dispositivos... (Asegúrate de que estén en la misma red Wi-Fi)
          </p>
        ) : (
          <div style={styles.grid}>
            {devices.map((device, index) => (
              <div key={index} style={styles.card}>
                <div style={styles.iconContainer}>
                  {device.deviceType === 'mobile' ? '📱' : '💻'}
                </div>
                <div style={styles.deviceInfo}>
                  <strong style={styles.alias}>{device.alias}</strong>
                  <span style={styles.ip}>{device.ip}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// Estilos rápidos en línea para que se vea ordenado y moderno (puedes pasarlo a CSS después)
const styles = {
  container: {
    fontFamily: 'system-ui, sans-serif',
    backgroundColor: '#1e1e24',
    color: '#ffffff',
    minHeight: '100vh',
    padding: '24px',
    boxSizing: 'border-box' as const
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  statusContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#2a2a32',
    padding: '8px 16px',
    borderRadius: '20px'
  },
  led: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    transition: 'background-color 0.3s ease'
  },
  statusText: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 500
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #3a3a45',
    margin: '20px 0'
  },
  mainContent: {
    marginTop: '20px'
  },
  noDevices: {
    color: '#a0a0b0',
    fontStyle: 'italic'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
    marginTop: '16px'
  },
  card: {
    backgroundColor: '#2a2a32',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid #3a3a45'
  },
  iconContainer: {
    fontSize: '32px'
  },
  deviceInfo: {
    display: 'flex',
    flexDirection: 'column' as const
  },
  alias: {
    fontSize: '16px',
    color: '#ffffff'
  },
  ip: {
    fontSize: '12px',
    color: '#a0a0b0',
    marginTop: '4px'
  }
}

export default App
