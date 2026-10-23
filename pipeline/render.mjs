// Рендер плана в MP4: Skia-canvas (кадры) → ffmpeg (H.264 + звук с нормализацией громкости).
// Рисует ровно то, что описано в плане: карточки интро, кадры, события (панч, тряска, RGB, вспышки).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ffmpegPath, measureLoudness } from './ffmpeg.mjs';
import { frameFor, cardFrame, faceCenter } from './framing.mjs';
import { sourceAt } from './styles/velocity.mjs';

const DECAY = { punch: 13, shake: 9, rgb: 16, flash: 45, colorflash: 12 };
const CARD_W = 760;
const CARD_H = 1360;
const CARD_ENTER = 0.26;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOutCubic = (k) => 1 - (1 - k) ** 3;
const easeInCubic = (k) => k * k * k;
const deg = (d) => (d * Math.PI) / 180;

function envelope(events, type, t) {
  let v = 0;
  for (const e of events) {
    if (e.type !== type || e.t > t + 1e-9) continue;
    const dt = t - e.t;
    if (dt > 1.2) continue;
    v += e.strength * Math.exp(-dt * DECAY[type]);
  }
  return v;
}

function lastEventAge(events, types, t) {
  let age = Infinity;
  for (const e of events) if (types.includes(e.type) && e.t <= t + 1e-9) age = Math.min(age, t - e.t);
  return age;
}

class Renderer {
  constructor(plan) {
    this.plan = plan;
    this.W = plan.width;
    this.H = plan.height;
    this.images = {};
    this.backgrounds = {};
    this.cards = {};
    this.decoded = []; // декодированные диапазоны видео (держим два последних)
    this.frameCanvases = new Map();
  }

  async prepare() {
    const { W, H } = this;
    for (const [id, a] of Object.entries(this.plan.assets)) {
      let img = await loadImage(fs.readFileSync(a.path));
      if (a.kind === 'scene') {
        // огромные сцены уменьшаем до нужного размера заранее — так рендер быстрее
        const need = Math.max(W / a.width, H / a.height) * 1.6;
        if (need < 0.9) {
          const c = createCanvas(Math.round(a.width * need), Math.round(a.height * need));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          img = c;
          img.scaleFromSource = need;
        }
      }
      this.images[id] = img;
      this.backgrounds[id] = this.makeBackground(a, img);
    }
    for (const it of this.plan.cards?.items || []) {
      if (!this.cards[it.asset]) this.cards[it.asset] = this.makeCard(this.plan.assets[it.asset], this.images[it.asset]);
    }
    this.vignette = this.makeVignette();
    this.grain = [0, 1, 2].map((i) => this.makeGrain(i));
    this.scene = createCanvas(W, H);
    this.acc = createCanvas(W, H);
    this.tmp = createCanvas(W, H);
    this.chan = [createCanvas(W, H), createCanvas(W, H), createCanvas(W, H)];
  }

