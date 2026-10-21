export class FrameCacheManager {
  private revision = 0;
  private cachedFramesByComp = new Map<string, Set<number>>();
  private listeners = new Set<() => void>();

  public invalidateAll(): void {
    this.revision += 1;
    this.cachedFramesByComp.clear();
    this.notify();
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
      this.notify();
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

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}

export const globalFrameCache = new FrameCacheManager();
