// Кадрирование арта: преобразование «пиксели исходника → пиксели кадра» (x' = s·x + tx).
// Общая логика для плана, линтера и рендера, чтобы проверялось ровно то, что рисуется.

export const MAX_UPSCALE = 2.4; // сильнее растягивать арт нельзя — будет мыло

export function frameFor(asset, framing, W, H) {
  const [bx, by, bw, bh] = asset.bbox;
  const f = asset.face;
  switch (framing) {
    case 'full': {
      const s = Math.min((0.88 * H) / bh, (1.25 * W) / bw, MAX_UPSCALE);
      return { s, tx: W / 2 - s * (bx + bw / 2), ty: 0.53 * H - s * (by + bh / 2), anchor: faceCenter(asset) };
    }
    case 'mid':
    case 'close': {
      if (!f) return frameFor(asset, 'full', W, H);
      const target = framing === 'mid' ? 0.13 : 0.26;
      const fy = framing === 'mid' ? 0.33 : 0.42;
      const s = Math.min((target * H) / f[3], MAX_UPSCALE);
      // если арт не позволяет нужное увеличение, опускаем лицо к центру, чтобы в кадре было меньше тела
      const short = framing === 'close' && (s * f[3]) / H < 0.22;
      const [cx, cy] = faceCenter(asset);
      return { s, tx: W / 2 - s * cx, ty: (short ? 0.48 : fy) * H - s * cy, anchor: [cx, cy] };
    }
    case 'wide': {
      // широкий арт в вертикальном кадре: показываем почти всю ширину (видны все лица),
      // сверху и снизу — размытый фон из того же арта (его рисует рендер)
      const s = Math.min((W / asset.width) * 1.35, (H * 0.62) / asset.height);
      const tx = W / 2 - (s * asset.width) / 2;
      const ty = H * 0.46 - (s * asset.height) / 2;
      return { s, tx, ty, anchor: [asset.width / 2, asset.height / 2] };
    }
    default:
      throw new Error(`неизвестное кадрирование ${framing}`);
  }
}

/** Кадрирование внутри карточки интро (размер cw×ch): лицо в верхней трети, видно до пояса. */
export function cardFrame(asset, cw, ch) {
  const f = asset.face;
  if (!f) {
    const [bx, by, bw, bh] = asset.bbox;
    const s = Math.max(cw / bw, (ch * 0.9) / bh);
    return { s, tx: cw / 2 - s * (bx + bw / 2), ty: ch * 0.05 - s * by };
  }
  const s = Math.min((0.13 * ch) / f[3], MAX_UPSCALE);
  const [cx, cy] = faceCenter(asset);
  return { s, tx: cw / 2 - s * cx, ty: 0.27 * ch - s * cy };
}

export function faceCenter(asset) {
  const f = asset.face;
  if (f) return [f[0] + f[2] / 2, f[1] + f[3] / 2];
  const [bx, by, bw, bh] = asset.bbox;
  return [bx + bw / 2, by + bh * 0.15];
}

/** Рамка лица в кадре при дополнительном масштабе zoom вокруг якоря. */
export function faceInFrame(asset, fr, zoom = 1) {
  if (!asset.face) return null;
  const [x, y, w, h] = asset.face;
  const [ax, ay] = fr.anchor || faceCenter(asset);
  const axf = fr.s * ax + fr.tx;
  const ayf = fr.s * ay + fr.ty;
  const map = (px, py) => [axf + (fr.s * px + fr.tx - axf) * zoom, ayf + (fr.s * py + fr.ty - ayf) * zoom];
  const [x0, y0] = map(x, y);
  const [x1, y1] = map(x + w, y + h);
  return [x0, y0, x1 - x0, y1 - y0];
}
