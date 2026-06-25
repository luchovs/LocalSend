import React from 'react'

type Props = {
  mensaje: string
  esRecuperable: boolean
  onCerrar: () => void
}

export function AlertaDeErrorDeRed({ mensaje, esRecuperable, onCerrar }: Props) {
  return (
    <div style={{ ...styles.errorBox, borderColor: esRecuperable ? '#FF9800' : '#F44336' }}>
      <span style={{ fontSize: '18px' }}>{esRecuperable ? '⚠️' : '❌'}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: 'bold',
            color: esRecuperable ? '#FF9800' : '#F44336',
            marginBottom: '2px'
          }}
        >
          {esRecuperable ? 'Conexión interrumpida' : 'Error de transferencia'}
        </div>
        <div style={{ color: '#a0a0b0', fontSize: '13px' }}>{mensaje}</div>
      </div>
      <button style={styles.errorDismiss} onClick={onCerrar}>
        ✕
      </button>
    </div>
  )
}

const styles = {
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid',
    backgroundColor: '#1a1a20',
    marginBottom: '16px'
  },
  errorDismiss: {
    background: 'none',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0 4px',
    flexShrink: 0
  }
}
