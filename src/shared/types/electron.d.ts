export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  getVersions: () => NodeJS.ProcessVersions;
  onWindowMaximized?: (callback: (isMaximized: boolean) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
