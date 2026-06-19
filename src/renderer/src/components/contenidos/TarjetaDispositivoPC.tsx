import React from 'react'
import { MobileDevice } from '../../hooks/useElectronSend'

interface TarjetaProps {
  device: MobileDevice
  isSelected: boolean
  onSelect: (device: MobileDevice) => void
  styles: Record<string, React.CSSProperties>
}

export function TarjetaDispositivoPC({ device, isSelected, onSelect, styles }: TarjetaProps) {
  return (
    <div
      onClick={() => onSelect(device)}
      style={{
        ...styles.card,
        borderColor: isSelected ? '#4CAF50' : '#3a3a45',
        backgroundColor: isSelected ? '#233325' : '#2a2a32',
        cursor: 'pointer'
      }}
    >
      <span style={styles.cardIcon}>📱</span>
      <div>
        <div style={styles.cardAlias}>{device.alias}</div>
        <div style={styles.cardIp}>{device.ip} {isSelected && '✔️'}</div>
      </div>
    </div>
  )
}