  srcDraw(ctx, id, s, tx, ty) {
    // учитывает заранее уменьшенные сцены
    const img = this.images[id];
    const k = img.scaleFromSource || 1;
    ctx.save();
    ctx.transform(s / k, 0, 0, s / k, tx, ty);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  makeBackground(a, img) {
    const W = Math.round(this.W * 1.18);
    const H = Math.round(this.H * 1.18);
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#06070b';
    g.fillRect(0, 0, W, H);
    // размытый сам арт как фактура фона (дешёвое размытие: маленький холст + растяжение)
    const sw = 180;
    const sh = Math.round((sw * H) / W);
    const small = createCanvas(sw, sh);
    const sg = small.getContext('2d');
    const [bx, by, bw, bh] = a.bbox;
    const sImg = img.scaleFromSource || 1;
    const cover = Math.max(sw / bw, sh / bh) * 1.25;
    sg.filter = 'blur(5px)';
    sg.drawImage(img, bx * sImg, by * sImg, bw * sImg, bh * sImg,
      sw / 2 - (bw * cover) / 2, sh / 2 - (bh * cover) / 2, bw * cover, bh * cover);
    sg.filter = 'none';
    g.globalAlpha = a.kind === 'scene' ? 0.8 : 0.33;
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    g.globalAlpha = 1;
    // свечение в цвет персонажа
    const rg = g.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, H * 0.7);
    rg.addColorStop(0, hexA(a.palette.main, 0.5));
    rg.addColorStop(0.45, hexA(a.palette.dark, 0.45));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    // затемнение к низу
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, 'rgba(0,0,0,0.15)');
    lg.addColorStop(0.7, 'rgba(0,0,0,0.25)');
    lg.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    return c;
  }

  makeCard(a, img) {
    const c = createCanvas(CARD_W, CARD_H);
    const g = c.getContext('2d');
    g.save();
    roundRect(g, 0, 0, CARD_W, CARD_H, 42);
    g.clip();
    const lg = g.createLinearGradient(0, 0, 0, CARD_H);
    lg.addColorStop(0, hexA(a.palette.main, 1));
    lg.addColorStop(0.55, hexA(a.palette.dark, 1));
    lg.addColorStop(1, '#07080c');
    g.fillStyle = lg;
    g.fillRect(0, 0, CARD_W, CARD_H);
    const bg = this.backgrounds[a.id];
    g.globalAlpha = 0.55;
    g.drawImage(bg, (CARD_W - bg.width * 0.75) / 2, 0, bg.width * 0.75, bg.height * 0.75);
    g.globalAlpha = 1;
    const fr = cardFrame(a, CARD_W, CARD_H);
    g.save();
    g.transform(fr.s, 0, 0, fr.s, fr.tx, fr.ty);
    g.drawImage(img, 0, 0);
    g.restore();
    // блик сверху и затемнение снизу
    const sh = g.createLinearGradient(0, 0, CARD_W, CARD_H * 0.6);
    sh.addColorStop(0, 'rgba(255,255,255,0.18)');
    sh.addColorStop(0.35, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, CARD_W, CARD_H);
    const bt = g.createLinearGradient(0, CARD_H * 0.7, 0, CARD_H);
    bt.addColorStop(0, 'rgba(0,0,0,0)');
    bt.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = bt;
    g.fillRect(0, 0, CARD_W, CARD_H);
    g.restore();
    roundRect(g, 3, 3, CARD_W - 6, CARD_H - 6, 40);
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.stroke();
    c.faceInCard = (() => {
      const [fx, fy] = faceCenter(a);
      return [fr.s * fx + fr.tx, fr.s * fy + fr.ty];
    })();
    return c;
  }

  makeVignette() {
    const { W, H } = this;
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    return c;
  }

  makeGrain(seed) {
    const w = 360;
    const h = 640;
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    const im = g.createImageData(w, h);
    let s = 1234567 + seed * 7919;
    for (let i = 0; i < w * h; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = 128 + (((s >> 8) % 64) - 32);
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
      im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c;
  }

  /** Декодирует нужный диапазон кадров сцены (с запасом для смешивания) один раз на кадр эдита. */
  decodeFor(shot) {
    const key = `${shot.clip}:${shot.crop.x}:${shot.ramps[0].srcA}`;
    const hit = this.decoded.find((d) => d.key === key);
    if (hit) return hit;
    const clip = this.plan.clips[shot.clip];
    const srcMin = Math.min(...shot.ramps.map((r) => r.srcA)) - 0.12;
    const srcMax = Math.max(...shot.ramps.map((r) => r.srcB)) + 0.05;
    const first = Math.max(0, Math.floor(srcMin * clip.fps));
    const count = Math.ceil(srcMax * clip.fps) - first + 1;
    const { w, h, x } = shot.crop;
    const r = spawnSync(ffmpegPath(), [
      '-v', 'error', '-ss', (first / clip.fps).toFixed(5), '-i', clip.path, '-frames:v', String(count),
      '-vf', `crop=${w}:${h}:${x}:0,format=rgba`, '-f', 'rawvideo', '-',
    ], { maxBuffer: 2 ** 31 });
    if (r.status !== 0) throw new Error(`ffmpeg не смог декодировать ${clip.path}: ${r.stderr}`);
    const n = Math.floor(r.stdout.length / (w * h * 4));
    const d = { key, first, n, w, h, fps: clip.fps, buf: r.stdout };
    this.decoded.unshift(d);
    if (this.decoded.length > 2) this.decoded.pop();
    for (const k of [...this.frameCanvases.keys()]) if (!this.decoded.some((x) => k.startsWith(x.key + '#'))) this.frameCanvases.delete(k);
    return d;
  }

  frameCanvas(d, i) {
    const idx = Math.max(0, Math.min(d.n - 1, i));
    const key = `${d.key}#${idx}`;
    let c = this.frameCanvases.get(key);
    if (!c) {
      c = createCanvas(d.w, d.h);
      const g = c.getContext('2d');
      const im = g.createImageData(d.w, d.h);
      im.data.set(d.buf.subarray(idx * d.w * d.h * 4, (idx + 1) * d.w * d.h * 4));
      g.putImageData(im, 0, 0);
      this.frameCanvases.set(key, c);
      if (this.frameCanvases.size > 48) this.frameCanvases.delete(this.frameCanvases.keys().next().value);
    }
    return c;
  }

  /** Кадр твикстора в момент t: при разгоне — смешивание нескольких кадров (motion blur). */
  videoImage(shot, t) {
    const d = this.decodeFor(shot);
    if (!this.vblend || this.vblend.width !== d.w || this.vblend.height !== d.h) this.vblend = createCanvas(d.w, d.h);
    const g = this.vblend.getContext('2d');
    const { src, speed } = sourceAt(shot, t);
    const step = (speed * d.fps) / this.plan.fps; // сколько кадров исходника проходит за кадр эдита
    g.globalCompositeOperation = 'source-over';
    if (step > 1.3) {
      const n = Math.min(6, Math.round(step));
      for (let j = 0; j < n; j++) {
        const sj = src - (j / n) * (speed / this.plan.fps);
        g.globalAlpha = 1 / (j + 1);
        g.drawImage(this.frameCanvas(d, Math.round(sj * d.fps) - d.first), 0, 0);
      }
    } else {
      const fi = src * d.fps - d.first;
      const i0 = Math.floor(fi);
      const frac = fi - i0;
      g.globalAlpha = 1;
      g.drawImage(this.frameCanvas(d, i0), 0, 0);
      if (frac > 0.05) {
        g.globalAlpha = frac;
        g.drawImage(this.frameCanvas(d, i0 + 1), 0, 0);
      }
    }
    g.globalAlpha = 1;
    return this.vblend;
  }

  /**
   * Переход у ближайшей склейки: { type, k, phase } или null.
   * phase 'out' — кадр перед склейкой (k: 0 → 1), 'in' — после склейки (только whip, k: 0 → 1).
   */
  transitionAt(t) {
    for (const tr of this.plan.transitions || []) {
      if (t < tr.t && tr.t - t <= tr.duration) return { type: tr.type, k: 1 - (tr.t - t) / tr.duration, phase: 'out' };
      if (tr.type === 'whip' && t >= tr.t && t - tr.t < tr.duration) return { type: tr.type, k: (t - tr.t) / tr.duration, phase: 'in' };
    }
    return null;
  }

  drawVideoShot(ctx, t, shot, extraZoom = 1, offX = 0) {
    const { W, H, plan } = this;
    const img = this.videoImage(shot, t);
    const p = clamp01((t - shot.start) / Math.max(1e-6, shot.end - shot.start));
    const punch = envelope(plan.events, 'punch', t);
    const shake = envelope(plan.events, 'shake', t);
    const zoom = 1.04 * (1 + 0.05 * p) * (1 + 0.09 * punch) * extraZoom;
    // тряска из нескольких частот (как S_Shake): сдвиг, поворот и «дрожание» масштаба
    const sx = 26 * shake * (0.6 * Math.sin(t * 83 + 1.3) + 0.4 * Math.sin(t * 131 + 0.7));
    const sy = 20 * shake * (0.6 * Math.cos(t * 71 + 0.4) + 0.4 * Math.sin(t * 109 + 2.1));
    const rot = 0.03 * shake * Math.sin(t * 57);
    const jitter = 1 + 0.015 * shake * Math.sin(t * 97);
    const ax = W / 2;
    const ay = shot.anchorY * H;
    const s = H / img.height;
    ctx.save();
    ctx.translate(ax + sx + offX, ay + sy);
    ctx.rotate(rot);
    ctx.scale(zoom * jitter, zoom * jitter);
    ctx.translate(-ax, -ay);
    ctx.filter = 'contrast(1.12) saturate(1.25)';
    const x0 = W / 2 - (img.width * s) / 2;
    ctx.drawImage(img, x0, 0, img.width * s, H);
    // при «вжухе» кадр уезжает вбок — освободившееся место заполняем им же, чтобы не было пустоты
    if (offX < 0) ctx.drawImage(img, x0 + W / zoom, 0, img.width * s, H);
    if (offX > 0) ctx.drawImage(img, x0 - W / zoom, 0, img.width * s, H);
    ctx.filter = 'none';
    ctx.restore();
  }

  shotAt(t) {
    const shots = this.plan.shots;
    for (let i = shots.length - 1; i >= 0; i--) if (t >= shots[i].start - 1e-9) return shots[i];
    return shots[0];
  }

  drawBackground(ctx, id, scale, ox, oy) {
    const bg = this.backgrounds[id];
    const { W, H } = this;
    const k = scale;
    ctx.drawImage(bg, W / 2 - (bg.width * k) / 2 + ox, H / 2 - (bg.height * k) / 2 + oy, bg.width * k, bg.height * k);
  }

  drawShot(ctx, t) {
    const { W, H, plan } = this;
    const shot = this.shotAt(t);
    const a = plan.assets[shot.asset];
    const fr = frameFor(a, shot.framing, W, H);
    const p = clamp01((t - shot.start) / Math.max(1e-6, shot.end - shot.start));
    const punch = envelope(plan.events, 'punch', t);
    const shake = envelope(plan.events, 'shake', t);
    const push = shot.zoom ? lerp(shot.zoom[0], shot.zoom[1], p) : 1 + 0.045 * p;
    const zoom = push * (1 + 0.1 * punch);
    const sx = 20 * shake * Math.sin(t * 83 + 1.3);
    const sy = 15 * shake * Math.cos(t * 71 + 0.4);
    const rot = 0.022 * shake * Math.sin(t * 57);
    const [ax0, ay0] = fr.anchor || faceCenter(a);
    const ax = fr.s * ax0 + fr.tx;
    const ay = fr.s * ay0 + fr.ty;

    this.drawBackground(ctx, a.id, 1 + 0.02 * p + 0.03 * punch, sx * 0.4, sy * 0.4);
    // широкий план медленно панорамируется, чтобы зритель увидел весь арт
    const pan = shot.framing === 'wide' ? Math.max(0, fr.s * a.width - W) * (0.5 - p) * 0.8 : 0;
    ctx.save();
    if (shot.framing === 'wide') {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 60;
    }
    ctx.translate(ax + sx + pan, ay + sy);
    ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    ctx.translate(-ax, -ay);
    this.srcDraw(ctx, a.id, fr.s, fr.tx, fr.ty);
    ctx.restore();
  }

  cardState(t) {
    const { W, H, plan } = this;
    const cards = plan.cards;
    const z = t >= cards.zoomStart ? easeInCubic(clamp01((t - cards.zoomStart) / (cards.end - cards.zoomStart))) : 0;
    const slots = {
      center: { x: W / 2, y: H * 0.5, r: -2, s: 0.9 },
      left: { x: W / 2 - 360, y: H * 0.53, r: -13, s: 0.74 },
      right: { x: W / 2 + 360, y: H * 0.53, r: 13, s: 0.74 },
    };
    const items = cards.items.map((it, i) => {
      const k = clamp01((t - it.enter) / CARD_ENTER);
      const e = easeOutCubic(k);
      const tg = slots[it.slot];
      const dir = it.from === 'left' ? -1 : 1;
      const startX = dir > 0 ? W + CARD_W : -CARD_W;
      let x = lerp(startX, tg.x, e);
      let r = lerp(tg.r + dir * 25, tg.r, e) + (k >= 1 ? 0.8 * Math.sin(t * 2.1 + i) : 0);
      if (it.slot !== 'center') x += (it.slot === 'left' ? -1 : 1) * z * 900;
      return { ...it, k, x, y: tg.y, r, s: tg.s, visible: t >= it.enter };
    });
    return { z, items };
  }

  drawCards(ctx, t) {
    const { W, H, plan } = this;
    const { z, items } = this.cardState(t);
    const center = items.find((i) => i.slot === 'center');
    const centerCard = this.cards[center.asset];
    const punch = envelope(plan.events, 'punch', t);
    this.drawBackground(ctx, center.asset, 1 + 0.03 * (t / plan.cards.end) + 0.4 * z, 0, 0);
    // точка зума — лицо на центральной карточке
    const [fx, fy] = centerCard.faceInCard;
    const ax = center.x + (fx - CARD_W / 2) * center.s;
    const ay = center.y + (fy - CARD_H / 2) * center.s;
    const cam = (1 + 0.035 * clamp01(t / plan.cards.end)) * (1 + 2.4 * z) * (1 + 0.05 * punch);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(cam, cam);
    ctx.translate(-ax, -ay);
    for (const slot of ['left', 'right', 'center']) {
      const it = items.find((i) => i.slot === slot);
      if (!it || !it.visible) continue;
      const card = this.cards[it.asset];
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(deg(it.r));
      ctx.scale(it.s, it.s);
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 24;
      ctx.drawImage(card, -CARD_W / 2, -CARD_H / 2);
      ctx.restore();
    }
    ctx.restore();
    return { z, anchor: [ax, ay] };
  }

  /** Сцена без постобработки. mainT — время основного кадра (подкадры motion blur остаются в его шоте). */
  drawRaw(ctx, t, mainT = t) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#06070b';
    ctx.fillRect(0, 0, this.W, this.H);
    if (this.plan.cards && t < this.plan.cards.end) return this.drawCards(ctx, t);
    const shot = this.shotAt(mainT);
    if (shot.type === 'video') {
      const tr = this.transitionAt(mainT);
      let zoom = 1;
      let offX = 0;
      let info = null;
      if (tr && tr.type === 'zoomthrough') {
        zoom = 1 + 0.35 * tr.k * tr.k;
        info = { z: tr.k, anchor: [this.W / 2, shot.anchorY * this.H] };
      } else if (tr && tr.type === 'whip') {
        // старая сцена резко уезжает влево, новая влетает справа и тормозит
        const tt = Math.max(0, Math.min(1, tr.k + (t - mainT) / tr.duration));
        offX = tr.phase === 'out' ? -this.W * 0.55 * tt * tt : this.W * 0.55 * (1 - tt) * (1 - tt);
      }
      this.drawVideoShot(ctx, Math.max(t, shot.start), shot, zoom, offX);
      return info;
    }
    this.drawShot(ctx, t);
    return null;
  }

  needsMotionBlur(t) {
    const plan = this.plan;
    if (plan.cards && t < plan.cards.end) {
      const { items, z } = this.cardState(t);
      return items.some((i) => i.k > 0 && i.k < 1) || z > 0.02;
    }
    return lastEventAge(plan.events, ['punch', 'shake'], t) < 0.14 || this.transitionAt(t) !== null;
  }

  renderFrame(t) {
    const { W, H, plan } = this;
    const fps = plan.fps;
    const acc = this.acc.getContext('2d');
    let info = null;
    if (this.needsMotionBlur(t)) {
      const K = 6;
      const tmp = this.tmp.getContext('2d');
      for (let i = 0; i < K; i++) {
        const ti = t - (i / (K - 1)) * (0.7 / fps);
        const r = this.drawRaw(tmp, ti, t);
        if (i === 0) info = r;
        acc.globalCompositeOperation = 'source-over';
        acc.globalAlpha = 1 / (i + 1);
        acc.drawImage(this.tmp, 0, 0);
      }
      acc.globalAlpha = 1;
    } else {
      info = this.drawRaw(acc, t);
    }

    // RGB-сдвиг на акцентах
    const rgb = envelope(plan.events, 'rgb', t);
    if (rgb > 0.04) this.rgbSplit(acc, Math.min(22, 18 * rgb));

    // радиальный смаз при зуме в дроп
    if (info && info.z > 0.04) this.radialBlur(acc, info.anchor, 0.16 * info.z);

    this.bloom(acc, plan.style === 'velocity' ? 0.22 : 0.16);

    acc.globalCompositeOperation = 'source-over';
    acc.drawImage(this.vignette, 0, 0);
    acc.globalCompositeOperation = 'overlay';
    acc.globalAlpha = 0.35;
    acc.drawImage(this.grain[Math.floor(t * fps) % 3], 0, 0, W, H);
    acc.globalAlpha = 1;

    const cf = plan.events.filter((e) => e.type === 'colorflash' && e.t <= t + 1e-9 && t - e.t < 1);
    for (const e of cf) {
      const v = e.strength * Math.exp(-(t - e.t) * DECAY.colorflash);
      if (v < 0.01) continue;
      acc.globalCompositeOperation = 'screen';
      acc.fillStyle = hexA(e.color, Math.min(1, v));
      acc.fillRect(0, 0, W, H);
    }
    const fl = envelope(plan.events, 'flash', t);
    if (fl > 0.01) {
      acc.globalCompositeOperation = 'screen';
      acc.fillStyle = `rgba(255,255,255,${Math.min(1, fl)})`;
      acc.fillRect(0, 0, W, H);
    }
    acc.globalCompositeOperation = 'source-over';
    if (plan.signature) {
      acc.font = '600 30px sans-serif';
      acc.fillStyle = 'rgba(255,255,255,0.75)';
      acc.fillText(plan.signature, 64, H - 360);
    }
    return this.acc;
  }

  /** Мягкое свечение светлых участков: уменьшенная копия с контрастом и размытием, наложение «экраном». */
  bloom(ctx, amount) {
    if (!this.glow) this.glow = createCanvas(Math.round(this.W / 4), Math.round(this.H / 4));
    const g = this.glow.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.filter = 'brightness(0.85) contrast(1.9) blur(6px)';
    g.drawImage(this.acc, 0, 0, this.glow.width, this.glow.height);
    g.filter = 'none';
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = amount;
    ctx.drawImage(this.glow, 0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  rgbSplit(ctx, off) {
    const { W, H } = this;
    const colors = ['#ff0000', '#00ff00', '#0000ff'];
    this.chan.forEach((c, i) => {
      const g = c.getContext('2d');
      g.globalCompositeOperation = 'source-over';
      g.drawImage(this.acc, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = colors[i];
      g.fillRect(0, 0, W, H);
    });
    // края не оголяем: каналы чуть увеличены
    const k = 1 + (2 * off) / W;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    [-off, 0, off].forEach((dx, i) => {
      ctx.drawImage(this.chan[i], W / 2 - (W * k) / 2 + dx, H / 2 - (H * k) / 2, W * k, H * k);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  radialBlur(ctx, [ax, ay], amount) {
    const { W, H } = this;
    const snap = this.tmp.getContext('2d');
    snap.globalAlpha = 1;
    snap.globalCompositeOperation = 'source-over';
    snap.drawImage(this.acc, 0, 0);
    const K = 8;
    for (let i = 1; i < K; i++) {
      const s = 1 + (amount * i) / (K - 1);
      ctx.globalAlpha = 1 / (i + 1);
      ctx.drawImage(this.tmp, ax - ax * s, ay - ay * s, W * s, H * s);
    }
    ctx.globalAlpha = 1;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Отдельные кадры в PNG — для быстрой визуальной проверки без полного рендера. */
export async function renderStills(plan, times, outDir) {
  const r = new Renderer(plan);
  await r.prepare();
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const t of times) {
    const c = r.renderFrame(t);
    const f = path.join(outDir, `frame_${t.toFixed(3)}.png`);
    fs.writeFileSync(f, await c.encode('png'));
    files.push(f);
  }
  return files;
}

export async function renderPlan(plan, outFile, { onProgress } = {}) {
  const r = new Renderer(plan);
  await r.prepare();
  const { width: W, height: H, fps } = plan;
  const total = Math.round(plan.duration * fps);
  const a = plan.audio;
  const loud = measureLoudness(a.file, a.start, a.duration);
  const fadeOut = Math.max(0, a.duration - 0.08).toFixed(3);
  let norm = loud
    ? `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${loud.input_i}:measured_TP=${loud.input_tp}:measured_LRA=${loud.input_lra}:measured_thresh=${loud.input_thresh}:offset=${loud.target_offset}:linear=true`
    : 'loudnorm=I=-14:TP=-1.5:LRA=11';
  // level=disabled: иначе alimiter после ограничения сам поднимает громкость обратно почти до 0 дБ;
  // предел −2 дБ оставляет запас под пики, которые добавляет сжатие AAC
  norm += ',alimiter=limit=0.79:attack=1:release=50:level=disabled,aresample=48000';
  // звуковые эффекты подмешиваются к музыке до нормализации громкости
  const sfx = plan.sfx || [];
  let fc = `[1:a]afade=t=in:d=0.01,afade=t=out:st=${fadeOut}:d=0.08,aresample=48000,aformat=channel_layouts=stereo[m]`;
  sfx.forEach((x, i) => {
    const fadeSt = Math.max(0, x.dur - x.fade).toFixed(4);
    const ms = Math.round(x.at * 1000);
    fc += `;[${i + 2}:a]atrim=start=${x.trim}:duration=${x.dur},asetpts=PTS-STARTPTS,aresample=48000,` +
      `aformat=channel_layouts=stereo,afade=t=out:st=${fadeSt}:d=${x.fade.toFixed(4)},volume=${x.gain},` +
      `adelay=delays=${ms}:all=1[s${i}]`;
  });
  const mixIn = '[m]' + sfx.map((_, i) => `[s${i}]`).join('');
  fc += sfx.length ? `;${mixIn}amix=inputs=${sfx.length + 1}:normalize=0:duration=first,${norm}[aout]` : `;[m]${norm}[aout]`;
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
    '-ss', String(a.start), '-t', String(a.duration), '-i', a.file,
    ...sfx.flatMap((x) => ['-i', x.file]),
    '-filter_complex', fc, '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outFile,
  ];
  const ff = spawn(ffmpegPath(), args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => {
    ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg завершился с кодом ${code}`))));
    ff.on('error', rej);
  });
  const write = (buf) =>
    new Promise((res) => {
      if (ff.stdin.write(buf)) res();
      else ff.stdin.once('drain', res);
    });
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const c = r.renderFrame(i / fps);
    await write(Buffer.from(c.data()));
    if (onProgress && (i % 30 === 0 || i === total - 1)) onProgress(i + 1, total, (Date.now() - t0) / 1000);
  }
  ff.stdin.end();
  await done;
  return outFile;
}
