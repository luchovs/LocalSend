import React from 'react'
import { MobileDevice } from '../../hooks/useElectronSend'

type Props = {
  encabezado: React.ReactNode
  alertaError?: React.ReactNode
  zonaDrop: React.ReactNode
  progreso?: React.ReactNode
  dispositivos: MobileDevice[]
  renderDispositivo: (dev: MobileDevice) => React.ReactNode
}

export function ContenedorDeTransferencia({
  encabezado,
  alertaError,
  zonaDrop,
  progreso,
  dispositivos,
  renderDispositivo
}: Props) {
  return (
    <div style={styles.container}>
      {encabezado}
      <hr style={styles.divider} />

      {alertaError}
      {zonaDrop}
      {progreso}

      <h2 style={styles.subtitle}>Dispositivos en la red local</h2>

      <main style={styles.grid}>
        {dispositivos.map((dev) => renderDispositivo(dev))}
        {dispositivos.length === 0 && (
          <p style={styles.emptyText}>Buscando dispositivos... Activá el radar desde el celular.</p>
        )}
      </main>
    </div>
  )
}

const styles = {
  container: {
    padding: '30px',
    backgroundColor: '#1e1e24',
    color: '#fff',
    minHeight: '100vh',
    fontFamily: 'sans-serif'
  },
  divider: { borderColor: '#2a2a32', margin: '20px 0' },
  subtitle: { fontSize: '20px', marginBottom: '15px' },
  grid: { display: 'flex', gap: '15px', flexWrap: 'wrap' },
  emptyText: { color: '#a0a0b0', fontStyle: 'italic' }
}
