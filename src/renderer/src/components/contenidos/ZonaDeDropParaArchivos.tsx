import React from 'react'

type Props = {
  estaArrastrando: boolean
  aliasDispositivoSeleccionado?: string
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}

export function ZonaDeDropParaArchivos({
  estaArrastrando,
  aliasDispositivoSeleccionado,
  onDragOver,
  onDragLeave,
  onDrop
}: Props) {
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        ...styles.dropZone,
        backgroundColor: estaArrastrando ? '#2a3b2c' : '#2a2a32',
        borderColor: estaArrastrando ? '#4CAF50' : '#3a3a45'
      }}
    >
      <p style={styles.dropText}>
        {aliasDispositivoSeleccionado
          ? `Dispositivo activo: ${aliasDispositivoSeleccionado}. ¡Arrastrá el archivo acá para enviarlo!`
          : '⚠️ Hacé click en un dispositivo de abajo antes de arrastrar un archivo.'}
      </p>
    </section>
  )
}

const styles = {
  dropZone: {
    border: '2px dashed #3a3a45',
    borderRadius: '12px',
    padding: '40px',
    textAlign: 'center',
    marginBottom: '20px'
  },
  dropText: { color: '#a0a0b0', margin: 0, fontSize: '15px' }
}
