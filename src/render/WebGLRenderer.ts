import {
  BlendMode,
  Composition,
  EffectInstance,
  EffectType,
  Layer,
  MediaAsset,
  Project,
  TrackMatteType,
  Vec2,
} from '../types';
import { hexToRgba } from '../utils/color';
import { ensureGoogleFontLoaded, isGoogleFontReady } from '../utils/fontLoader';
import { sampleBezierPath } from '../utils/geometry';
import {
  applyTrimPathsToPolyline,
  computeLayerWorldMatrix,
  evaluateLayerTransform,
  evaluateProperty,
} from './rendererHelpers';
import {
  COMPOSITE_FRAGMENT_SHADER,
  EFFECT_FRAGMENT_SHADER,
  FULLSCREEN_VERTEX_SHADER,
} from './shaders';

interface FboTarget {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
}

const BLEND_MODE_INDEX: Record<BlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  add: 4,
  darken: 5,
  lighten: 6,
  difference: 7,
  'color-dodge': 8,
};

const MATTE_MODE_INDEX: Record<TrackMatteType, number> = {
  none: 0,
  alpha: 1,
  'alpha-inverted': 2,
  luma: 3,
  'luma-inverted': 4,
};

const EFFECT_TYPE_INDEX: Record<EffectType, number> = {
  'gaussian-blur': 0,
  'directional-blur': 1,
  glow: 2,
  'drop-shadow': 3,
  'brightness-contrast': 4,
  'hue-saturation': 5,
  curves: 6,
  fill: 7,
  tint: 8,
  'gradient-ramp': 9,
  noise: 10,
  'fractal-noise': 11,
  'chromatic-aberration': 12,
  'wave-warp': 13,
  'turbulent-displace': 14,
  vignette: 15,
};

