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
const DEFAULT_ALIAS = 'Mi PC'

export default function App() {
  const [devices, setDevices] = useState<MobileDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<MobileDevice | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [alias, setAlias] = useState<string>(DEFAULT_ALIAS)
  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasInput, setAliasInput] = useState(DEFAULT_ALIAS)
  const [networkError, setNetworkError] = useState<{ message: string; recoverable: boolean } | null>(null)

  useEffect(() => {
    if (!electronAPI) return

    // Cargar alias persistido desde el main al arrancar
    electronAPI.onLoadAlias((savedAlias: string) => {
      setAlias(savedAlias)
      setAliasInput(savedAlias)
    })

    electronAPI.onDeviceDiscovered((device: MobileDevice) => {
      setDevices((prev) => {
        if (prev.some((d) => d.ip === device.ip)) return prev
        return [...prev, device]
      })
    })

    electronAPI.onTransferProgress((data: ProgressData) => {
      setProgress(data)
      setNetworkError(null) // limpiar error si retoma
    })

    electronAPI.onTransferComplete(() => {
      setProgress(null)
      setNetworkError(null)
    })

electronAPI.onTransferError((errorMsg: string) => {
  setProgress(null)
  if (errorMsg === 'omitido') return

  if (errorMsg === 'rechazado') {
    setNetworkError({ 
      message: 'El dispositivo de destino rechazó el archivo entrante.', 
      recoverable: true 
    })
  } else if (errorMsg.startsWith('recoverable:')) {
    setNetworkError({ message: 'Se perdió la conexión. Podés reintentar el envío desde el celular.', recoverable: true })
  } else if (errorMsg.startsWith('fatal:')) {
    setNetworkError({ message: 'Error de transferencia. Verificá la red.', recoverable: false })
  } else {
    setNetworkError({ message: errorMsg, recoverable: false })
  }
})
  }, [])

  const saveAlias = () => {
    const trimmed = aliasInput.trim() || DEFAULT_ALIAS
    setAlias(trimmed)
    setAliasInput(trimmed)
    electronAPI?.setAlias(trimmed)
    setEditingAlias(false)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setNetworkError(null)
    if (!selectedDevice) { alert('¡Primero seleccioná un dispositivo de la lista!'); return }
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0] as any
      if (electronAPI?.sendFileToDevice) {
        const ab = await file.arrayBuffer()
        electronAPI.sendFileToDevice(Array.from(new Uint8Array(ab)), file.name, selectedDevice.ip)
      }
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={styles.title}>LocalSend</h1>
          {editingAlias ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                style={styles.aliasInput}
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveAlias()}
                autoFocus
                maxLength={32}
              />
              <button style={styles.aliasSave} onClick={saveAlias}>✓</button>
              <button style={styles.aliasCancel} onClick={() => { setEditingAlias(false); setAliasInput(alias) }}>✕</button>
            </div>
          ) : (
            <span style={styles.aliasDisplay} onClick={() => setEditingAlias(true)} title="Clic para editar">
              ✏️ {alias}
            </span>
          )}
        </div>
        <div style={styles.statusBadge}>
          <span style={styles.dot}></span> Servidor activo
        </div>
      </div>

      <hr style={styles.divider} />

      {/* Error de red */}
      {networkError && (
        <div style={{ ...styles.errorBox, borderColor: networkError.recoverable ? '#FF9800' : '#F44336' }}>
          <span style={{ fontSize: '18px' }}>{networkError.recoverable ? '⚠️' : '❌'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', color: networkError.recoverable ? '#FF9800' : '#F44336', marginBottom: '2px' }}>
              {networkError.recoverable ? 'Conexión interrumpida' : 'Error de transferencia'}
            </div>
            <div style={{ color: '#a0a0b0', fontSize: '13px' }}>{networkError.message}</div>
          </div>
          <button style={styles.errorDismiss} onClick={() => setNetworkError(null)}>✕</button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          ...styles.dropZone,
          backgroundColor: isDragging ? '#2a3b2c' : '#2a2a32',
          borderColor: isDragging ? '#4CAF50' : '#3a3a45'
        }}
      >
        <p style={styles.dropText}>
          {selectedDevice
            ? `Dispositivo activo: ${selectedDevice.alias}. ¡Arrastrá el archivo acá para enviarlo!`
            : '⚠️ Hacé click en un dispositivo de abajo antes de arrastrar un archivo.'}
        </p>
      </div>

      {/* Progreso */}
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
          const isSelected = selectedDevice?.ip === dev.ip
          return (
            <div
              key={dev.ip}
              onClick={() => setSelectedDevice(dev)}
              style={{
                ...styles.card,
                borderColor: isSelected ? '#4CAF50' : '#3a3a45',
                backgroundColor: isSelected ? '#233325' : '#2a2a32',
                cursor: 'pointer'
              }}
            >
              <span style={styles.cardIcon}>📱</span>
              <div>
                <div style={styles.cardAlias}>{dev.alias}</div>
                <div style={styles.cardIp}>{dev.ip} {isSelected && '✔️'}</div>
              </div>
            </div>
          )
        })}
        {devices.length === 0 && <p style={styles.emptyText}>Buscando dispositivos... Activá el radar desde el celular.</p>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '30px', backgroundColor: '#1e1e24', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' },
  title: { fontSize: '28px', fontWeight: 'bold', margin: 0 },
  statusBadge: { backgroundColor: '#2a2a32', padding: '8px 14px', borderRadius: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' },
  dot: { width: '10px', height: '10px', backgroundColor: '#4CAF50', borderRadius: '50%', display: 'inline-block' },
  divider: { borderColor: '#2a2a32', margin: '20px 0' },
  subtitle: { fontSize: '20px', marginBottom: '15px' },
  dropZone: { border: '2px dashed #3a3a45', borderRadius: '12px', padding: '40px', textAlign: 'center', marginBottom: '20px' },
  dropText: { color: '#a0a0b0', margin: 0, fontSize: '15px' },
  grid: { display: 'flex', gap: '15px', flexWrap: 'wrap' },
  card: { padding: '15px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '15px', minWidth: '220px', border: '1px solid', transition: 'all 0.2s ease' },
  cardIcon: { fontSize: '24px' },
  cardAlias: { fontWeight: 'bold', fontSize: '16px' },
  cardIp: { color: '#a0a0b0', fontSize: '12px', marginTop: '4px' },
  emptyText: { color: '#a0a0b0', fontStyle: 'italic' },
  progressBox: { backgroundColor: '#141416', padding: '15px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #2a2a32' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' },
  fileName: { fontWeight: 'bold', color: '#fff', fontSize: '14px' },
  fileSpeed: { color: '#4CAF50', fontWeight: 'bold', fontSize: '14px' },
  progressBarBg: { height: '8px', backgroundColor: '#333', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', transition: 'width 0.1s linear' },
  progressMeta: { display: 'flex', justifyContent: 'space-between', color: '#a0a0b0', fontSize: '12px' },
  aliasInput: { backgroundColor: '#2a2a32', border: '1px solid #4CAF50', borderRadius: '6px', color: '#fff', padding: '4px 8px', fontSize: '14px', outline: 'none' },
  aliasSave: { backgroundColor: '#4CAF50', border: 'none', borderRadius: '6px', color: '#fff', padding: '4px 10px', cursor: 'pointer', fontWeight: 'bold' },
  aliasCancel: { backgroundColor: '#3a3a45', border: 'none', borderRadius: '6px', color: '#fff', padding: '4px 10px', cursor: 'pointer' },
  aliasDisplay: { color: '#a0a0b0', fontSize: '14px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', border: '1px solid #3a3a45' },
  errorBox: { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px', borderRadius: '10px', border: '1px solid', backgroundColor: '#1a1a20', marginBottom: '16px' },
  errorDismiss: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '16px', padding: '0 4px', flexShrink: 0 }
}