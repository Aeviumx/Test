export class FrameCacheManager {
  private revision = 0;
  private cachedFramesByComp = new Map<string, Set<number>>();
  private listeners = new Set<() => void>();
  private lastNotifyTime = 0;
  private pendingNotifyTimer: number | null = null;

  public invalidateAll(): void {
    this.revision += 1;
    this.cachedFramesByComp.clear();
    this.notify(true);
  }

  public getRevision(): number {
    return this.revision;
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