export class WebGLCompositionRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private effectProgram: WebGLProgram | null = null;
  private compositeProgram: WebGLProgram | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;

  private sceneFboA: FboTarget | null = null;
  private sceneFboB: FboTarget | null = null;
  private layerFboA: FboTarget | null = null;
  private layerFboB: FboTarget | null = null;
  private matteFbo: FboTarget | null = null;
  private uploadTex: WebGLTexture | null = null;

  private rasterCanvas: HTMLCanvasElement;
  private rasterCtx: CanvasRenderingContext2D;
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D;

  private imageCache = new Map<string, HTMLImageElement>();
  private videoCache = new Map<string, HTMLVideoElement>();
  private onAssetLoadedCallback?: () => void;

  constructor(canvas: HTMLCanvasElement, onAssetLoaded?: () => void) {
    this.canvas = canvas;
    this.onAssetLoadedCallback = onAssetLoaded;
    this.rasterCanvas = document.createElement('canvas');
    const rCtx = this.rasterCanvas.getContext('2d');
    if (!rCtx) throw new Error('2D context unavailable');
    this.rasterCtx = rCtx;

    this.maskCanvas = document.createElement('canvas');
    const mCtx = this.maskCanvas.getContext('2d');
    if (!mCtx) throw new Error('2D mask context unavailable');
    this.maskCtx = mCtx;

    this.initWebGL();
  }

  private initWebGL(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return;
    this.gl = gl;

    this.effectProgram = this.createProgram(gl, FULLSCREEN_VERTEX_SHADER, EFFECT_FRAGMENT_SHADER);
    this.compositeProgram = this.createProgram(gl, FULLSCREEN_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const quadData = new Float32Array([
      // x, y, u, v
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    this.quadVao = vao;

    this.uploadTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.uploadTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  private ensureFbo(target: FboTarget | null, width: number, height: number): FboTarget | null {
    const gl = this.gl;
    if (!gl) return null;
    if (target && target.width === width && target.height === height) {
      return target;
    }
    if (target) {
      gl.deleteFramebuffer(target.fbo);
      gl.deleteTexture(target.tex);
    }

    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) return null;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo, tex, width, height };
  }

  /**
   * Renders the given composition at `time` (seconds) onto the WebGL2 canvas
   */
  public renderComposition(
    comp: Composition,
    time: number,
    project: Project,
    resolutionScale = 1,
    transparentBackground = false
  ): void {
    const renderW = Math.max(16, Math.round(comp.width * resolutionScale));
    const renderH = Math.max(16, Math.round(comp.height * resolutionScale));

    if (this.canvas.width !== renderW || this.canvas.height !== renderH) {
      this.canvas.width = renderW;
      this.canvas.height = renderH;
    }
    if (this.rasterCanvas.width !== renderW || this.rasterCanvas.height !== renderH) {
      this.rasterCanvas.width = renderW;
      this.rasterCanvas.height = renderH;
      this.maskCanvas.width = renderW;
      this.maskCanvas.height = renderH;
    }

    const gl = this.gl;
    if (!gl || !this.effectProgram || !this.compositeProgram || !this.quadVao) {
      return;
    }

    this.sceneFboA = this.ensureFbo(this.sceneFboA, renderW, renderH);
    this.sceneFboB = this.ensureFbo(this.sceneFboB, renderW, renderH);
    this.layerFboA = this.ensureFbo(this.layerFboA, renderW, renderH);
    this.layerFboB = this.ensureFbo(this.layerFboB, renderW, renderH);
    this.matteFbo = this.ensureFbo(this.matteFbo, renderW, renderH);

    if (!this.sceneFboA || !this.sceneFboB || !this.layerFboA || !this.layerFboB || !this.matteFbo) {
      return;
    }

    gl.viewport(0, 0, renderW, renderH);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.quadVao);

    // Clear initial sceneFboA with composition background color
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFboA.fbo);
    const bgRgba = hexToRgba(comp.backgroundColor, transparentBackground ? 0 : 1);
    gl.clearColor(bgRgba[0], bgRgba[1], bgRgba[2], bgRgba[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let currentScene = this.sceneFboA;
    let nextScene = this.sceneFboB;

    const anySolo = comp.layers.some((l) => l.solo);

    // Collect layers consumed as Track Matte sources so they act solely as masks and aren't rendered on top
    const trackMatteSourceIds = new Set<string>();
    for (let i = 0; i < comp.layers.length; i++) {
      const l = comp.layers[i];
      if (l.trackMatteType !== 'none' && (anySolo ? l.solo : l.visible)) {
        const matteLayer = l.trackMatteLayerId
          ? comp.layers.find((m) => m.id === l.trackMatteLayerId)
          : comp.layers[i - 1];
        if (matteLayer) {
          trackMatteSourceIds.add(matteLayer.id);
        }
      }
    }

    // Render bottom-to-top (in AE, index 0 is top of stack, so we iterate from layers.length - 1 down to 0)
    for (let idx = comp.layers.length - 1; idx >= 0; idx--) {
      const layer = comp.layers[idx];
      if (layer.type === 'audio' || layer.type === 'null' || layer.type === 'camera') {
        continue;
      }
      if (trackMatteSourceIds.has(layer.id)) {
        continue;
      }
      if (anySolo ? !layer.solo : !layer.visible) {
        continue;
      }
      if (time < layer.inPoint || time > layer.outPoint) {
        continue;
      }

      const layerTr = evaluateLayerTransform(layer, time, comp, idx);
      const layerOpacity = Math.max(0, Math.min(100, layerTr.opacity)) / 100;
      if (layerOpacity <= 0.0001) continue;

      if (layer.type === 'adjustment') {
        // Adjustment layer reads `currentScene` into `layerFboA`, runs its effect stack, masks it, and blends back
        this.copyFbo(currentScene, this.layerFboA, renderW, renderH);
        const processedFbo = this.runEffectStack(
          layer,
          comp,
          time,
          idx,
          this.layerFboA,
          this.layerFboB,
          renderW,
          renderH,
          resolutionScale
        );

        // Composite adjustment layer back onto currentScene -> nextScene
        this.compositeLayerPass(
          currentScene.tex,
          processedFbo.tex,
          processedFbo.tex,
          layer.blendMode,
          'none',
          layerOpacity,
          nextScene.fbo,
          renderW,
          renderH
        );
        const tmp = currentScene;
        currentScene = nextScene;
        nextScene = tmp;
        continue;
      }

      // Fast path for unmasked full-comp Solid layers: clear layerFboA directly on GPU without 2D Canvas upload
      const hasEnabledMasks = layer.masks.some((m) => m.enabled);
      const hasEnabledEffects = layer.effects.some((fx) => fx.enabled);
      let layerTexForComposite: WebGLTexture = this.layerFboA.tex;

      if (
        layer.type === 'solid' &&
        !hasEnabledMasks &&
        !layer.parentId &&
        layer.width === comp.width &&
        layer.height === comp.height &&
        layerTr.scale[0] === 100 &&
        layerTr.scale[1] === 100 &&
        layerTr.rotation === 0
      ) {
        const solidRgba = hexToRgba(layer.solidColor ?? '#2c2c54', 1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.layerFboA.fbo);
        gl.viewport(0, 0, renderW, renderH);
        gl.clearColor(solidRgba[0], solidRgba[1], solidRgba[2], solidRgba[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else {
        // Rasterize the layer into rasterCanvas in composition space
        this.rasterizeLayerToCanvas(
          this.rasterCtx,
          layer,
          comp,
          time,
          idx,
          project,
          resolutionScale
        );
        this.uploadCanvasToFbo(this.rasterCanvas, this.layerFboA, renderW, renderH);
        layerTexForComposite = this.layerFboA.tex;
      }

      // Run GPU Shader Effects stack for this layer if any are enabled
      if (hasEnabledEffects) {
        const afterEffectsFbo = this.runEffectStack(
          layer,
          comp,
          time,
          idx,
          this.layerFboA,
          this.layerFboB,
          renderW,
          renderH,
          resolutionScale
        );
        layerTexForComposite = afterEffectsFbo.tex;
      }

      // Check Track Matte
      let matteMode: TrackMatteType = layer.trackMatteType;
      let matteTex = layerTexForComposite;
      if (matteMode !== 'none') {
        const matteLayer = layer.trackMatteLayerId
          ? comp.layers.find((l) => l.id === layer.trackMatteLayerId)
          : comp.layers[idx - 1];
        if (matteLayer) {
          const matteIdx = comp.layers.indexOf(matteLayer);
          this.rasterizeLayerToCanvas(
            this.rasterCtx,
            matteLayer,
            comp,
            time,
            matteIdx >= 0 ? matteIdx : 0,
            project,
            resolutionScale
          );
          this.uploadCanvasToFbo(this.rasterCanvas, this.matteFbo, renderW, renderH);
          matteTex = this.matteFbo.tex;
        } else {
          matteMode = 'none';
        }
      }

      // Composite layer onto scene
      this.compositeLayerPass(
        currentScene.tex,
        layerTexForComposite,
        matteTex,
        layer.blendMode,
        matteMode,
        layerOpacity,
        nextScene.fbo,
        renderW,
        renderH
      );

      const swap = currentScene;
      currentScene = nextScene;
      nextScene = swap;
    }

    // Final blit from currentScene to default screen framebuffer (0)
    this.blitToScreen(currentScene.tex, renderW, renderH);
    gl.bindVertexArray(null);
  }

  /**
   * Fast-path blit of a cached ImageBitmap or HTMLCanvasElement directly to the WebGL2 screen framebuffer
   */
  public drawCachedFrame(
    source: ImageBitmap | HTMLCanvasElement,
    width: number,
    height: number
  ): boolean {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const gl = this.gl;
    if (!gl || !this.uploadTex || !this.effectProgram || !this.quadVao) {
      return false;
    }

    gl.bindVertexArray(this.quadVao);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, this.uploadTex);
    const isImageBitmap = typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap;
    if (!isImageBitmap) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (!isImageBitmap) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    this.blitToScreen(this.uploadTex, width, height);
    gl.bindVertexArray(null);
    return true;
  }

  private uploadCanvasToFbo(
    sourceCanvas: HTMLCanvasElement,
    targetFbo: FboTarget,
    width: number,
    height: number
  ): void {
    const gl = this.gl;
    if (!gl || !this.uploadTex || !this.compositeProgram) return;

    gl.bindTexture(gl.TEXTURE_2D, this.uploadTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.effectProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.uploadTex);
    gl.uniform1i(gl.getUniformLocation(this.effectProgram!, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(this.effectProgram!, 'u_resolution'), width, height);
    gl.uniform1i(gl.getUniformLocation(this.effectProgram!, 'u_effectType'), -1); // Passthrough
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private copyFbo(src: FboTarget, dst: FboTarget, width: number, height: number): void {
    const gl = this.gl;
    if (!gl || !this.effectProgram) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.effectProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(gl.getUniformLocation(this.effectProgram, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(this.effectProgram, 'u_resolution'), width, height);
    gl.uniform1i(gl.getUniformLocation(this.effectProgram, 'u_effectType'), -1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private runEffectStack(
    layer: Layer,
    comp: Composition,
    time: number,
    layerIndex: number,
    fboA: FboTarget,
    fboB: FboTarget,
    width: number,
    height: number,
    resolutionScale: number
  ): FboTarget {
    const gl = this.gl;
    if (!gl || !this.effectProgram) return fboA;

    const enabledEffects = layer.effects.filter((fx) => fx.enabled);
    if (enabledEffects.length === 0) return fboA;

    let readFbo = fboA;
    let writeFbo = fboB;

    gl.useProgram(this.effectProgram);
    gl.uniform2f(gl.getUniformLocation(this.effectProgram, 'u_resolution'), width, height);

    for (const fx of enabledEffects) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo.fbo);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readFbo.tex);
      gl.uniform1i(gl.getUniformLocation(this.effectProgram, 'u_tex'), 0);

      this.bindEffectUniforms(gl, this.effectProgram, fx, comp, layer, time, layerIndex, resolutionScale);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      const tmp = readFbo;
      readFbo = writeFbo;
      writeFbo = tmp;
    }

    return readFbo;
  }

  private bindEffectUniforms(
    gl: WebGL2RenderingContext,
    prog: WebGLProgram,
    fx: EffectInstance,
    comp: Composition,
    layer: Layer,
    time: number,
    layerIndex: number,
    resolutionScale: number
  ): void {
    const typeIdx = EFFECT_TYPE_INDEX[fx.type] ?? -1;
    gl.uniform1i(gl.getUniformLocation(prog, 'u_effectType'), typeIdx);

    const num = (key: string, fallback = 0): number => {
      const p = fx.params[key];
      if (!p) return fallback;
      const val = evaluateProperty(p, time, comp, layer, layerIndex);
      return typeof val === 'number' ? val : fallback;
    };

    const col = (key: string, fallback = '#ffffff') => {
      const p = fx.params[key];
      const hex = p ? String(evaluateProperty(p, time, comp, layer, layerIndex)) : fallback;
      return hexToRgba(hex, 1);
    };

    const vec = (key: string, fallback: Vec2 = [0, 0]): Vec2 => {
      const p = fx.params[key];
      if (!p) return fallback;
      const val = evaluateProperty(p, time, comp, layer, layerIndex);
      return Array.isArray(val) ? val : fallback;
    };

    let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    let v0: Vec2 = [0, 0];
    let v1: Vec2 = [0, 0];
    let c0 = [1, 1, 1, 1];
    let c1 = [0, 0, 0, 1];

    switch (fx.type) {
      case 'gaussian-blur':
        p0 = num('radius', 18) * resolutionScale;
        p1 = num('horizontal', 100);
        p2 = num('vertical', 100);
        break;
      case 'directional-blur':
        p0 = num('angle', 45);
        p1 = num('length', 24) * resolutionScale;
        break;
      case 'glow':
        p0 = num('threshold', 35);
        p1 = num('radius', 32) * resolutionScale;
        p2 = num('intensity', 1.4);
        c0 = col('color', '#8cc4ec');
        break;
      case 'drop-shadow':
        p0 = num('opacity', 75);
        p1 = num('angle', 135);
        p2 = num('distance', 16) * resolutionScale;
        p3 = num('softness', 20) * resolutionScale;
        c0 = col('color', '#000000');
        break;
      case 'brightness-contrast':
        p0 = num('brightness', 0);
        p1 = num('contrast', 20);
        break;
      case 'hue-saturation':
        p0 = num('hue', 0);
        p1 = num('saturation', 0);
        p2 = num('lightness', 0);
        break;
      case 'curves':
        p0 = num('shadows', 0);
        p1 = num('midtones', 0);
        p2 = num('highlights', 0);
        p3 = num('sCurve', 25);
        break;
      case 'fill':
        p0 = num('opacity', 100);
        c0 = col('color', '#8cc4ec');
        break;
      case 'tint':
        p0 = num('amount', 100);
        c0 = col('blackColor', '#0b0d11');
        c1 = col('whiteColor', '#8cc4ec');
        break;
      case 'gradient-ramp': {
        const sp = vec('startPoint', [0, 0]);
        const ep = vec('endPoint', [comp.width, comp.height]);
        v0 = [sp[0] * resolutionScale, sp[1] * resolutionScale];
        v1 = [ep[0] * resolutionScale, ep[1] * resolutionScale];
        c0 = col('startColor', '#8cc4ec');
        c1 = col('endColor', '#4f86b5');
        p0 = num('blend', 0);
        break;
      }
      case 'noise':
        p0 = num('amount', 15);
        p1 = num('colorNoise', 1);
        p2 = num('seed', 1) + Math.round(time * comp.fps);
        break;
      case 'fractal-noise':
        p0 = num('contrast', 120);
        p1 = num('brightness', 0);
        p2 = num('scale', 120) * resolutionScale;
        p3 = num('evolution', 0);
        p4 = num('blend', 65);
        break;
      case 'chromatic-aberration':
        p0 = num('offsetX', 8) * resolutionScale;
        p1 = num('offsetY', 2) * resolutionScale;
        p2 = num('radial', 60);
        break;
      case 'wave-warp':
        p0 = num('height', 14) * resolutionScale;
        p1 = num('width', 80) * resolutionScale;
        p2 = num('direction', 90);
        p3 = num('phase', 0);
        break;
      case 'turbulent-displace':
        p0 = num('amount', 28) * resolutionScale;
        p1 = num('size', 100) * resolutionScale;
        p2 = num('evolution', 0);
        break;
      case 'vignette':
        p0 = num('amount', 55);
        p1 = num('midpoint', 50);
        p2 = num('feather', 45);
        break;
    }

    gl.uniform1f(gl.getUniformLocation(prog, 'u_p0'), p0);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_p1'), p1);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_p2'), p2);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_p3'), p3);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_p4'), p4);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_v0'), v0[0], v0[1]);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_v1'), v1[0], v1[1]);
    gl.uniform4f(gl.getUniformLocation(prog, 'u_c0'), c0[0], c0[1], c0[2], c0[3]);
    gl.uniform4f(gl.getUniformLocation(prog, 'u_c1'), c1[0], c1[1], c1[2], c1[3]);
  }

  private compositeLayerPass(
    baseTex: WebGLTexture,
    layerTex: WebGLTexture,
    matteTex: WebGLTexture,
    blendMode: BlendMode,
    matteMode: TrackMatteType,
    opacity: number,
    targetFbo: WebGLFramebuffer,
    width: number,
    height: number
  ): void {
    const gl = this.gl;
    if (!gl || !this.compositeProgram) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.compositeProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseTex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_baseTex'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, layerTex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_layerTex'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, matteTex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_matteTex'), 2);

    gl.uniform1i(
      gl.getUniformLocation(this.compositeProgram, 'u_blendMode'),
      BLEND_MODE_INDEX[blendMode] ?? 0
    );
    gl.uniform1i(
      gl.getUniformLocation(this.compositeProgram, 'u_matteMode'),
      MATTE_MODE_INDEX[matteMode] ?? 0
    );
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_opacity'), opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private blitToScreen(tex: WebGLTexture, width: number, height: number): void {
    const gl = this.gl;
    if (!gl || !this.effectProgram) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.effectProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(this.effectProgram, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(this.effectProgram, 'u_resolution'), width, height);
    gl.uniform1i(gl.getUniformLocation(this.effectProgram, 'u_effectType'), -1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Rasterizes a single layer (Solid, Shape, Text, Image, Video, Precomp) with its World Transform & Masks
   */
  private rasterizeLayerToCanvas(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    comp: Composition,
    time: number,
    layerIndex: number,
    project: Project,
    resolutionScale: number
  ): void {
    const rw = ctx.canvas.width;
    const rh = ctx.canvas.height;
    ctx.clearRect(0, 0, rw, rh);
    ctx.save();
    ctx.scale(resolutionScale, resolutionScale);

    const worldMat = computeLayerWorldMatrix(layer, comp, time);
    ctx.transform(worldMat[0], worldMat[1], worldMat[2], worldMat[3], worldMat[4], worldMat[5]);

    if (layer.type === 'solid') {
      ctx.fillStyle = layer.solidColor ?? '#2c2c54';
      ctx.fillRect(0, 0, layer.width, layer.height);
    } else if (layer.type === 'shape' && layer.shapeContents) {
      this.drawShapeLayer(ctx, layer, comp, time, layerIndex);
    } else if (layer.type === 'text' && layer.textContents) {
      this.drawTextLayer(ctx, layer, comp, time, layerIndex);
    } else if (layer.type === 'image' && layer.assetId) {
      const asset = project.assets.find((a) => a.id === layer.assetId);
      if (asset) {
        const img = this.getOrLoadImage(asset);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0, layer.width, layer.height);
        }
      }
    } else if (layer.type === 'video' && layer.assetId) {
      const asset = project.assets.find((a) => a.id === layer.assetId);
      if (asset) {
        const vid = this.getOrLoadVideo(asset, Math.max(0, time - layer.startTime));
        if (vid && vid.readyState >= 2) {
          ctx.drawImage(vid, 0, 0, layer.width, layer.height);
        }
      }
    } else if (layer.type === 'precomp' && layer.compId) {
      const subComp = project.compositions.find((c) => c.id === layer.compId);
      if (subComp && subComp.id !== comp.id) {
        const localTime = Math.max(0, time - layer.startTime);
        for (let sIdx = subComp.layers.length - 1; sIdx >= 0; sIdx--) {
          const subLayer = subComp.layers[sIdx];
          if (!subLayer.visible || localTime < subLayer.inPoint || localTime > subLayer.outPoint) continue;
          ctx.save();
          const subMat = computeLayerWorldMatrix(subLayer, subComp, localTime);
          ctx.transform(subMat[0], subMat[1], subMat[2], subMat[3], subMat[4], subMat[5]);
          if (subLayer.type === 'solid') {
            ctx.fillStyle = subLayer.solidColor ?? '#333';
            ctx.fillRect(0, 0, subLayer.width, subLayer.height);
          } else if (subLayer.type === 'shape' && subLayer.shapeContents) {
            this.drawShapeLayer(ctx, subLayer, subComp, localTime, sIdx);
          } else if (subLayer.type === 'text' && subLayer.textContents) {
            this.drawTextLayer(ctx, subLayer, subComp, localTime, sIdx);
          }
          ctx.restore();
        }
      }
    }

    ctx.restore();

    // Apply Layer Masks if any are enabled
    const enabledMasks = layer.masks.filter((m) => m.enabled);
    if (enabledMasks.length > 0) {
      this.applyLayerMasks(ctx, layer, comp, time, layerIndex, worldMat, resolutionScale);
    }
  }

  private drawShapeLayer(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    comp: Composition,
    time: number,
    layerIndex: number
  ): void {
    const sc = layer.shapeContents;
    if (!sc) return;

    const size = evaluateProperty(sc.size, time, comp, layer, layerIndex);
    const cornerRadius = evaluateProperty(sc.cornerRadius, time, comp, layer, layerIndex);
    const pointsCount = Math.max(3, Math.round(evaluateProperty(sc.points, time, comp, layer, layerIndex)));
    const innerRadiusPct = evaluateProperty(sc.innerRadius, time, comp, layer, layerIndex);
    const fillColor = evaluateProperty(sc.fillColor, time, comp, layer, layerIndex);
    const fillOpacity = evaluateProperty(sc.fillOpacity, time, comp, layer, layerIndex) / 100;
    const strokeColor = evaluateProperty(sc.strokeColor, time, comp, layer, layerIndex);
    const strokeWidth = evaluateProperty(sc.strokeWidth, time, comp, layer, layerIndex);
    const strokeDash = evaluateProperty(sc.strokeDash, time, comp, layer, layerIndex);
    const strokeDashGap = evaluateProperty(sc.strokeDashGap, time, comp, layer, layerIndex);
    const strokeDashOffset = evaluateProperty(sc.strokeDashOffset, time, comp, layer, layerIndex);
    const trimStart = evaluateProperty(sc.trimStart, time, comp, layer, layerIndex);
    const trimEnd = evaluateProperty(sc.trimEnd, time, comp, layer, layerIndex);
    const trimOffset = evaluateProperty(sc.trimOffset, time, comp, layer, layerIndex);

    const cx = layer.width / 2;
    const cy = layer.height / 2;
    const w = size[0];
    const h = size[1];

    // Generate dense polyline points for shape so Trim Paths works uniformly on all shape types!
    const polyPoints = this.buildShapePolyline(
      sc.shapeType,
      cx,
      cy,
      w,
      h,
      cornerRadius,
      pointsCount,
      innerRadiusPct,
      sc.vertices,
      sc.closed
    );

    const isTrimmed = trimStart > 0.05 || trimEnd < 99.95 || Math.abs(trimOffset) > 0.05;
    const finalPoints = isTrimmed
      ? applyTrimPathsToPolyline(polyPoints, trimStart, trimEnd, trimOffset, sc.closed)
      : polyPoints;

    if (finalPoints.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(finalPoints[0][0], finalPoints[0][1]);
    for (let i = 1; i < finalPoints.length; i++) {
      ctx.lineTo(finalPoints[i][0], finalPoints[i][1]);
    }
    if (sc.closed && !isTrimmed) {
      ctx.closePath();
    }

    if (sc.fillEnabled && fillOpacity > 0.001) {
      ctx.save();
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.restore();
    }

    if (sc.strokeEnabled && strokeWidth > 0.05) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = sc.lineCap;
      ctx.lineJoin = sc.lineJoin;
      if (strokeDash > 0.5) {
        ctx.setLineDash([strokeDash, Math.max(1, strokeDashGap)]);
        ctx.lineDashOffset = strokeDashOffset;
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  private buildShapePolyline(
    shapeType: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    cornerRadius: number,
    pointsCount: number,
    innerRadiusPct: number,
    vertices: Layer['shapeContents'] extends undefined ? never : NonNullable<Layer['shapeContents']>['vertices'],
    closed: boolean
  ): Vec2[] {
    const pts: Vec2[] = [];
    const rx = w / 2;
    const ry = h / 2;

    if (shapeType === 'ellipse') {
      const steps = 96;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      return pts;
    }

    if (shapeType === 'polygon') {
      for (let i = 0; i <= pointsCount; i++) {
        const a = (i / pointsCount) * Math.PI * 2 - Math.PI / 2;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      return pts;
    }

    if (shapeType === 'star') {
      const totalVerts = pointsCount * 2;
      const irx = rx * (innerRadiusPct / 100);
      const iry = ry * (innerRadiusPct / 100);
      for (let i = 0; i <= totalVerts; i++) {
        const a = (i / totalVerts) * Math.PI * 2 - Math.PI / 2;
        const isOuter = i % 2 === 0;
        pts.push([
          cx + Math.cos(a) * (isOuter ? rx : irx),
          cy + Math.sin(a) * (isOuter ? ry : iry),
        ]);
      }
      return pts;
    }

    if (shapeType === 'path') {
      if (!vertices || vertices.length === 0) return [];
      const count = closed ? vertices.length : vertices.length - 1;
      const segs = 24;
      for (let i = 0; i < count; i++) {
        const v0 = vertices[i];
        const v1 = vertices[(i + 1) % vertices.length];
        const p0x = v0.x, p0y = v0.y;
        const p1x = v0.x + v0.outX, p1y = v0.y + v0.outY;
        const p2x = v1.x + v1.inX, p2y = v1.y + v1.inY;
        const p3x = v1.x, p3y = v1.y;
        for (let s = 0; s < segs; s++) {
          const t = s / segs;
          const mt = 1 - t;
          pts.push([
            mt * mt * mt * p0x + 3 * mt * mt * t * p1x + 3 * mt * t * t * p2x + t * t * t * p3x,
            mt * mt * mt * p0y + 3 * mt * mt * t * p1y + 3 * mt * t * t * p2y + t * t * t * p3y,
          ]);
        }
      }
      const endV = closed ? vertices[0] : vertices[vertices.length - 1];
      pts.push([endV.x, endV.y]);
      return pts;
    }

    // Default: rectangle with optional cornerRadius
    const r = Math.min(cornerRadius, rx, ry);
    const x0 = cx - rx;
    const y0 = cy - ry;
    const x1 = cx + rx;
    const y1 = cy + ry;
    if (r <= 0.5) {
      return [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ];
    }
    const arcSteps = 10;
    const addCorner = (acx: number, acy: number, startAngle: number) => {
      for (let s = 0; s <= arcSteps; s++) {
        const a = startAngle + (s / arcSteps) * (Math.PI / 2);
        pts.push([acx + Math.cos(a) * r, acy + Math.sin(a) * r]);
      }
    };
    addCorner(x1 - r, y0 + r, -Math.PI / 2);
    addCorner(x1 - r, y1 - r, 0);
    addCorner(x0 + r, y1 - r, Math.PI / 2);
    addCorner(x0 + r, y0 + r, Math.PI);
    pts.push(pts[0]);
    return pts;
  }

  private drawTextLayer(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    comp: Composition,
    time: number,
    layerIndex: number
  ): void {
    const tc = layer.textContents;
    if (!tc || !tc.text) return;

    if (!isGoogleFontReady(tc.fontFamily, tc.fontWeight, tc.fontStyle)) {
      void ensureGoogleFontLoaded(tc.fontFamily, tc.fontWeight, tc.fontStyle, () => {
        this.onAssetLoadedCallback?.();
      });
    }

    const fontSize = evaluateProperty(tc.fontSize, time, comp, layer, layerIndex);
    const fillColor = evaluateProperty(tc.fillColor, time, comp, layer, layerIndex);
    const strokeColor = evaluateProperty(tc.strokeColor, time, comp, layer, layerIndex);
    const strokeWidth = evaluateProperty(tc.strokeWidth, time, comp, layer, layerIndex);
    const tracking = evaluateProperty(tc.tracking, time, comp, layer, layerIndex);
    const lineHeight = evaluateProperty(tc.lineHeight, time, comp, layer, layerIndex);

    const anim = tc.animator;
    const animEnabled = anim.enabled;
    const rangeStart = animEnabled ? evaluateProperty(anim.rangeStart, time, comp, layer, layerIndex) : 0;
    const rangeEnd = animEnabled ? evaluateProperty(anim.rangeEnd, time, comp, layer, layerIndex) : 100;
    const rangeOffset = animEnabled ? evaluateProperty(anim.rangeOffset, time, comp, layer, layerIndex) : 0;
    const animPos = animEnabled ? evaluateProperty(anim.position, time, comp, layer, layerIndex) : ([0, 0] as Vec2);
    const animScale = animEnabled ? evaluateProperty(anim.scale, time, comp, layer, layerIndex) : ([100, 100] as Vec2);
    const animRot = animEnabled ? evaluateProperty(anim.rotation, time, comp, layer, layerIndex) : 0;
    const animOpacity = animEnabled ? evaluateProperty(anim.opacity, time, comp, layer, layerIndex) : 100;

    ctx.font = `${tc.fontStyle} ${tc.fontWeight} ${fontSize}px "${tc.fontFamily}", Inter, sans-serif`;
    ctx.textBaseline = 'middle';

    const lines = tc.text.split(/\r?\n/);
    const totalChars = Math.max(1, tc.text.replace(/\r?\n/g, '').length);
    const lineSpacing = fontSize * lineHeight;
    const totalTextHeight = (lines.length - 1) * lineSpacing;
    const startY = layer.height / 2 - totalTextHeight / 2;

    let globalCharIdx = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const chars = Array.from(line);
      const charWidths = chars.map((ch) => ctx.measureText(ch).width);
      const totalLineWidth =
        charWidths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * tracking;

      let cursorX = layer.width / 2 - totalLineWidth / 2;
      if (tc.textAlign === 'left') cursorX = 40;
      else if (tc.textAlign === 'right') cursorX = layer.width - 40 - totalLineWidth;

      const lineY = startY + lineIdx * lineSpacing;

      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const cw = charWidths[i];
        const charCenterX = cursorX + cw / 2;

        let selectorWeight = 0;
        if (animEnabled) {
          const charPct = (globalCharIdx / Math.max(1, totalChars - 1)) * 100;
          const effStart = rangeStart + rangeOffset;
          const effEnd = rangeEnd + rangeOffset;
          if (anim.shape === 'ramp-up') {
            if (charPct >= effStart) {
              const span = Math.max(1, effEnd - effStart);
              selectorWeight = Math.max(0, Math.min(1, 1 - (charPct - effStart) / span));
            } else {
              selectorWeight = 1;
            }
          } else {
            if (charPct >= effStart && charPct <= effEnd) {
              selectorWeight = 1;
            }
          }
        }

        ctx.save();
        const dx = animPos[0] * selectorWeight;
        const dy = animPos[1] * selectorWeight;
        const sx = 1 + ((animScale[0] / 100 - 1) * selectorWeight);
        const sy = 1 + ((animScale[1] / 100 - 1) * selectorWeight);
        const rotRad = ((animRot * selectorWeight) * Math.PI) / 180;
        const charAlpha = 1 - (1 - animOpacity / 100) * selectorWeight;

        ctx.translate(charCenterX + dx, lineY + dy);
        if (Math.abs(rotRad) > 0.001) ctx.rotate(rotRad);
        if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) ctx.scale(sx, sy);
        ctx.globalAlpha = Math.max(0, Math.min(1, charAlpha));

        ctx.fillStyle = fillColor;
        ctx.fillText(ch, -cw / 2, 0);

        if (tc.strokeEnabled && strokeWidth > 0.1) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.strokeText(ch, -cw / 2, 0);
        }

        ctx.restore();
        cursorX += cw + tracking;
        globalCharIdx += 1;
      }
    }
  }

  private applyLayerMasks(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    comp: Composition,
    time: number,
    layerIndex: number,
    worldMat: [number, number, number, number, number, number],
    resolutionScale: number
  ): void {
    const anyFeathered = layer.masks.some(
      (m) => m.enabled && evaluateProperty(m.feather, time, comp, layer, layerIndex) > 0.5
    );
    const maskDownscale = anyFeathered ? 0.25 : 1;
    const rw = Math.max(16, Math.round(ctx.canvas.width * maskDownscale));
    const rh = Math.max(16, Math.round(ctx.canvas.height * maskDownscale));
    if (this.maskCanvas.width !== rw || this.maskCanvas.height !== rh) {
      this.maskCanvas.width = rw;
      this.maskCanvas.height = rh;
    }
    const mCtx = this.maskCtx;
    mCtx.clearRect(0, 0, rw, rh);
    const effectiveScale = resolutionScale * maskDownscale;

    for (let i = 0; i < layer.masks.length; i++) {
      const mask = layer.masks[i];
      if (!mask.enabled) continue;

      const feather = evaluateProperty(mask.feather, time, comp, layer, layerIndex) * effectiveScale;
      const maskOpacity = evaluateProperty(mask.opacity, time, comp, layer, layerIndex) / 100;
      const expansion = evaluateProperty(mask.expansion, time, comp, layer, layerIndex);

      if (mask.inverted && mask.mode === 'add' && i === 0) {
        mCtx.save();
        mCtx.fillStyle = '#ffffff';
        mCtx.fillRect(0, 0, rw, rh);
        mCtx.restore();
      }

      mCtx.save();
      mCtx.scale(effectiveScale, effectiveScale);
      mCtx.transform(worldMat[0], worldMat[1], worldMat[2], worldMat[3], worldMat[4], worldMat[5]);

      if (mask.mode === 'subtract' || (mask.inverted && mask.mode === 'add')) {
        mCtx.globalCompositeOperation = 'destination-out';
      } else if (mask.mode === 'intersect' && i > 0) {
        mCtx.globalCompositeOperation = 'destination-in';
      } else {
        mCtx.globalCompositeOperation = 'source-over';
      }

      if (feather > 0.5) {
        mCtx.filter = `blur(${feather}px)`;
      }
      mCtx.globalAlpha = Math.max(0, Math.min(1, maskOpacity));
      mCtx.fillStyle = '#ffffff';

      const rx = mask.rect.x - expansion;
      const ry = mask.rect.y - expansion;
      const mw = Math.max(1, mask.rect.width + expansion * 2);
      const mh = Math.max(1, mask.rect.height + expansion * 2);

      mCtx.beginPath();
      if (mask.shapeType === 'path' && mask.vertices.length >= 2) {
        const pts = sampleBezierPath(
          mask.vertices,
          mask.closed || mask.vertices.length >= 3,
          16
        );
        if (pts.length > 0) {
          mCtx.moveTo(pts[0][0], pts[0][1]);
          for (let p = 1; p < pts.length; p++) {
            mCtx.lineTo(pts[p][0], pts[p][1]);
          }
          if (mask.closed || mask.vertices.length >= 3) {
            mCtx.closePath();
          }
        }
      } else if (mask.shapeType === 'ellipse') {
        mCtx.ellipse(rx + mw / 2, ry + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      } else {
        mCtx.rect(rx, ry, mw, mh);
      }
      mCtx.fill();
      if (mask.shapeType === 'path' && Math.abs(expansion) > 0.5) {
        mCtx.lineWidth = Math.abs(expansion) * 2;
        mCtx.lineJoin = 'round';
        mCtx.strokeStyle = '#ffffff';
        if (expansion < 0) {
          mCtx.globalCompositeOperation =
            mCtx.globalCompositeOperation === 'destination-out'
              ? 'source-over'
              : 'destination-out';
        }
        mCtx.stroke();
      }
      mCtx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.maskCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  private getOrLoadImage(asset: MediaAsset): HTMLImageElement | null {
    const cached = this.imageCache.get(asset.id);
    if (cached) return cached;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.onAssetLoadedCallback?.();
    };
    img.src = asset.url;
    this.imageCache.set(asset.id, img);
    return img;
  }

  public async prepareMediaAtTime(
    comp: Composition,
    time: number,
    project: Project
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    for (const layer of comp.layers) {
      if (!layer.visible || time < layer.inPoint || time > layer.outPoint) continue;
      if (layer.type === 'text' && layer.textContents) {
        tasks.push(
          ensureGoogleFontLoaded(
            layer.textContents.fontFamily,
            layer.textContents.fontWeight,
            layer.textContents.fontStyle
          )
        );
      } else if (layer.type === 'precomp' && layer.compId) {
        const subComp = project.compositions.find((c) => c.id === layer.compId);
        if (subComp && subComp.id !== comp.id) {
          for (const subLayer of subComp.layers) {
            if (subLayer.type === 'text' && subLayer.textContents) {
              tasks.push(
                ensureGoogleFontLoaded(
                  subLayer.textContents.fontFamily,
                  subLayer.textContents.fontWeight,
                  subLayer.textContents.fontStyle
                )
              );
            }
          }
        }
      } else if (layer.type === 'image' && layer.assetId) {
        const asset = project.assets.find((a) => a.id === layer.assetId);
        if (asset) {
          const img = this.getOrLoadImage(asset);
          if (img && !img.complete) {
            tasks.push(
              new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              })
            );
          }
        }
      } else if (layer.type === 'video' && layer.assetId) {
        const asset = project.assets.find((a) => a.id === layer.assetId);
        if (asset) {
          const localTime = Math.max(0, time - layer.startTime);
          const vid = this.getOrLoadVideo(asset, localTime);
          if (vid) {
            tasks.push(
              new Promise<void>((resolve) => {
                const syncSeek = () => {
                  const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 1;
                  const target = localTime % dur;
                  if (Math.abs(vid.currentTime - target) < 0.02) {
                    resolve();
                    return;
                  }
                  const onSeeked = () => {
                    vid.removeEventListener('seeked', onSeeked);
                    resolve();
                  };
                  vid.addEventListener('seeked', onSeeked);
                  vid.currentTime = target;
                  setTimeout(onSeeked, 120);
                };
                if (vid.readyState >= 1) {
                  syncSeek();
                } else {
                  vid.addEventListener('loadedmetadata', syncSeek, { once: true });
                  vid.addEventListener('error', () => resolve(), { once: true });
                  setTimeout(() => resolve(), 200);
                }
              })
            );
          }
        }
      }
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  private getOrLoadVideo(asset: MediaAsset, targetTime: number): HTMLVideoElement | null {
    let vid = this.videoCache.get(asset.id);
    if (!vid) {
      vid = document.createElement('video');
      vid.crossOrigin = 'anonymous';
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'auto';
      vid.src = asset.url;
      vid.onloadeddata = () => {
        this.onAssetLoadedCallback?.();
      };
      vid.onseeked = () => {
        this.onAssetLoadedCallback?.();
      };
      this.videoCache.set(asset.id, vid);
    }
    if (vid.readyState >= 1 && Number.isFinite(vid.duration) && vid.duration > 0) {
      const clamped = targetTime % vid.duration;
      if (Math.abs(vid.currentTime - clamped) > 0.09 && !vid.seeking) {
        vid.currentTime = clamped;
      }
    }
    return vid;
  }
}
