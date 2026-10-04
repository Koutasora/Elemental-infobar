import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Czcionki dołączone do pluginu (JetBrains Mono, Iosevka, Fira Code, IBM Plex Mono, VT323, Press Start 2P – licencja SIL OFL-1.1).
 * Rysujemy je jako ścieżki SVG z kształtów znaków zapisanych w fonts/<nazwa>.json (patrz scripts/gen-fonts.mjs),
 * więc działają bez instalowania czegokolwiek i mają dokładną szerokość tekstu.
 * Znaki, których dana czcionka nie ma, nie są pożyczane z innej czcionki:
 * taki tekst rysuje się czcionką systemową (patrz covers()).
 */
type G = { a: number; d: string };
type Face = { regular: Record<string, G>; bold?: Record<string, G> };

export const BUNDLED_FONTS = ["JetBrains Mono", "Iosevka", "Fira Code", "IBM Plex Mono", "VT323", "Press Start 2P"];

const here = dirname(fileURLToPath(import.meta.url));
const DIRS = [join(here, "..", "fonts"), join(process.cwd(), "com.elemental.infobar.sdPlugin", "fonts")];

const cache = new Map<string, Face | null>();
function load(id: string): Face | null {
	if (cache.has(id)) return cache.get(id) ?? null;
	let face: Face | null = null;
	for (const dir of DIRS) {
		try {
			face = JSON.parse(fs.readFileSync(join(dir, `${id}.json`), "utf8")) as Face;
			break;
		} catch {
			/* spróbuj następnego katalogu */
		}
	}
	cache.set(id, face);
	return face;
}

/** Nazwa dołączonej czcionki (bez względu na wielkość liter) albo undefined. */
export const findBundled = (name: string) => BUNDLED_FONTS.find((n) => n.toLowerCase() === name.trim().toLowerCase());

function glyph(id: string, ch: string, bold: boolean): G | undefined {
	const f = load(id);
	return f ? (bold && f.bold ? f.bold : f.regular)[ch] : undefined;
}

/** Czy czcionka ma wszystkie znaki tekstu (spacja i znaki niedrukowalne się nie liczą)? */
export function covers(id: string, text: string, bold = true): boolean {
	for (const ch of text) if (ch.trim() !== "" && !glyph(id, ch, bold)) return false;
	return load(id) !== null;
}

/** Korekta rozmiaru czcionek, które przy tym samym rozmiarze wyglądają na dużo większe lub mniejsze od pozostałych. */
const SCALE: Record<string, number> = { "Press Start 2P": 0.6, VT323: 1.25 };
const scaleOf = (id: string) => SCALE[id] ?? 1;

/** Dokładna szerokość tekstu w pikselach. */
export function measure(id: string, text: string, size: number, bold: boolean, spacing = 0): number {
	size *= scaleOf(id);
	let w = 0;
	let n = 0;
	for (const ch of text) {
		w += ((glyph(id, ch, bold)?.a ?? 500) * size) / 1000;
		n++;
	}
	return w + spacing * Math.max(0, n - 1);
}

/** Tekst jako grupa ścieżek SVG; zwraca też szerokość. */
export function glyphRun(id: string, text: string, size: number, bold: boolean, x: number, y: number, fill: string, anchor: "start" | "middle" | "end" = "start", spacing = 0): { svg: string; width: number } {
	const width = measure(id, text, size, bold, spacing);
	const k = (size * scaleOf(id)) / 1000;
	const sx = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
	let off = 0;
	let body = "";
	for (const ch of text) {
		const g = glyph(id, ch, bold);
		if (g?.d) body += `<path transform="translate(${off.toFixed(1)} 0)" d="${g.d}"/>`;
		off += (g?.a ?? 500) + spacing / k;
	}
	return { svg: `<g transform="translate(${sx.toFixed(2)} ${y}) scale(${k.toFixed(5)})" fill="${fill}">${body}</g>`, width };
}
