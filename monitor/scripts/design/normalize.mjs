// Value normalization for audit.mjs: colors to #rrggbb plus alpha, box-shadows
// to a canonical layer list, radii, font families. Pure functions, no DOM.

const NAMED = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  red: [255, 0, 0, 1],
  currentcolor: null,
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const to8 = (v) => Math.round(clamp01(v) * 255);

function num(tok, pctScale = 1) {
  tok = tok.trim();
  if (tok === 'none') return 0;
  if (tok.endsWith('%')) return (parseFloat(tok) / 100) * pctScale;
  return parseFloat(tok);
}
const hue = (tok) => {
  tok = tok.trim();
  if (tok.endsWith('turn')) return parseFloat(tok) * 360;
  if (tok.endsWith('rad')) return (parseFloat(tok) * 180) / Math.PI;
  if (tok.endsWith('grad')) return parseFloat(tok) * 0.9;
  return parseFloat(tok);
};

/** Splits "a b c / d" or "a, b, c, d" into [components, alpha]. */
function components(inner) {
  let alpha;
  let body = inner;
  const slash = inner.lastIndexOf('/');
  if (slash >= 0) {
    alpha = inner.slice(slash + 1).trim();
    body = inner.slice(0, slash);
  }
  const parts = body.includes(',') ? body.split(',').map((s) => s.trim()) : body.trim().split(/\s+/);
  if (alpha === undefined && parts.length === 4) alpha = parts.pop();
  return [parts, alpha === undefined ? 1 : clamp01(num(alpha))];
}

const srgbGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const srgbLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function linearSrgbToRgb(r, g, b) {
  return [to8(srgbGamma(r)), to8(srgbGamma(g)), to8(srgbGamma(b))];
}

function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return linearSrgbToRgb(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  );
}

function labToRgb(L, a, b) {
  // CIE Lab (D50) -> XYZ D50 -> XYZ D65 (Bradford) -> linear sRGB
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const e = 216 / 24389, k = 24389 / 27;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const X = xr * 0.3457 / 0.3585, Y = yr, Z = zr * (1 - 0.3457 - 0.3585) / 0.3585;
  const x = 0.9554734527042182 * X - 0.023098536874261423 * Y + 0.0632593086610217 * Z;
  const y = -0.028369706963208136 * X + 1.0099954580058226 * Y + 0.021041398966943008 * Z;
  const z = 0.012314001688319899 * X - 0.020507696433477912 * Y + 1.3303659366080753 * Z;
  return linearSrgbToRgb(
    3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
  );
}

function p3ToRgb(r, g, b) {
  const [R, G, B] = [r, g, b].map(srgbLinear);
  const X = 0.4865709486482162 * R + 0.26566769316909306 * G + 0.1982172852343625 * B;
  const Y = 0.2289745640697488 * R + 0.6917385218365064 * G + 0.079286914093745 * B;
  const Z = 0 * R + 0.04511338185890264 * G + 1.043944368900976 * B;
  return linearSrgbToRgb(
    3.2409699419045226 * X - 1.537383177570094 * Y - 0.4986107602930034 * Z,
    -0.9692436362808796 * X + 1.8759675015077202 * Y + 0.04155505740717559 * Z,
    0.05563007969699366 * X - 0.20397695888897652 * Y + 1.0569715142428786 * Z,
  );
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [to8(f(0)), to8(f(8)), to8(f(4))];
}

/** Parses any CSS color Chrome can compute (and hex/named authoring forms). Returns {r,g,b,a} or null. */
export function parseColor(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (s in NAMED) {
    const v = NAMED[s];
    return v ? { r: v[0], g: v[1], b: v[2], a: v[3] } : null;
  }
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null;
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
  }
  const m = /^([a-z-]+)\((.*)\)$/.exec(s);
  if (!m) return null;
  const [, fn, inner] = m;
  try {
    if (fn === 'rgb' || fn === 'rgba') {
      const [p, a] = components(inner);
      const ch = p.map((t) => (t.endsWith('%') ? (parseFloat(t) / 100) * 255 : parseFloat(t)));
      return { r: Math.round(ch[0]), g: Math.round(ch[1]), b: Math.round(ch[2]), a };
    }
    if (fn === 'hsl' || fn === 'hsla') {
      const [p, a] = components(inner);
      const [r, g, b] = hslToRgb(hue(p[0]), num(p[1].endsWith('%') ? p[1] : p[1] + '%'), num(p[2].endsWith('%') ? p[2] : p[2] + '%'));
      return { r, g, b, a };
    }
    if (fn === 'oklab' || fn === 'oklch' || fn === 'lab' || fn === 'lch') {
      const [p, a] = components(inner);
      const isOk = fn.startsWith('ok');
      const L = isOk ? num(p[0], 1) : num(p[0], 100);
      let A, B;
      if (fn.endsWith('lch')) {
        const C = isOk ? num(p[1], 0.4) : num(p[1], 150);
        const H = (hue(p[2]) * Math.PI) / 180;
        A = C * Math.cos(H);
        B = C * Math.sin(H);
      } else {
        A = isOk ? num(p[1], 0.4) : num(p[1], 125);
        B = isOk ? num(p[2], 0.4) : num(p[2], 125);
      }
      const [r, g, b] = isOk ? oklabToRgb(L, A, B) : labToRgb(L, A, B);
      return { r, g, b, a };
    }
    if (fn === 'color') {
      const sp = /^\s*([a-z0-9-]+)\s+(.*)$/.exec(inner);
      if (!sp) return null;
      const space = sp[1];
      const [p, a] = components(sp[2]);
      const v = p.map((t) => num(t, 1));
      let rgb;
      if (space === 'srgb') rgb = v.map(to8);
      else if (space === 'srgb-linear') rgb = linearSrgbToRgb(v[0], v[1], v[2]);
      else if (space === 'display-p3') rgb = p3ToRgb(v[0], v[1], v[2]);
      else return null;
      return { r: rgb[0], g: rgb[1], b: rgb[2], a };
    }
  } catch {
    return null;
  }
  return null;
}

