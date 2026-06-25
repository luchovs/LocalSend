import React from 'react'
import { ProgressData } from '../../hooks/useElectronSend'

type Props = {
  progreso: ProgressData
}

export function BarraDeProgresoActiva({ progreso }: Props) {
  return (
    <article style={styles.progressBox}>
      <div style={styles.progressHeader}>
        <span style={styles.fileName}>📂 {progreso.fileName}</span>
        <span style={styles.fileSpeed}>{progreso.speed} MB/s</span>
      </div>
      <div style={styles.progressBarBg}>
        <div style={{ ...styles.progressBarFill, width: `${progreso.percentage}%` }} />
      </div>
      <div style={styles.progressMeta}>
        <span>Progreso: {progreso.percentage}%</span>
        <span>Restan: {progreso.eta}s</span>
      </div>
    </article>
  )
}

const styles = {
  progressBox: {
    backgroundColor: '#141416',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '20px',
    border: '1px solid #2a2a32'
  },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' },
  fileName: { fontWeight: 'bold', color: '#fff', fontSize: '14px' },
  fileSpeed: { color: '#4CAF50', fontWeight: 'bold', fontSize: '14px' },
  progressBarBg: {
    height: '8px',
    backgroundColor: '#333',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px'
  },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', transition: 'width 0.1s linear' },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#a0a0b0',
    fontSize: '12px'
  }
}
