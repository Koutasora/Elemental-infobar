import { autoColor } from "./modes";
import { resolveTz, zoned } from "./clock";
import type { Sensors, Settings } from "./types";

/**
 * Boczne diody Neo (dwie kreski przy pasku) przyjmują kolor z obrazu na pasku, w praktyce z jego najwyraźniejszego,
 * nasyconego koloru, czyli u nas z koloru akcentu (napis dnia, sekundy, paski, wskaźniki). Dlatego diodami sterujemy
 * wyłącznie przez kolor akcentu, bez żadnej dodatkowej linii: efekty poniżej zmieniają kolor akcentu w czasie.
 * Wyłączyć diod się nie da, a czerń nie narzuca koloru (sprawdził użytkownik).
 */
export type LedCtx = { s: Settings; now: Date; accent: string; sensors: Sensors; ms: number };

const HEX = /^#[0-9a-f]{6}$/i;

const toRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

function hsl(h: number, s: number, l: number): number[] {
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// kolor nieba w ciągu doby (godzina -> kolor)
const DAY: [number, string][] = [[0, "#0b1a4a"], [5, "#25207a"], [6.5, "#ff7a3d"], [9, "#ffd36b"], [12, "#7fd8ff"], [16, "#ffe08a"], [18.5, "#ff6a3d"], [20, "#7a3cff"], [22, "#1a2a7a"], [24, "#0b1a4a"]];
const WEEK = ["#a855f7", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6"]; // niedziela ... sobota

/**
 * Efekt koloru akcentu (a więc i bocznych diod) w danej chwili albo null (stały kolor akcentu, tryb domyślny).
 * Zwrócony kolor zastępuje akcent motywu / własny akcent we wszystkich elementach akcentowych.
 */
export function accentEffect(c: LedCtx): string | null {
	const { s } = c;
	switch (s.ledMode) {
		case "rainbow":
			return toHex(hsl(((c.ms / 1000 / 24) % 1) * 360, 1, 0.55)); // pełny obrót barw co 24 s
		case "pulse": {
			const k = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((c.ms / 1000) * ((2 * Math.PI) / 3.5))); // oddech co 3,5 s
			return toHex(toRgb(HEX.test(c.accent) ? c.accent : "#38bdf8").map((v) => v * k));
		}
		case "temp": {
			const t = [c.sensors.cpu?.temp, c.sensors.gpu?.temp].filter((v): v is number => typeof v === "number");
			return t.length ? autoColor(Math.max(...t), 70, 85) : null;
		}
		case "hours": {
			const z = zoned(c.now, resolveTz(s.tz, s.customTz));
			const h = z.h + z.mi / 60;
			for (let i = 1; i < DAY.length; i++) {
				if (h <= DAY[i][0]) {
					const [h0, c0] = DAY[i - 1];
					const [h1, c1] = DAY[i];
					return toHex(mix(toRgb(c0), toRgb(c1), (h - h0) / (h1 - h0)));
				}
			}
			return DAY[0][1];
		}
		case "weekday":
			return WEEK[zoned(c.now, resolveTz(s.tz, s.customTz)).dow];
		case "alert": {
			const hot = (c.sensors.cpu?.temp ?? 0) >= 85 || (c.sensors.gpu?.temp ?? 0) >= 83;
			return hot ? (Math.floor(c.ms / 500) % 2 === 0 ? "#ff2d2d" : "#7a1010") : null; // przy przegrzaniu akcent miga na czerwono
		}
		default:
			return null;
	}
}
