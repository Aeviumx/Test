export interface CachedFrameEntry {
  key: string;
  compId: string;
  frameIndex: number;
  width: number;
  height: number;
  transparentBg: boolean;
  byteSize: number;
  bitmap: ImageBitmap | null;
  canvas: HTMLCanvasElement | null;
}

const DEFAULT_MAX_CACHE_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GB LRU limit

export class FrameCacheManager {
  private revision = 0;
  private maxBytes = DEFAULT_MAX_CACHE_BYTES;
  private totalBytes = 0;
  private hits = 0;
  private misses = 0;

  // Map preserves insertion order; re-inserting on access implements O(1) LRU
  private lruEntries = new Map<string, CachedFrameEntry>();
  private cachedFramesByComp = new Map<string, Set<number>>();
  private listeners = new Set<() => void>();
  private lastNotifyTime = 0;
  private pendingNotifyTimer: number | null = null;

  public invalidateAll(): void {
    this.revision += 1;
    this.lruEntries.forEach((entry) => {
      if (entry.bitmap && typeof entry.bitmap.close === 'function') {
        try {
          entry.bitmap.close();
        } catch {
          // Ignore close error
        }
      }
      entry.bitmap = null;
      entry.canvas = null;
    });
    this.lruEntries.clear();
    this.cachedFramesByComp.clear();
    this.totalBytes = 0;
    this.notify(true);
  }

  public getRevision(): number {
    return this.revision;
  }

  public getMaxBytes(): number {
    return this.maxBytes;
  }

  public setMaxBytes(bytes: number): void {
    this.maxBytes = Math.max(64 * 1024 * 1024, bytes);
    this.evictIfNeeded(0);
    this.notify(true);
  }

  public getTotalBytes(): number {
    return this.totalBytes;
  }

  public getStats(): {
    entryCount: number;
    totalBytes: number;
    maxBytes: number;
    hits: number;
    misses: number;
  } {
    return {
      entryCount: this.lruEntries.size,
      totalBytes: this.totalBytes,
      maxBytes: this.maxBytes,
      hits: this.hits,
      misses: this.misses,
    };
  }

  private buildKey(
    compId: string,
    frameIndex: number,
    width: number,
    height: number,
    transparentBg: boolean
  ): string {
    return `${compId}:${frameIndex}:${width}x${height}:${transparentBg ? 1 : 0}`;
  }

  /**
   * Retrieves a cached frame (ImageBitmap or Canvas) and promotes it to Most-Recently-Used in the LRU map
   */
  public getFrame(
    compId: string,
    frameIndex: number,
    width: number,
    height: number,
    transparentBg = false
  ): ImageBitmap | HTMLCanvasElement | null {
    const key = this.buildKey(compId, frameIndex, width, height, transparentBg);
    const entry = this.lruEntries.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    const source = entry.bitmap ?? entry.canvas;
    if (!source) {
      this.lruEntries.delete(key);
      this.misses += 1;
      return null;
    }

    // Promote to MRU by deleting and re-inserting
    this.lruEntries.delete(key);
    this.lruEntries.set(key, entry);
    this.hits += 1;
    return source;
  }

  /**
   * Stores a rendered frame into the LRU cache (synchronously via offscreen canvas and asynchronously upgraded to ImageBitmap)
   */
  public storeFrame(
    compId: string,
    frameIndex: number,
    sourceCanvas: HTMLCanvasElement,
    transparentBg = false
  ): void {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    if (width <= 0 || height <= 0) return;

    const key = this.buildKey(compId, frameIndex, width, height, transparentBg);
    const existing = this.lruEntries.get(key);
    if (existing) {
      this.lruEntries.delete(key);
      this.lruEntries.set(key, existing);
      return;
    }

    const byteSize = width * height * 4;
    if (byteSize > this.maxBytes) return;

    this.evictIfNeeded(byteSize);

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = width;
    snapCanvas.height = height;
    const ctx = snapCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(sourceCanvas, 0, 0);

    const capturedRev = this.revision;
    const entry: CachedFrameEntry = {
      key,
      compId,
      frameIndex,
      width,
      height,
      transparentBg,
      byteSize,
      bitmap: null,
      canvas: snapCanvas,
    };

    this.lruEntries.set(key, entry);
    this.totalBytes += byteSize;

    let set = this.cachedFramesByComp.get(compId);
    if (!set) {
      set = new Set<number>();
      this.cachedFramesByComp.set(compId, set);
    }
    set.add(frameIndex);

    // Upgrade to hardware ImageBitmap asynchronously with flipY for WebGL compatibility
    if (typeof createImageBitmap === 'function') {
      void createImageBitmap(snapCanvas, { imageOrientation: 'flipY' })
        .then((bmp) => {
          if (this.revision !== capturedRev || !this.lruEntries.has(key)) {
            bmp.close();
            return;
          }
          entry.bitmap = bmp;
          entry.canvas = null;
        })
        .catch(() => {
          // Keep snapCanvas fallback if createImageBitmap fails
        });
    }

    this.notify(false);
  }

  private evictIfNeeded(incomingBytes: number): void {
    while (this.totalBytes + incomingBytes > this.maxBytes && this.lruEntries.size > 0) {
      const oldestKey = this.lruEntries.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.lruEntries.get(oldestKey);
      this.lruEntries.delete(oldestKey);
      if (oldest) {
        this.totalBytes = Math.max(0, this.totalBytes - oldest.byteSize);
        if (oldest.bitmap && typeof oldest.bitmap.close === 'function') {
          try {
            oldest.bitmap.close();
          } catch {
            // Ignore
          }
        }
        oldest.bitmap = null;
        oldest.canvas = null;

        // Check if any other resolution entry still caches this frameIndex for oldest.compId
        let stillHasFrame = false;
        this.lruEntries.forEach((e) => {
          if (e.compId === oldest.compId && e.frameIndex === oldest.frameIndex) {
            stillHasFrame = true;
          }
        });
        if (!stillHasFrame) {
          this.cachedFramesByComp.get(oldest.compId)?.delete(oldest.frameIndex);
        }
      }
    }
  }

  public markFrameCached(compId: string, frameIndex: number): void {
    let set = this.cachedFramesByComp.get(compId);
    if (!set) {
      set = new Set<number>();
      this.cachedFramesByComp.set(compId, set);
    }
    if (!set.has(frameIndex)) {
      set.add(frameIndex);
      this.notify(false);
    }
  }

  public isFrameCached(compId: string, frameIndex: number): boolean {
    return this.cachedFramesByComp.get(compId)?.has(frameIndex) ?? false;
  }

  public getCachedFrames(compId: string): Set<number> {
    return this.cachedFramesByComp.get(compId) ?? new Set<number>();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(immediate = false): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (immediate || now - this.lastNotifyTime >= 250) {
      if (this.pendingNotifyTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(this.pendingNotifyTimer);
        this.pendingNotifyTimer = null;
      }
      this.lastNotifyTime = now;
      this.listeners.forEach((fn) => fn());
    } else if (this.pendingNotifyTimer === null && typeof window !== 'undefined') {
      this.pendingNotifyTimer = window.setTimeout(() => {
        this.pendingNotifyTimer = null;
        this.lastNotifyTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.listeners.forEach((fn) => fn());
      }, 250);
    }
  }
}

export const globalFrameCache = new FrameCacheManager();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__MF_FRAME_CACHE__ = globalFrameCache;
}
