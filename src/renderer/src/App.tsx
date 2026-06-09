import React, { useState, useEffect } from 'react'

interface MobileDevice {
  alias: string
  ip: string
  deviceType: string
}

interface ProgressData {
  fileName: string
  percentage: number
  speed: string
  eta: number
}

const electronAPI = (window as any).api

export default function App() {
  const [devices, setDevices] = useState<MobileDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<MobileDevice | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<ProgressData | null>(null)

  useEffect(() => {
    if (electronAPI) {
      electronAPI.onDeviceDiscovered((device: MobileDevice) => {
        setDevices((prev) => {
          if (prev.some((d) => d.ip === device.ip)) return prev
          return [...prev, device]
        })
      })

      electronAPI.onTransferProgress((data: ProgressData) => {
        setProgress(data)
      })

      electronAPI.onTransferComplete(() => {
        alert('¡Transferencia finalizada con éxito a nivel de red!')
        setProgress(null) // Esto va a esconder la barra automáticamente de forma prolija
      })

      electronAPI.onTransferError((errorMsg: string) => {
        console.error(`Error en transferencia: ${errorMsg}`)
        setProgress(null)
      })
    }
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault()
  setIsDragging(false)
  
  if (!selectedDevice) {
    alert('¡Primero seleccioná un dispositivo de la lista de abajo!')
    return
  }

  const files = e.dataTransfer.files
  if (files.length > 0) {
    const file = files[0]
    
    // Leer el archivo como ArrayBuffer en el renderer (donde tenemos acceso al File object)
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    electronAPI.sendFileToDevice(Array.from(uint8Array), file.name, selectedDevice.ip)
  }
}

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={styles.container}
    >
      <div style={styles.header}>
        <h1 style={styles.title}>LocalSend Desktop</h1>
        <div style={styles.statusBadge}>
          <span style={styles.dot}></span> Servidor de recepción activo
        </div>
      </div>

      <hr style={styles.divider} />

      {/* Zona de Arrastre */}
      <div style={{
        ...styles.dropZone,
        backgroundColor: isDragging ? '#2a3b2c' : '#2a2a32',
        borderColor: isDragging ? '#4CAF50' : '#3a3a45'
      }}>
        <p style={styles.dropText}>
          {selectedDevice 
            ? `Dispositivo activo: ${selectedDevice.alias}. ¡Arrastrá el archivo acá para enviarlo!` 
            : '⚠️ Hacé click en un dispositivo de abajo antes de arrastrar un archivo.'}
        </p>
      </div>

      {/* Monitor de Progreso */}
      {progress && (
        <div style={styles.progressBox}>
          <div style={styles.progressHeader}>
            <span style={styles.fileName}>📂 {progress.fileName}</span>
            <span style={styles.fileSpeed}>{progress.speed} MB/s</span>
          </div>
          <div style={styles.progressBarBg}>
            <div style={{ ...styles.progressBarFill, width: `${progress.percentage}%` }} />
          </div>
          <div style={styles.progressMeta}>
            <span>Progreso: {progress.percentage}%</span>
            <span>Restan: {progress.eta}s</span>
          </div>
        </div>
      )}

      <h2 style={styles.subtitle}>Dispositivos en la red local</h2>
      
      <div style={styles.grid}>
        {devices.map((dev) => {
          const isCurrentSelection = selectedDevice?.ip === dev.ip
          return (
            <div 
              key={dev.ip} 
              onClick={() => setSelectedDevice(dev)} // Guardar selección en el estado
              style={{
                ...styles.card,
                borderColor: isCurrentSelection ? '#4CAF50' : '#3a3a45',
                backgroundColor: isCurrentSelection ? '#233325' : '#2a2a32',
                cursor: 'pointer'
              }}
            >
              <span style={styles.cardIcon}>📱</span>
              <div>
                <div style={styles.cardAlias}>{dev.alias}</div>
                <div style={styles.cardIp}>{dev.ip} {isCurrentSelection && '✔️'}</div>
              </div>
            </div>
          )
        })}
        {devices.length === 0 && (
          <p style={styles.emptyText}>Buscando dispositivos... Activá el radar desde el celular.</p>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: { padding: '30px', backgroundColor: '#1e1e24', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '28px', fontWeight: 'bold', margin: 0 },
  statusBadge: { backgroundColor: '#2a2a32', padding: '8px 14px', borderRadius: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' },
  dot: { width: '10px', height: '10px', backgroundColor: '#4CAF50', borderRadius: '50%', display: 'inline-block' },
  divider: { borderColor: '#2a2a32', margin: '20px 0' },
  subtitle: { fontSize: '20px', marginBottom: '15px' },
  dropZone: { border: '2px dashed #3a3a45', borderRadius: '12px', padding: '40px', textAlign: 'center' as const, marginBottom: '20px' },
  dropText: { color: '#a0a0b0', margin: 0, fontSize: '15px' },
  grid: { display: 'flex', gap: '15px', flexWrap: 'wrap' as const },
  card: { padding: '15px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '15px', minWidth: '220px', border: '1px solid', transition: 'all 0.2s ease' },
  cardIcon: { fontSize: '24px' },
  cardAlias: { fontWeight: 'bold' as const, fontSize: '16px' },
  cardIp: { color: '#a0a0b0', fontSize: '12px', marginTop: '4px' },
  emptyText: { color: '#a0a0b0', fontStyle: 'italic' },
  progressBox: { backgroundColor: '#141416', padding: '15px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #2a2a32' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' },
  fileName: { fontWeight: 'bold' as const, color: '#fff', fontSize: '14px' },
  fileSpeed: { color: '#4CAF50', fontWeight: 'bold' as const, fontSize: '14px' },
  progressBarBg: { height: '8px', backgroundColor: '#333', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', transition: 'width 0.1s linear' },
  progressMeta: { display: 'flex', justifyContent: 'space-between', color: '#a0a0b0', fontSize: '12px' }
}