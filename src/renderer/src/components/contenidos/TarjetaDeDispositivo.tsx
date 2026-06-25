import React from 'react'
import { MobileDevice } from '../../hooks/useElectronSend'

type Props = {
  dispositivo: MobileDevice
  estaSeleccionado: boolean
  onSeleccionar: () => void
}

export function TarjetaDeDispositivo({ dispositivo, estaSeleccionado, onSeleccionar }: Props) {
  return (
    <div
      onClick={onSeleccionar}
      style={{
        ...styles.card,
        borderColor: estaSeleccionado ? '#4CAF50' : '#3a3a45',
        backgroundColor: estaSeleccionado ? '#233325' : '#2a2a32',
        cursor: 'pointer'
      }}
    >
      <span style={styles.cardIcon}>📱</span>
      <div>
        <div style={styles.cardAlias}>{dispositivo.alias}</div>
        <div style={styles.cardIp}>
          {dispositivo.ip} {estaSeleccionado && '✔️'}
        </div>
      </div>
    </div>
  )
}

const styles = {
  card: {
    padding: '15px 20px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    minWidth: '220px',
    border: '1px solid',
    transition: 'all 0.2s ease'
  },
  cardIcon: { fontSize: '24px' },
  cardAlias: { fontWeight: 'bold', fontSize: '16px', color: '#fff' },
  cardIp: { color: '#a0a0b0', fontSize: '12px', marginTop: '4px' }
}
