import React, { useState } from 'react'
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  useColorScheme, StatusBar, Alert, TextInput, Modal, Image
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useLocalSend } from '../../hooks/useLocalSend'
import { RadarDeDispositivos } from '../contenidos/RadarDeDispositivos'

export function ControladorDeTransferencia() {
  const isDark = useColorScheme() === 'dark'
  const {
    isWifi, wifiLost, loading, devices, alias, setAlias,
    selectedFile, sending, sendProgress, incomingFile, setIncomingFile,
    receiving, receiveProgress, scanNetwork, pickDocument, pickFromGallery,
    sendFileToDevice, downloadFile
  } = useLocalSend()

  const [showAliasModal, setShowAliasModal] = useState(false)
  const [aliasInput, setAliasInput] = useState(alias)

  const saveAlias = () => {
    const trimmed = aliasInput.trim() || 'Mi Celular'
    setAlias(trimmed)
    setAliasInput(trimmed)
    setShowAliasModal(false)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const showFilePicker = () => {
    Alert.alert('Seleccionar archivo', '¿De dónde querés elegir el contenido?', [
      { text: '📁 Documentos / Archivos', onPress: pickDocument },
      { text: '🖼️ Galería de Fotos', onPress: pickFromGallery },
      { text: 'Cancelar', style: 'cancel' }
    ])
  }

  const handleIncomingFile = () => {
    if (!incomingFile) return
    Alert.alert('📥 Archivo entrante', `La PC quiere enviarte:\n"${incomingFile.name}"`, [
      {
        text: 'Rechazar',
        style: 'cancel',
        onPress: async () => {
          try {
            await fetch(`http://${incomingFile.ip}:53319/reject`, { method: 'POST' })
          } catch (e) {
            console.error(e)
          } finally {
            setIncomingFile(null)
          }
        }
      },
      { text: 'Descargar', onPress: downloadFile }
    ])
  }

  const dynamicStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#121214' : '#f5f5f7', paddingTop: 60, paddingHorizontal: 20 },
    card: {
      backgroundColor: isDark ? '#1e1e24' : '#ffffff',
      borderColor: isDark ? '#2a2a32' : '#e0e0e0',
      borderWidth: 1, padding: 15, borderRadius: 12,
      flexDirection: 'row', alignItems: 'center', marginBottom: 10, elevation: 2
    }
  })

  if (isWifi === false) {
    return (
      <View style={[dynamicStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📶</Text>
        <Text style={[styles.errorText, { color: '#F44336' }]}>Se requiere conexión Wi-Fi</Text>
        <Text style={{ color: '#888', textAlign: 'center', marginTop: 8, paddingHorizontal: 20 }}>
          {wifiLost ? 'Conexión interrumpida. El archivo sigue listo en la cola para cuando reconectes.' : 'Asegurate de estar en la misma subred local.'}
        </Text>
      </View>
    )
  }

  return (
    <View style={dynamicStyles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#111' }]}>LocalSend</Text>
        <TouchableOpacity
          style={[styles.aliasButton, { borderColor: isDark ? '#3a3a45' : '#ddd' }]}
          onPress={() => { setAliasInput(alias); setShowAliasModal(true) }}
        >
          <Text style={[styles.aliasButtonText, { color: isDark ? '#a0a0b0' : '#555' }]}>✏️ {alias}</Text>
        </TouchableOpacity>
      </View>

      {/* Modal Alias */}
      <Modal visible={showAliasModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: isDark ? '#1e1e24' : '#fff' }]}>
            <Text style={[styles.modalTitle, { color: isDark ? '#fff' : '#111' }]}>¿Cómo te llamás?</Text>
            <TextInput
              style={[styles.modalInput, { color: isDark ? '#fff' : '#111', borderColor: isDark ? '#3a3a45' : '#ddd', backgroundColor: isDark ? '#2a2a32' : '#f5f5f7' }]}
              value={aliasInput}
              onChangeText={setAliasInput}
              maxLength={32}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAliasModal(false)}>
                <Text style={{ color: '#888', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveAlias}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Banner Entrada */}
      {incomingFile && !receiving && (
        <TouchableOpacity style={[styles.incomingBanner, { backgroundColor: isDark ? '#1a2e1a' : '#e8f5e9' }]} onPress={handleIncomingFile}>
          <Text style={styles.incomingIcon}>📥</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.incomingTitle, { color: isDark ? '#81c784' : '#2e7d32' }]}>Archivo entrante</Text>
            <Text style={[styles.incomingName, { color: isDark ? '#a5d6a7' : '#388e3c' }]} numberOfLines={1}>{incomingFile.name}</Text>
          </View>
          <Text style={styles.incomingAction}>Ver</Text>
        </TouchableOpacity>
      )}

      {/* Progreso Recibir */}
      {receiving && (
        <View style={styles.progressBox}>
          <Text style={{ color: '#fff', marginBottom: 5 }}>Descargando: {receiveProgress}%</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${receiveProgress}%`, backgroundColor: '#2196F3' }]} />
          </View>
        </View>
      )}

      {/* Selector Híbrido */}
      <View style={[styles.fileSection, { backgroundColor: isDark ? '#1e1e24' : '#eaf2ea' }]}>
        {selectedFile?.isImage ? (
          <View style={styles.previewRow}>
            <Image source={{ uri: selectedFile.uri }} style={styles.thumbnail} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.fileStatus, { color: isDark ? '#fff' : '#444', textAlign: 'left' }]} numberOfLines={1}>
                {selectedFile.name}
              </Text>
              <Text style={{ color: '#888', fontSize: 12 }}>{(selectedFile.size / 1024).toFixed(1)} KB</Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.fileStatus, { color: isDark ? '#a0a0b0' : '#444' }]}>
            {selectedFile ? `📂 ${selectedFile.name}` : 'Ningún archivo seleccionado'}
          </Text>
        )}
        <TouchableOpacity style={styles.pickerButton} onPress={showFilePicker}>
          <Text style={styles.pickerButtonText}>{selectedFile ? 'Cambiar Origen' : 'Seleccionar Archivo'}</Text>
        </TouchableOpacity>
      </View>

      {/* Progreso Envío */}
      {sending && (
        <View style={styles.progressBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
            {selectedFile?.isImage && <Image source={{ uri: selectedFile.uri }} style={styles.progressThumbnail} />}
            <Text style={{ color: '#fff', flex: 1 }} numberOfLines={1}>Enviando... ({sendProgress}%)</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${sendProgress}%` }]} />
          </View>
        </View>
      )}

      {/* Radar de Contenido Animado */}
      {loading ? (
        <RadarDeDispositivos isDark={isDark} />
      ) : (
        <TouchableOpacity style={[styles.button, sending && styles.buttonDisabled]} onPress={scanNetwork} disabled={sending}>
          <Text style={styles.buttonText}>🔍 Buscar Computadoras</Text>
        </TouchableOpacity>
      )}

      {/* Lista de Destinos */}
      {!loading && (
        <>
          <Text style={[styles.subtitle, { color: isDark ? '#a0a0b0' : '#666' }]}>Dispositivos encontrados:</Text>
          <FlatList
            data={devices}
            keyExtractor={(item) => item.ip}
            renderItem={({ item }) => (
              <TouchableOpacity style={dynamicStyles.card} onPress={() => sendFileToDevice(item.ip)} disabled={!selectedFile || sending}>
                <Text style={styles.cardIcon}>💻</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardAlias, { color: isDark ? '#fff' : '#222' }]}>{item.alias}</Text>
                  <Text style={styles.cardIp}>{item.ip}</Text>
                </View>
                {selectedFile && !sending && <Text style={styles.sendBadge}>Mandar →</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No hay PCs en vista. Activá el radar de arriba.</Text>}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold' },
  aliasButton: { borderWidth: 1, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  aliasButtonText: { fontSize: 13, fontWeight: '500' },
  subtitle: { fontSize: 14, marginTop: 15, marginBottom: 8, fontWeight: '600' },
  fileSection: { padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15, gap: 10 },
  fileStatus: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  thumbnail: { width: 50, height: 50, borderRadius: 8 },
  progressThumbnail: { width: 30, height: 30, borderRadius: 4 },
  pickerButton: { backgroundColor: '#2196F3', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  pickerButtonText: { color: '#fff', fontWeight: 'bold' },
  button: { backgroundColor: '#4CAF50', padding: 14, borderRadius: 10, alignItems: 'center', marginVertical: 5 },
  buttonDisabled: { backgroundColor: '#6ca86e' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cardIcon: { fontSize: 26, marginRight: 15 },
  cardAlias: { fontWeight: 'bold', fontSize: 16 },
  cardIp: { color: '#888', fontSize: 12 },
  sendBadge: { color: '#4CAF50', fontWeight: 'bold', fontSize: 12 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  errorText: { textAlign: 'center', fontSize: 18, fontWeight: 'bold' },
  progressBox: { backgroundColor: '#333', padding: 15, borderRadius: 10, marginBottom: 15 },
  progressBarBg: { height: 8, backgroundColor: '#555', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50' },
  incomingBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#4CAF50' },
  incomingIcon: { fontSize: 24, marginRight: 12 },
  incomingTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  incomingName: { fontSize: 14, fontWeight: 'bold' },
  incomingAction: { color: '#4CAF50', fontWeight: 'bold', fontSize: 12, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '80%', borderRadius: 16, padding: 24, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  modalCancel: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#2a2a32', alignItems: 'center' },
  modalSave: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center' }
})