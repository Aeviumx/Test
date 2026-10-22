import { contextBridge, ipcRenderer } from 'electron';
import {
  KoriElectronAPI,
  ProjectSaveData,
  RifeInterpolationConfig,
  ExportJobConfig,
  ProxyProgressEvent,
  ModelDownloadProgress,
  ExportProgressEvent,
} from '../src/types/electron';

const api: KoriElectronAPI = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    unmaximize: () => ipcRenderer.invoke('window:unmaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback) => {
      const handler = (_: unknown, isMaximized: boolean) => callback(isMaximized);
      ipcRenderer.on('window:maximize-change', handler);
      return () => ipcRenderer.off('window:maximize-change', handler);
    },
  },

  dialog: {
    openMediaFiles: () => ipcRenderer.invoke('dialog:openMediaFiles'),
    openProjectFile: () => ipcRenderer.invoke('dialog:openProjectFile'),
    saveProjectFile: (data: ProjectSaveData, currentPath?: string) =>
      ipcRenderer.invoke('dialog:saveProjectFile', data, currentPath),
    saveExportDialog: (defaultName: string, format: 'mp4' | 'mov') =>
      ipcRenderer.invoke('dialog:saveExportDialog', defaultName, format),
    relinkMissingFile: (fileName: string) =>
      ipcRenderer.invoke('dialog:relinkMissingFile', fileName),
  },

  media: {
    probe: (filePath: string) => ipcRenderer.invoke('media:probe', filePath),
    generateProxy: (filePath: string, targetHeight?: number) =>
      ipcRenderer.invoke('media:generateProxy', filePath, targetHeight),
    detectScenes: (filePath: string, threshold?: number) =>
      ipcRenderer.invoke('media:detectScenes', filePath, threshold),
    extractAudioPcm: (filePath: string) =>
      ipcRenderer.invoke('media:extractAudioPcm', filePath),
    onProxyProgress: (callback) => {
      const handler = (_: unknown, p: ProxyProgressEvent) => callback(p);
      ipcRenderer.on('media:proxyProgress', handler);
      return () => ipcRenderer.off('media:proxyProgress', handler);
    },
  },

  ai: {
    checkModelStatus: (modelName) => ipcRenderer.invoke('ai:checkModelStatus', modelName),
    downloadModel: (modelName) => ipcRenderer.invoke('ai:downloadModel', modelName),
    onModelProgress: (callback) => {
      const handler = (_: unknown, p: ModelDownloadProgress) => callback(p);
      ipcRenderer.on('ai:modelProgress', handler);
      return () => ipcRenderer.off('ai:modelProgress', handler);
    },
    interpolateFrames: (config: RifeInterpolationConfig) =>
      ipcRenderer.invoke('ai:interpolateFrames', config),
    segmentCharacterForeground: (imagePath: string) =>
      ipcRenderer.invoke('ai:segmentCharacterForeground', imagePath),
  },

  exporter: {
    startExport: (config: ExportJobConfig) => ipcRenderer.invoke('exporter:startExport', config),
    cancelExport: (jobId: string) => ipcRenderer.invoke('exporter:cancelExport', jobId),
    onExportProgress: (callback) => {
      const handler = (_: unknown, p: ExportProgressEvent) => callback(p);
      ipcRenderer.on('exporter:progress', handler);
      return () => ipcRenderer.off('exporter:progress', handler);
    },
    getAvailableEncoders: () => ipcRenderer.invoke('exporter:getAvailableEncoders'),
  },

  storage: {
    getCacheDir: () => ipcRenderer.invoke('storage:getCacheDir'),
    clearCache: () => ipcRenderer.invoke('storage:clearCache'),
    saveAutoRecovery: (data: ProjectSaveData) =>
      ipcRenderer.invoke('storage:saveAutoRecovery', data),
    loadAutoRecovery: () => ipcRenderer.invoke('storage:loadAutoRecovery'),
    checkFileExists: (filePath: string) =>
      ipcRenderer.invoke('storage:checkFileExists', filePath),
  },
};

contextBridge.exposeInMainWorld('koriAPI', api);
