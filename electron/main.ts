import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { FfmpegService } from './ffmpegService';
import { RifeService } from './rifeService';
import { ModelManager, MODEL_REGISTRY } from './modelManager';
import { ProjectSaveData, ExportJobConfig, RifeInterpolationConfig } from '../src/types/electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

class KoriDesktopApp {
  private mainWindow: BrowserWindow | null = null;
  private appDataDir: string;
  private windowStatePath: string;
  private autosavePath: string;
  private cacheDir: string;

  constructor() {
    this.appDataDir = path.join(
      process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming'),
      'Kori'
    );
    fs.mkdirSync(this.appDataDir, { recursive: true });

    this.windowStatePath = path.join(this.appDataDir, 'window-state.json');
    this.autosavePath = path.join(this.appDataDir, 'autosave', 'recovery.kori');
    fs.mkdirSync(path.join(this.appDataDir, 'autosave'), { recursive: true });

    this.cacheDir = path.join(this.appDataDir, 'cache');
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  public init(): void {
    // Single instance lock
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      app.quit();
      return;
    }

    app.on('second-instance', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.focus();
      }
    });

    app.whenReady().then(() => {
      this.createMainWindow();
      this.registerIpcHandlers();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }

  private loadWindowState(): WindowState {
    const defaults: WindowState = {
      width: 1440,
      height: 900,
      isMaximized: false,
    };

    try {
      if (fs.existsSync(this.windowStatePath)) {
        const raw = fs.readFileSync(this.windowStatePath, 'utf8');
        return { ...defaults, ...JSON.parse(raw) };
      }
    } catch {
      // Use defaults
    }
    return defaults;
  }

  private saveWindowState(): void {
    if (!this.mainWindow) return;
    try {
      const isMaximized = this.mainWindow.isMaximized();
      const bounds = this.mainWindow.getBounds();
      const state: WindowState = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized,
      };
      fs.writeFileSync(this.windowStatePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.warn('Failed to save window state', err);
    }
  }

  private createMainWindow(): void {
    const state = this.loadWindowState();

    this.mainWindow = new BrowserWindow({
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
      minWidth: 1024,
      minHeight: 640,
      frame: false, // Custom frameless Midnight Ice title bar
      backgroundColor: '#0b0f17',
      title: 'Kōri (氷) — AI Anime Video Editor',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, 'preload.js'),
        backgroundThrottling: false, // Real-time 60 FPS compositing
      },
    });

    if (state.isMaximized) {
      this.mainWindow.maximize();
    }

    this.mainWindow.on('maximize', () => {
      this.mainWindow?.webContents.send('window:maximize-change', true);
    });

    this.mainWindow.on('unmaximize', () => {
      this.mainWindow?.webContents.send('window:maximize-change', false);
    });

    this.mainWindow.on('close', () => {
      this.saveWindowState();
    });

    // In dev: load Vite dev server URL. In production: load dist/index.html
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
      this.mainWindow.loadURL(devServerUrl);
    } else {
      const indexPath = path.join(__dirname, '../dist/index.html');
      this.mainWindow.loadFile(indexPath);
    }
  }

  private registerIpcHandlers(): void {
    // 1. Window Controls
    ipcMain.handle('window:minimize', () => this.mainWindow?.minimize());
    ipcMain.handle('window:maximize', () => this.mainWindow?.maximize());
    ipcMain.handle('window:unmaximize', () => this.mainWindow?.unmaximize());
    ipcMain.handle('window:close', () => this.mainWindow?.close());
    ipcMain.handle('window:isMaximized', () => this.mainWindow?.isMaximized() ?? false);

    // 2. Native File Dialogs
    ipcMain.handle('dialog:openMediaFiles', async () => {
      if (!this.mainWindow) return null;
      const res = await dialog.showOpenDialog(this.mainWindow, {
        title: 'Import Media Assets into Kōri',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Video & Audio Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wav', 'mp3', 'aac', 'flac', 'png', 'jpg', 'jpeg'] },
          { name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] },
          { name: 'Audio', extensions: ['wav', 'mp3', 'aac', 'flac'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      return res.canceled ? null : res.filePaths;
    });

    ipcMain.handle('dialog:openProjectFile', async () => {
      if (!this.mainWindow) return null;
      const res = await dialog.showOpenDialog(this.mainWindow, {
        title: 'Open Kōri Project',
        properties: ['openFile'],
        filters: [{ name: 'Kōri Project (*.kori)', extensions: ['kori', 'json'] }],
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      const filePath = res.filePaths[0];
      const raw = fs.readFileSync(filePath, 'utf8');
      return { filePath, data: JSON.parse(raw) };
    });

    ipcMain.handle('dialog:saveProjectFile', async (_, data: ProjectSaveData, currentPath?: string) => {
      if (!this.mainWindow) return null;
      let targetPath = currentPath;
      if (!targetPath) {
        const res = await dialog.showSaveDialog(this.mainWindow, {
          title: 'Save Kōri Project',
          defaultPath: `${data.name || 'Untitled'}.kori`,
          filters: [{ name: 'Kōri Project (*.kori)', extensions: ['kori'] }],
        });
        if (res.canceled || !res.filePath) return null;
        targetPath = res.filePath;
      }
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
      return targetPath;
    });

    ipcMain.handle('dialog:saveExportDialog', async (_, defaultName: string, format: 'mp4' | 'mov') => {
      if (!this.mainWindow) return null;
      const res = await dialog.showSaveDialog(this.mainWindow, {
        title: 'Export Rendered Master Video',
        defaultPath: `${defaultName}.${format}`,
        filters: [
          format === 'mp4'
            ? { name: 'MP4 Video (*.mp4)', extensions: ['mp4'] }
            : { name: 'QuickTime Movie (*.mov)', extensions: ['mov'] },
        ],
      });
      return res.canceled ? null : res.filePath || null;
    });

    ipcMain.handle('dialog:relinkMissingFile', async (_, fileName: string) => {
      if (!this.mainWindow) return null;
      const res = await dialog.showOpenDialog(this.mainWindow, {
        title: `Relink Missing File: ${fileName}`,
        properties: ['openFile'],
      });
      return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
    });

    // 3. Native Media Processing (ffmpeg / ffprobe)
    ipcMain.handle('media:probe', async (_, filePath: string) => {
      return await FfmpegService.probeMedia(filePath);
    });

    ipcMain.handle('media:generateProxy', async (_, filePath: string, targetHeight?: number) => {
      return await FfmpegService.generateProxy(filePath, this.cacheDir, targetHeight, (p) => {
        this.mainWindow?.webContents.send('media:proxyProgress', p);
      });
    });

    ipcMain.handle('media:detectScenes', async (_, filePath: string, threshold?: number) => {
      return await FfmpegService.detectScenesNative(filePath, this.cacheDir, threshold);
    });

    ipcMain.handle('media:extractAudioPcm', async (_, filePath: string) => {
      return await FfmpegService.extractAudioPcm(filePath, this.cacheDir);
    });

    // 4. AI & Frame Interpolation (RIFE + Held Frames + Dynamic Model Download & SHA-256)
    ipcMain.handle('ai:checkModelStatus', async (_, modelName) => {
      return ModelManager.isModelReady(modelName);
    });

    ipcMain.handle('ai:downloadModel', async (_, modelName) => {
      return await ModelManager.downloadModel(modelName, (p) => {
        this.mainWindow?.webContents.send('ai:modelProgress', p);
      });
    });

    ipcMain.handle('ai:verifyModelSha256', async (_, modelName) => {
      return ModelManager.verifyModelSha256(modelName);
    });

    ipcMain.handle('ai:getModelRegistry', async () => {
      return MODEL_REGISTRY;
    });

    ipcMain.handle('ai:interpolateFrames', async (_, config: RifeInterpolationConfig) => {
      return await RifeService.interpolateFrames(config);
    });

    ipcMain.handle('ai:segmentCharacterForeground', async (_, imagePath: string) => {
      return await RifeService.segmentCharacterForeground(imagePath);
    });

    // 5. Native Exporter
    ipcMain.handle('exporter:startExport', async (_, config: ExportJobConfig) => {
      return await FfmpegService.exportMasterVideo(config, (p) => {
        this.mainWindow?.webContents.send('exporter:progress', p);
      });
    });

    ipcMain.handle('exporter:getAvailableEncoders', async () => {
      return await FfmpegService.getAvailableEncoders();
    });

    // 6. Cache & Storage
    ipcMain.handle('storage:getCacheDir', () => this.cacheDir);
    ipcMain.handle('storage:clearCache', () => {
      try {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        console.warn('Failed to clear cache', err);
      }
    });

    ipcMain.handle('storage:saveAutoRecovery', async (_, data: ProjectSaveData) => {
      try {
        fs.writeFileSync(this.autosavePath, JSON.stringify(data), 'utf8');
      } catch (err) {
        console.warn('Failed to save auto recovery', err);
      }
    });

    ipcMain.handle('storage:loadAutoRecovery', async () => {
      try {
        if (fs.existsSync(this.autosavePath)) {
          const raw = fs.readFileSync(this.autosavePath, 'utf8');
          return JSON.parse(raw);
        }
      } catch {
        // No recovery file
      }
      return null;
    });

    ipcMain.handle('storage:checkFileExists', async (_, filePath: string) => {
      return fs.existsSync(filePath);
    });
  }
}

const desktopApp = new KoriDesktopApp();
desktopApp.init();
