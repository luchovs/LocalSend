declare global {
  interface Window {
    api: {
      onServerStatus: (callback: (status: boolean) => void) => void
      onDeviceDiscovered: (
        callback: (device: { alias: string; ip: string; deviceType: string }) => void
      ) => void
    }
  }
}

export {}
