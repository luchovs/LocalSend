import React from 'react'
import { useElectronSend } from '../../hooks/useElectronSend'
import { ContenedorDeTransferencia } from '../contenedores/ContenedorDeTransferencia'
import { TarjetaDeDispositivo } from '../contenidos/TarjetaDeDispositivo'
import { AlertaDeErrorDeRed } from '../contenidos/AlertaDeErrorDeRed'
import { ZonaDeDropParaArchivos } from '../contenidos/ZonaDeDropParaArchivos'
import { BarraDeProgresoActiva } from '../contenidos/BarraDeProgresoActiva'

export function ControladorDeEnvio() {
  const {
    devices,
    selectedDevice,
    setSelectedDevice,
    isDragging,
    progress,
    alias,
    editingAlias,
    setEditingAlias,
    aliasInput,
    setAliasInput,
    networkError,
    setNetworkError,
    saveAlias,
    handleDragOver,
    handleDragLeave,
    handleDrop
  } = useElectronSend()

  // Composición interna para el Header
  const renderHeader = () => (
    <header style={styles.header}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h1 style={styles.title}>LocalSend Desktop</h1>
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
            <button style={styles.aliasSave} onClick={saveAlias}>
              ✓
            </button>
            <button
              style={styles.aliasCancel}
              onClick={() => {
                setEditingAlias(false)
                setAliasInput(alias)
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <span
            style={styles.aliasDisplay}
            onClick={() => setEditingAlias(true)}
            title="Clic para editar"
          >
            ✏️ {alias}
          </span>
        )}
      </div>
      <div style={styles.statusBadge}>
        <span style={styles.dot}></span> Servidor activo
      </div>
    </header>
  )

  return (
    <ContenedorDeTransferencia
      encabezado={renderHeader()}
      alertaError={
        networkError ? (
          <AlertaDeErrorDeRed
            mensaje={networkError.message}
            esRecuperable={networkError.recoverable}
            onCerrar={() => setNetworkError(null)}
          />
        ) : undefined
      }
      zonaDrop={
        <ZonaDeDropParaArchivos
          estaArrastrando={isDragging}
          aliasDispositivoSeleccionado={selectedDevice?.alias}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      }
      progreso={progress ? <BarraDeProgresoActiva progreso={progress} /> : undefined}
      dispositivos={devices}
      renderDispositivo={(dev) => (
        <TarjetaDeDispositivo
          key={dev.ip}
          dispositivo={dev}
          estaSeleccionado={selectedDevice?.ip === dev.ip}
          onSeleccionar={() => setSelectedDevice(dev)}
        />
      )}
    />
  )
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px'
  },
  title: { fontSize: '28px', fontWeight: 'bold', margin: 0 },
  statusBadge: {
    backgroundColor: '#2a2a32',
    padding: '8px 14px',
    borderRadius: '20px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  dot: {
    width: '10px',
    height: '10px',
    backgroundColor: '#4CAF50',
    borderRadius: '50%',
    display: 'inline-block'
  },
  aliasInput: {
    backgroundColor: '#2a2a32',
    border: '1px solid #4CAF50',
    borderRadius: '6px',
    color: '#fff',
    padding: '4px 8px',
    fontSize: '14px',
    outline: 'none'
  },
  aliasSave: {
    backgroundColor: '#4CAF50',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    padding: '4px 10px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  aliasCancel: {
    backgroundColor: '#3a3a45',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    padding: '4px 10px',
    cursor: 'pointer'
  },
  aliasDisplay: {
    color: '#a0a0b0',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid #3a3a45'
  }
}