const hex2 = (n) => n.toString(16).padStart(2, '0');
const fmtAlpha = (a) => String(Math.round(a * 1000) / 1000);

/** "#rrggbb" for opaque colors, "#rrggbb/0.6" otherwise. */
export function fmtColor(c) {
  if (!c) return null;
  const hex = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a >= 0.999 ? hex : `${hex}/${fmtAlpha(c.a)}`;
}

export const normColor = (s) => {
  const c = parseColor(s);
  return c ? fmtColor(c) : String(s);
};

/** Allow-list check: same rgb (±1 per channel for color-space rounding) and, unless allowAlpha, the same alpha. */
export function colorAllowed(value, allowed, allowAlpha) {
  const c = typeof value === 'string' ? parseColor(value) : value;
  if (!c) return false;
  return allowed.some((a) => {
    if (!a) return false;
    const same = Math.abs(a.r - c.r) <= 1 && Math.abs(a.g - c.g) <= 1 && Math.abs(a.b - c.b) <= 1;
    return same && (allowAlpha || Math.abs(a.a - c.a) <= 0.01);
  });
}

// ---------------------------------------------------------------- shadows

/** Splits on commas/whitespace that are not inside parentheses. */
function splitTop(s, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && (sep === ',' ? ch === ',' : /\s/.test(ch))) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function lengthPx(tok) {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(tok);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? v * 16 : v;
}

/** Parses a box-shadow (computed or authored) into layers {inset,x,y,blur,spread,color}. null means unparseable. */
export function parseShadow(s) {
  if (s == null) return null;
  s = String(s).trim();
  if (s === '' || s === 'none') return [];
  const layers = [];
  for (const layer of splitTop(s, ',')) {
    const L = { inset: false, lengths: [], color: null };
    for (const tok of splitTop(layer, ' ')) {
      if (tok === 'inset') L.inset = true;
      else if (lengthPx(tok) !== null) L.lengths.push(lengthPx(tok));
      else {
        const c = parseColor(tok);
        if (!c) return null;
        L.color = c;
      }
    }
    if (L.lengths.length < 2) return null;
    const [x, y, blur = 0, spread = 0] = L.lengths;
    layers.push({ inset: L.inset, x, y, blur, spread, color: L.color ?? { r: 0, g: 0, b: 0, a: 1 } });
  }
  return layers;
}

export function fmtShadow(layers) {
  if (!layers) return null;
  if (!layers.length) return 'none';
  return layers.map((l) => `${l.inset ? 'inset ' : ''}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${fmtColor(l.color)}`).join(', ');
}

export function shadowEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((l, i) => {
    const m = b[i];
    const close = (p, q) => Math.abs(p - q) <= 0.5;
    return (
      l.inset === m.inset && close(l.x, m.x) && close(l.y, m.y) && close(l.blur, m.blur) && close(l.spread, m.spread) &&
      colorAllowed(l.color, [m.color], false)
    );
  });
}

// ---------------------------------------------------------------- radii, fonts, numbers

/** One corner: "10px", "50%", or "10px 4px" when elliptical. */
export function normCorner(v) {
  const parts = String(v).trim().split(/\s+/);
  const norm = parts.map((p) => (p === '0' ? '0px' : p));
  return norm.length === 2 && norm[0] === norm[1] ? norm[0] : norm.join(' ');
}

export function cornerAllowed(corner, radii) {
  return corner.split(' ').every((part) =>
    radii.some((r) => {
      const rr = typeof r === 'number' ? `${r}px` : String(r).trim() === '0' ? '0px' : String(r).trim();
      if (part.endsWith('%') || rr.endsWith('%')) return part === rr;
      return Math.abs(parseFloat(part) - parseFloat(rr)) <= 0.5;
    }),
  );
}

/** First family of a font-family list, quotes stripped. */
export function firstFamily(ff) {
  const first = splitTop(String(ff ?? ''), ',')[0] ?? '';
  return first.replace(/^['"]|['"]$/g, '').trim();
}

/** Within ±tol px of an allowed value. Exclusive, so a half step (10.5 vs 11) is off-list but rounding noise (11.67, 31.94) is not. */
export const nearIn = (v, list, tol = 0.5) => list.some((x) => Math.abs(parseFloat(x) - v) < tol);
