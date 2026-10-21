import { globalFrameCache } from '../render/FrameCache';

export interface GoogleFontCatalogItem {
  family: string;
  category: 'Sans-Serif' | 'Display' | 'Serif' | 'Monospace' | 'Handwriting';
}

export const GOOGLE_FONTS_CATALOG: GoogleFontCatalogItem[] = [
  { family: 'Inter', category: 'Sans-Serif' },
  { family: 'Orbitron', category: 'Display' },
  { family: 'Montserrat', category: 'Sans-Serif' },
  { family: 'Space Grotesk', category: 'Sans-Serif' },
  { family: 'Playfair Display', category: 'Serif' },
  { family: 'JetBrains Mono', category: 'Monospace' },
  { family: 'Roboto', category: 'Sans-Serif' },
  { family: 'Poppins', category: 'Sans-Serif' },
  { family: 'Plus Jakarta Sans', category: 'Sans-Serif' },
  { family: 'DM Sans', category: 'Sans-Serif' },
  { family: 'Manrope', category: 'Sans-Serif' },
  { family: 'Rubik', category: 'Sans-Serif' },
  { family: 'Raleway', category: 'Sans-Serif' },
  { family: 'Nunito', category: 'Sans-Serif' },
  { family: 'Work Sans', category: 'Sans-Serif' },
  { family: 'Oswald', category: 'Display' },
  { family: 'Bebas Neue', category: 'Display' },
  { family: 'Anton', category: 'Display' },
  { family: 'Syne', category: 'Display' },
  { family: 'Unbounded', category: 'Display' },
  { family: 'Righteous', category: 'Display' },
  { family: 'Press Start 2P', category: 'Display' },
  { family: 'Cinzel', category: 'Serif' },
  { family: 'Merriweather', category: 'Serif' },
  { family: 'Lora', category: 'Serif' },
  { family: 'Cormorant Garamond', category: 'Serif' },
  { family: 'PT Serif', category: 'Serif' },
  { family: 'Fira Code', category: 'Monospace' },
  { family: 'Source Code Pro', category: 'Monospace' },
  { family: 'Space Mono', category: 'Monospace' },
  { family: 'Pacifico', category: 'Handwriting' },
  { family: 'Caveat', category: 'Handwriting' },
  { family: 'Permanent Marker', category: 'Handwriting' },
];

const injectedFontFamilies = new Set<string>([
  'Inter',
  'JetBrains Mono',
  'Montserrat',
  'Orbitron',
  'Playfair Display',
  'Space Grotesk',
]);

const loadedFontSpecs = new Set<string>();
const inFlightFontPromises = new Map<string, Promise<boolean>>();

function injectGoogleFontStylesheet(family: string): void {
  if (typeof document === 'undefined') return;
  const clean = family.trim();
  if (!clean || injectedFontFamilies.has(clean)) return;
  injectedFontFamilies.add(clean);

  const encoded = encodeURIComponent(clean).replace(/%20/g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap`;
  document.head.appendChild(link);
}

/**
 * Checks synchronously if the given font spec has already been verified loaded
 */
export function isGoogleFontReady(
  fontFamily: string,
  fontWeight = '700',
  fontStyle = 'normal'
): boolean {
  const specKey = `${fontStyle}:${fontWeight}:${fontFamily.trim()}`;
  return loadedFontSpecs.has(specKey);
}

/**
 * Dynamically injects Google Fonts stylesheet if needed and waits for the browser FontFaceSet to load it
 */
export async function ensureGoogleFontLoaded(
  fontFamily: string,
  fontWeight = '700',
  fontStyle = 'normal',
  onLoaded?: () => void
): Promise<boolean> {
  const cleanFamily = fontFamily.trim() || 'Inter';
  const specKey = `${fontStyle}:${fontWeight}:${cleanFamily}`;
  if (loadedFontSpecs.has(specKey)) {
    return true;
  }

  injectGoogleFontStylesheet(cleanFamily);

  const existingPromise = inFlightFontPromises.get(specKey);
  if (existingPromise) {
    return existingPromise;
  }

  const loadPromise = (async () => {
    try {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        const cssFontSpec = `${fontStyle} ${fontWeight} 48px "${cleanFamily}"`;
        await Promise.race([
          document.fonts.load(cssFontSpec, 'MOTIONFORGE 0123456789'),
          new Promise((resolve) => setTimeout(resolve, 1800)),
        ]);
      }
      loadedFontSpecs.add(specKey);
      globalFrameCache.invalidateAll();
      onLoaded?.();
      return true;
    } catch {
      loadedFontSpecs.add(specKey);
      return false;
    } finally {
      inFlightFontPromises.delete(specKey);
    }
  })();

  inFlightFontPromises.set(specKey, loadPromise);
  return loadPromise;
}
