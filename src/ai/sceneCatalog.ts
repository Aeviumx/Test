import { VideoSceneAnalysis } from './videoAnalysis';

export interface SceneQueryFilter {
  minEpicness?: number;
  maxEpicness?: number;
  minMotion?: number;
  suitability?: 'drop' | 'buildup' | 'intro' | 'outro' | 'chill';
  shotScale?: 'extreme-close' | 'close' | 'medium' | 'wide';
  motionDirection?: 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'static';
  excludeJunk?: boolean; // exclude hardsubs, watermarks, talking heads, duplicates
  excludeLetterbox?: boolean; // exclude letterbox (or allow auto-crop if false)
}

export interface GeminiVisionTagResult {
  character?: string;
  action?: string;
  emotion?: string;
  epicness: number; // 0..10
  suitability: Array<'drop' | 'buildup' | 'intro' | 'outro' | 'chill'>;
}

/**
 * Scene Catalog:
 * Stores, queries, filters, and caches deep material analyses for anime edit generation.
 */
export class SceneCatalog {
  private scenes: Map<string, VideoSceneAnalysis> = new Map();
  private cachePrefix = 'kori_scene_cache_';

  constructor(initialScenes?: VideoSceneAnalysis[]) {
    if (initialScenes) {
      for (const scene of initialScenes) {
        this.scenes.set(scene.id, scene);
      }
    }
  }

  public registerScene(scene: VideoSceneAnalysis): void {
    this.scenes.set(scene.id, scene);
  }

  public getScene(id: string): VideoSceneAnalysis | undefined {
    return this.scenes.get(id);
  }

  public getAllScenes(): VideoSceneAnalysis[] {
    return Array.from(this.scenes.values());
  }

  /**
   * Filter scenes by semantic parameters, ensuring junk clips are filtered out
   */
  public query(filter: SceneQueryFilter): VideoSceneAnalysis[] {
    return Array.from(this.scenes.values()).filter((scene) => {
      // 1. Junk filtering
      if (filter.excludeJunk !== false) {
        if (scene.junkFlags.hasHardsub) return false;
        if (scene.junkFlags.hasWatermark) return false;
        if (scene.junkFlags.isStaticTalkingHead) return false;
        if (scene.junkFlags.isDuplicate) return false;
        if (filter.excludeLetterbox && scene.junkFlags.hasLetterbox) return false;
      }

      // 2. Motion threshold
      if (filter.minMotion !== undefined && scene.motionIntensity < filter.minMotion) {
        return false;
      }

      // 3. Framing
      if (filter.shotScale && scene.shotScale !== filter.shotScale) {
        return false;
      }

      // 4. Direction
      if (filter.motionDirection && scene.motionDirection !== filter.motionDirection) {
        return false;
      }

      // 5. Epicness
      const epicness = scene.visionTags?.epicness ?? 5;
      if (filter.minEpicness !== undefined && epicness < filter.minEpicness) {
        return false;
      }
      if (filter.maxEpicness !== undefined && epicness > filter.maxEpicness) {
        return false;
      }

      // 6. Section Suitability
      if (filter.suitability) {
        const suits = scene.visionTags?.suitability;
        if (!suits || !suits.includes(filter.suitability)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Selects the highest quality scene for a drop climax
   */
  public getBestClimaxScene(): VideoSceneAnalysis | undefined {
    const candidates = this.query({
      minEpicness: 8,
      minMotion: 0.5,
      suitability: 'drop',
      excludeJunk: true,
    });

    if (candidates.length === 0) {
      // Fallback to highest motion scene
      return Array.from(this.scenes.values()).sort(
        (a, b) => b.motionIntensity - a.motionIntensity
      )[0];
    }

    return candidates.sort((a, b) => (b.visionTags?.epicness ?? 0) - (a.visionTags?.epicness ?? 0))[0];
  }

  /**
   * Client-side Vision API enrichment interface with caching
   */
  public async enrichWithVisionTags(
    sceneId: string,
    keyframeDataUrls: string[],
    callGeminiVision?: (frames: string[]) => Promise<GeminiVisionTagResult>
  ): Promise<VideoSceneAnalysis | undefined> {
    const scene = this.scenes.get(sceneId);
    if (!scene) return undefined;

    // Check localStorage / IndexedDB cache first
    const cacheKey = `${this.cachePrefix}${scene.assetId}_${scene.inPoint}_${scene.outPoint}`;
    try {
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          scene.visionTags = JSON.parse(cached);
          return scene;
        }
      }
    } catch {
      // Ignore storage errors
    }

    if (callGeminiVision && keyframeDataUrls.length > 0) {
      try {
        const tags = await callGeminiVision(keyframeDataUrls);
        scene.visionTags = tags;

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify(tags));
        }
      } catch (err) {
        console.warn(`Vision analysis failed for scene ${sceneId}, using heuristic fallback`, err);
      }
    }

    return scene;
  }
}
