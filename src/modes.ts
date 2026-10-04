import type { Mode, Sensors, Settings, Val } from "./types";
import { cityOf, clockParts, resolveLang, resolveTz, zoned } from "./clock";

export type Theme = { name: string; bg: [string, string]; fg: string; dim: string; accent: string; track: string };

export const THEMES: Record<string, Theme> = {
	black: { name: "Black", bg: ["#000000", "#000000"], fg: "#ffffff", dim: "#9aa4b6", accent: "#38bdf8", track: "#2c3342" },
	midnight: { name: "Midnight", bg: ["#0b1026", "#1f2f6b"], fg: "#f1f5ff", dim: "#9db0e8", accent: "#7dd3fc", track: "#34457f" },
	aurora: { name: "Aurora", bg: ["#03130f", "#0b4a45"], fg: "#effffa", dim: "#8fd0c0", accent: "#34d399", track: "#1d5f58" },
	sunset: { name: "Sunset", bg: ["#1a0b1e", "#6b1d3d"], fg: "#fff7ed", dim: "#f3b9a0", accent: "#fb923c", track: "#7a2c4b" },
	forest: { name: "Forest", bg: ["#07140a", "#17441f"], fg: "#f3ffe8", dim: "#9fc39a", accent: "#a3e635", track: "#245c2e" },
	mono: { name: "Mono", bg: ["#000000", "#000000"], fg: "#ffffff", dim: "#aaaaaa", accent: "#ffffff", track: "#3a3a3a" },
	paper: { name: "Paper", bg: ["#f4f3ee", "#dedbd1"], fg: "#16130f", dim: "#5b574d", accent: "#c2410c", track: "#c4c0b3" },
};

export type Ctx = { now: Date; s: Settings; t: Theme; accent: string; sensors: Sensors; ms: number; smooth?: boolean };

/** Znane czcionki: stos CSS i współczynnik szerokości (względem Segoe UI) do dopasowywania tekstu. */
export const FONTS: Record<string, { css: string; scale: number; mono?: boolean }> = {
	"Segoe UI": { css: "'Segoe UI', Arial, sans-serif", scale: 1 },
	Arial: { css: "Arial, 'Segoe UI', sans-serif", scale: 0.98 },
	Bahnschrift: { css: "Bahnschrift, 'Segoe UI', sans-serif", scale: 0.92 },
	Calibri: { css: "Calibri, 'Segoe UI', sans-serif", scale: 0.9 },
	Cambria: { css: "Cambria, Georgia, serif", scale: 1.02 },
	Consolas: { css: "Consolas, 'Courier New', monospace", scale: 1.0, mono: true },
	"Courier New": { css: "'Courier New', monospace", scale: 1.06, mono: true },
	Georgia: { css: "Georgia, serif", scale: 1.15 },
	Impact: { css: "Impact, 'Arial Narrow', sans-serif", scale: 0.86 },
	"Lucida Console": { css: "'Lucida Console', monospace", scale: 1.08, mono: true },
	Tahoma: { css: "Tahoma, 'Segoe UI', sans-serif", scale: 1.1 },
	"Trebuchet MS": { css: "'Trebuchet MS', 'Segoe UI', sans-serif", scale: 1.04 },
	Verdana: { css: "Verdana, 'Segoe UI', sans-serif", scale: 1.27 },
	"Comic Sans MS": { css: "'Comic Sans MS', 'Segoe UI', sans-serif", scale: 1.12 },
};

let fontCss = FONTS["Segoe UI"].css;
let fontScale = 1;
let fontMono = false;

/** Ustawia czcionkę na czas jednego renderowania (render jest synchroniczny). */
function useFont(s: Settings): void {
	const raw = s.font === "custom" ? (s.customFont ?? "") : (s.font ?? "Segoe UI");
	const name = raw.replace(/[^\p{L}\p{N} .\-]/gu, "").trim().slice(0, 40);
	const known = FONTS[name];
	if (known) {
		fontCss = known.css;
		fontScale = known.scale;
		fontMono = known.mono === true;
	} else if (name) {
		fontCss = `'${name}', 'Segoe UI', Arial, sans-serif`; // dowolna zainstalowana czcionka
		fontScale = 1.12; // zapas na nieznane proporcje
		fontMono = false;
	} else {
		fontCss = FONTS["Segoe UI"].css;
		fontScale = 1;
		fontMono = false;
	}
}
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Przybliżona szerokość tekstu: cyfry ~0.57 em, dwukropek/kropka ~0.3 em, reszta ~0.58 em. */
function tw(v: string, size: number): number {
	let w = 0;
	for (const ch of v) w += /[0-9]/.test(ch) ? 0.57 : /[:.,; ]/.test(ch) ? (fontMono ? 0.58 : 0.3) : 0.58;
	return w * size * fontScale;
}
/** Największy rozmiar czcionki (do maxSize), przy którym tekst mieści się w maxW. */
const fit = (v: string, maxW: number, maxSize: number) => Math.max(7, Math.min(maxSize, Math.floor(maxW / (tw(v, 1) || 1))));

function tx(x: number, y: number, v: string, size: number, fill: string, weight = 400, anchor: "start" | "middle" | "end" = "start", spacing = 0): string {
	return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${fontCss}" font-size="${size}" font-weight="${weight}" fill="${fill}"${spacing ? ` letter-spacing="${spacing}"` : ""}>${esc(v)}</text>`;
}

function wrap(c: Ctx, inner: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="232" height="50" viewBox="0 0 232 50"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.t.bg[0]}"/><stop offset="1" stop-color="${c.t.bg[1]}"/></linearGradient></defs><rect width="232" height="50" fill="url(#bg)"/>${inner}</svg>`;
}

/** zielony -> bursztyn -> czerwony zależnie od progów (jak na klawiszach) */
function autoColor(t: number, warn: number, crit: number): string {
	const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
	const mix = (c1: number[], c2: number[], k: number) => `rgb(${c1.map((v, i) => lerp(v, c2[i], k)).join(",")})`;
	const green = [52, 211, 153], amber = [251, 191, 36], red = [248, 82, 82];
	if (t <= warn - 15) return mix(green, green, 0);
	if (t < warn) return mix(green, amber, (t - (warn - 15)) / 15);
	if (t < crit) return mix(amber, red, (t - warn) / Math.max(1, crit - warn));
	return mix(red, red, 0);
}

function ring(cx: number, cy: number, r: number, frac: number, color: string, track: string, sw: number): string {
	const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)].map((n) => n.toFixed(2));
	const [x0, y0] = pt(135);
	const [xt, yt] = pt(405);
	const end = 135 + 270 * Math.max(0.001, Math.min(1, frac));
	const [x1, y1] = pt(end);
	return `<path d="M${x0} ${y0} A${r} ${r} 0 1 1 ${xt} ${yt}" fill="none" stroke="${track}" stroke-width="${sw}" stroke-linecap="round"/>` +
		(frac > 0 ? `<path d="M${x0} ${y0} A${r} ${r} 0 ${end - 135 > 180 ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>` : "");
}

const TEXTS: Record<string, { day: string; week: string; month: string; year: string; d: string; done: string; pick: string; msg: string }> = {
	en: { day: "DAY", week: "WEEK", month: "MONTH", year: "YEAR", d: "d", done: "Time's up", pick: "Pick a date in settings", msg: "Type a message in settings" },
	pl: { day: "DZIEŃ", week: "TYDZIEŃ", month: "MIESIĄC", year: "ROK", d: "d", done: "Czas minął", pick: "Wybierz datę w ustawieniach", msg: "Wpisz tekst w ustawieniach" },
	de: { day: "TAG", week: "WOCHE", month: "MONAT", year: "JAHR", d: "T", done: "Zeit abgelaufen", pick: "Datum in den Einstellungen wählen", msg: "Text in den Einstellungen eingeben" },
	fr: { day: "JOUR", week: "SEMAINE", month: "MOIS", year: "ANNÉE", d: "j", done: "Terminé", pick: "Choisissez une date", msg: "Saisissez un message" },
	es: { day: "DÍA", week: "SEMANA", month: "MES", year: "AÑO", d: "d", done: "Tiempo agotado", pick: "Elige una fecha", msg: "Escribe un mensaje" },
	it: { day: "GIORNO", week: "SETTIMANA", month: "MESE", year: "ANNO", d: "g", done: "Tempo scaduto", pick: "Scegli una data", msg: "Scrivi un messaggio" },
	cs: { day: "DEN", week: "TÝDEN", month: "MĚSÍC", year: "ROK", d: "d", done: "Čas vypršel", pick: "Vyberte datum", msg: "Napište zprávu" },
	pt: { day: "DIA", week: "SEMANA", month: "MÊS", year: "ANO", d: "d", done: "Tempo esgotado", pick: "Escolha uma data", msg: "Escreva uma mensagem" },
	nl: { day: "DAG", week: "WEEK", month: "MAAND", year: "JAAR", d: "d", done: "Tijd om", pick: "Kies een datum", msg: "Typ een bericht" },
	uk: { day: "ДЕНЬ", week: "ТИЖДЕНЬ", month: "МІСЯЦЬ", year: "РІК", d: "д", done: "Час вийшов", pick: "Оберіть дату", msg: "Введіть текст" },
};
const words = (c: Ctx) => TEXTS[resolveLang(c.s.clockLang).split("-")[0]] ?? TEXTS.en;

// ---------------------------------------------------------------- zegar
function clockMode(c: Ctx): string {
	const { s, t, accent } = c;
	const p = clockParts(c.now, s, resolveTz(s.tz, s.customTz));
	const size = 38;
	// godzina, AM/PM i sekundy w jednym napisie: sekundy zaczynają się zawsze tuż za ostatnią cyfrą, niezależnie od czcionki
	let main = esc(p.time);
	let after = 6 + tw(p.time, size);
	if (p.ampm) {
		main += `<tspan dx="4" font-size="13" font-weight="700" fill="${accent}">${p.ampm}</tspan>`;
		after += 4 + tw(p.ampm, 13);
	}
	if (s.showSeconds === true) {
		main += `<tspan dx="6" font-size="21" font-weight="700" fill="${accent}">${p.sec}</tspan>`;
		after += 6 + tw(p.sec, 21);
	}
	let out = `<text x="6" y="38" font-family="${fontCss}" font-size="${size}" font-weight="700" fill="${t.fg}">${main}</text>`;
	const rx = Math.max(124, Math.round(after + 14));
	const rw = 230 - rx;
	if (p.weekday) {
		out += tx(rx, 21, p.weekday, fit(p.weekday, rw, 19), accent, 700);
		out += tx(rx, 39, p.date, fit(p.date, rw, 15), t.dim, 500);
		if (s.showWeek) out += tx(rx, 49, p.week, 9, t.dim, 600, "start", 1);
	} else {
		out += tx(rx, 27, p.date, fit(p.date, rw, 20), accent, 700);
		if (s.showWeek) out += tx(rx, 44, p.week, 13, t.dim, 600);
	}
	return wrap(c, out);
}

// ---------------------------------------------------------------- dwa zegary
function dualMode(c: Ctx): string {
	const { s, t, accent } = c;
	const tz1 = resolveTz(s.tz, s.customTz);
	const tz2 = resolveTz(s.tz2 ?? "America/New_York", s.customTz2);
	const col = (cx: number, label: string, tz: string) => {
		const p = clockParts(c.now, s, tz);
		const big = p.ampm ? `${p.time} ${p.ampm}` : p.time;
		return tx(cx, 11, label.toUpperCase(), fit(label, 104, 9), t.dim, 700, "middle", 1) +
			tx(cx, 36, big, fit(big, 108, 30), t.fg, 700, "middle") +
			tx(cx, 47, `${p.weekdayShort} ${p.dateCompact}`, 10, accent, 600, "middle");
	};
	return wrap(c,
		col(58, s.label1?.trim() || cityOf(tz1), tz1) +
		`<line x1="116" y1="7" x2="116" y2="44" stroke="${accent}" stroke-opacity=".4"/>` +
		col(174, s.label2?.trim() || cityOf(tz2), tz2));
}

// ---------------------------------------------------------------- odczyty
type Row = { label: string; text: string; frac: number; color: string } | { msg: string[] };

function sensorRows(c: Ctx): Row[] {
	const { s, t } = c;
	const f = (v: number) => Math.round(s.unit === "F" ? (v * 9) / 5 + 32 : v);
	const rows: Row[] = [];
	const wantsHw = s.showCpu !== false || s.showGpu !== false;
	const hwDown = (c.sensors.status === "disabled" || c.sensors.status === "notrunning") && !c.sensors.cpu && !c.sensors.gpu;
	if (wantsHw && hwDown) {
		rows.push({ msg: c.sensors.status === "notrunning" ? ["Start HWiNFO"] : ["Enable HWiNFO", "Shared Memory"] });
	} else {
		const temp = (label: string, v: Val, warn: number, crit: number): Row =>
			v ? { label, text: `${f(v.temp)}°${s.unit === "F" ? "F" : "C"}`, frac: (v.temp - 20) / 80, color: autoColor(v.temp, warn, crit) } : { label, text: "--", frac: 0, color: t.dim };
		if (s.showCpu !== false) rows.push(temp("CPU", c.sensors.cpu, 70, 85));
		if (s.showGpu !== false) rows.push(temp("GPU", c.sensors.gpu, 70, 83));
	}
	if (s.showRam !== false) {
		const v = c.sensors.ram;
		rows.push(v ? { label: "RAM", text: `${Math.round(v.temp)}%`, frac: v.temp / 100, color: autoColor(v.temp, 80, 92) } : { label: "RAM", text: "--", frac: 0, color: t.dim });
	}
	return rows;
}

function statsMode(c: Ctx): string {
	const { s, t, accent } = c;
	const p = clockParts(c.now, s, resolveTz(s.tz, s.customTz));
	const big = p.ampm ? `${p.time}${p.ampm.toLowerCase()}` : p.time;
	let out = tx(6, 30, big, fit(big, 92, 30), t.fg, 700) + tx(6, 45, `${p.weekdayShort} ${p.dateCompact}`, fit(`${p.weekdayShort} ${p.dateCompact}`, 92, 11), accent, 600);
	const rows = sensorRows(c);
	const n = Math.max(1, rows.length);
	const rowH = 16;
	const top = (50 - n * rowH) / 2;
	rows.forEach((r, i) => {
		const base = Math.round(top + i * rowH + 12);
		if ("msg" in r) {
			r.msg.forEach((line, k) => (out += tx(106, base + k * 13 - (r.msg.length - 1) * 6, line, 12, k === 0 ? accent : t.dim, 700)));
			return;
		}
		out += tx(106, base, r.label, 10, t.dim, 700, "start", 0.5) + tx(146, base, r.text, 13, r.color, 700);
		out += `<rect x="184" y="${base - 8}" width="42" height="6" rx="3" fill="${t.track}"/><rect x="184" y="${base - 8}" width="${Math.max(4, Math.round(42 * Math.max(0, Math.min(1, r.frac))))}" height="6" rx="3" fill="${r.color}"/>`;
	});
	return wrap(c, out);
}

function dashboardMode(c: Ctx): string {
	const { s, t } = c;
	const p = clockParts(c.now, s, resolveTz(s.tz, s.customTz));
	const big = p.ampm ? `${p.time}${p.ampm.toLowerCase()}` : p.time;
	let out = tx(6, 31, big, fit(big, 86, 30), t.fg, 700) + tx(6, 45, `${p.weekdayShort} ${p.dateCompact}`, fit(`${p.weekdayShort} ${p.dateCompact}`, 86, 11), c.accent, 600);
	const rows = sensorRows(c);
	const rings = rows.filter((r): r is Exclude<Row, { msg: string[] }> => !("msg" in r));
	const msg = rows.find((r): r is { msg: string[] } => "msg" in r);
	const slots = rings.length + (msg ? 2 : 0);
	if (slots === 0) return wrap(c, out);
	const slotW = Math.min(46, 134 / slots);
	let x = 232 - 6 - slotW * slots + slotW / 2;
	if (msg) {
		out += msg.msg.map((line, k) => tx(x - slotW / 2 + 2, 22 + k * 13 - (msg.msg.length - 1) * 4, line, 11, k === 0 ? c.accent : t.dim, 700)).join("");
		x += slotW * 2;
	}
	for (const r of rings) {
		out += ring(x, 22, 14, r.frac, r.color, t.track, 4);
		out += tx(x, 26, r.text.replace(/°[CF]$/, "°"), fit(r.text.replace(/°[CF]$/, "°"), 22, 12), t.fg, 700, "middle");
		out += tx(x, 48, r.label, 9, t.dim, 700, "middle", 0.5);
		x += slotW;
	}
	return wrap(c, out);
}

// ---------------------------------------------------------------- analogowy
function analogMode(c: Ctx): string {
	const { s, t, accent } = c;
	const p = clockParts(c.now, s, resolveTz(s.tz, s.customTz));
	const cx = 26, cy = 25, r = 22;
	const pol = (deg: number, len: number) => `${(cx + len * Math.sin((deg * Math.PI) / 180)).toFixed(2)} ${(cy - len * Math.cos((deg * Math.PI) / 180)).toFixed(2)}`;
	let out = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track}" stroke-width="2"/>`;
	for (let i = 0; i < 12; i++) out += `<line x1="${pol(i * 30, i % 3 === 0 ? 16 : 18.5).split(" ")[0]}" y1="${pol(i * 30, i % 3 === 0 ? 16 : 18.5).split(" ")[1]}" x2="${pol(i * 30, 20.5).split(" ")[0]}" y2="${pol(i * 30, 20.5).split(" ")[1]}" stroke="${i % 3 === 0 ? accent : t.dim}" stroke-width="${i % 3 === 0 ? 2 : 1}"/>`;
	const { h, mi } = p.z;
	const sec = p.z.s + (c.smooth ? c.now.getMilliseconds() / 1000 : 0); // płynna wskazówka przy wyższym odświeżaniu
	const hand = (deg: number, len: number, w: number, col: string) => `<line x1="${cx}" y1="${cy}" x2="${pol(deg, len).split(" ")[0]}" y2="${pol(deg, len).split(" ")[1]}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
	out += hand(((h % 12) + mi / 60) * 30, 11, 3, t.fg) + hand((mi + sec / 60) * 6, 16, 2, t.fg);
	if (s.showSeconds === true) out += hand(sec * 6, 18, 1, accent);
	out += `<circle cx="${cx}" cy="${cy}" r="2" fill="${accent}"/>`;
	const big = p.ampm ? `${p.time} ${p.ampm}` : p.time;
	out += tx(62, 28, big, fit(big, 160, 28), t.fg, 700);
	const line = [p.weekday || p.weekdayShort, p.date].join(", ");
	out += tx(62, 44, line, fit(line, 166, 13), accent, 600);
	return wrap(c, out);
}

// ---------------------------------------------------------------- postęp
function progressMode(c: Ctx): string {
	const { s, t, accent } = c;
	const w = words(c);
	const z = zoned(c.now, resolveTz(s.tz, s.customTz));
	const dayFrac = (z.h * 3600 + z.mi * 60 + z.s) / 86400;
	const dim = new Date(Date.UTC(z.y, z.mo, 0)).getUTCDate();
	const leap = (z.y % 4 === 0 && z.y % 100 !== 0) || z.y % 400 === 0;
	const doy = Math.round((Date.UTC(z.y, z.mo - 1, z.d) - Date.UTC(z.y, 0, 1)) / 86400000);
	const items: { label: string; f: number }[] = [];
	if (s.progDay !== false) items.push({ label: w.day, f: dayFrac });
	if (s.progWeek !== false) items.push({ label: w.week, f: (((z.dow + 6) % 7) + dayFrac) / 7 });
	if (s.progMonth !== false) items.push({ label: w.month, f: (z.d - 1 + dayFrac) / dim });
	if (s.progYear !== false) items.push({ label: w.year, f: (doy + dayFrac) / (leap ? 366 : 365) });
	if (!items.length) items.push({ label: w.day, f: dayFrac });
	const cols = items.length <= 2 ? items.length : 2;
	const rows = Math.ceil(items.length / cols);
	const cw = (232 - 16 - (cols - 1) * 12) / cols;
	const ch = 50 / rows;
	let out = "";
	items.forEach((it, i) => {
		const x = 8 + (i % cols) * (cw + 12);
		const y = Math.floor(i / cols) * ch;
		const big = rows === 1;
		const pct = `${Math.round(it.f * 100)}%`;
		const barY = y + (big ? 27 : 15);
		const barH = big ? 13 : 7;
		out += tx(x, y + (big ? 20 : 11), it.label, big ? 11 : 9, t.dim, 700, "start", 0.5) + tx(x + cw, y + (big ? 21 : 11), pct, big ? 17 : 11, t.fg, 700, "end");
		out += `<rect x="${x}" y="${barY}" width="${cw}" height="${barH}" rx="${barH / 2}" fill="${t.track}"/><rect x="${x}" y="${barY}" width="${Math.max(barH, Math.round(cw * it.f))}" height="${barH}" rx="${barH / 2}" fill="${accent}"/>`;
	});
	return wrap(c, out);
}

// ---------------------------------------------------------------- odliczanie
function countdownMode(c: Ctx): string {
	const { s, t, accent } = c;
	const w = words(c);
	const label = s.targetLabel?.trim() || "";
	const target = s.targetDate ? new Date(s.targetDate) : null;
	if (!target || Number.isNaN(+target)) return wrap(c, tx(116, 30, w.pick, fit(w.pick, 216, 14), t.dim, 600, "middle"));
	let diff = Math.floor((+target - +c.now) / 1000);
	if (diff <= 0) return wrap(c, tx(116, 20, label || "—", fit(label || "—", 216, 14), accent, 700, "middle") + tx(116, 42, w.done, fit(w.done, 216, 22), t.fg, 700, "middle"));
	const d = Math.floor(diff / 86400);
	diff -= d * 86400;
	const hh = String(Math.floor(diff / 3600)).padStart(2, "0");
	const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
	const ss = String(diff % 60).padStart(2, "0");
	const big = d > 0 ? `${d}${w.d} ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
	return wrap(c, (label ? tx(116, 15, label, fit(label, 216, 13), accent, 700, "middle") : "") + tx(116, label ? 42 : 36, big, fit(big, 220, label ? 26 : 32), t.fg, 700, "middle"));
}

// ---------------------------------------------------------------- napis
function messageMode(c: Ctx): string {
	const { s, t, accent } = c;
	const msg = (s.message ?? "").replace(/\s+/g, " ").trim();
	if (!msg) return wrap(c, tx(116, 30, words(c).msg, fit(words(c).msg, 216, 14), t.dim, 600, "middle"));
	const size = 26;
	const width = tw(msg, size);
	if (width <= 220) return wrap(c, tx(116, 35, msg, size, accent, 700, "middle"));
	const speed = s.scroll === "slow" ? 25 : s.scroll === "fast" ? 90 : 50; // px/s
	const gap = 70;
	const offset = ((c.ms / 1000) * speed) % (width + gap);
	return wrap(c, tx(6 - offset, 35, msg, size, accent, 700) + tx(6 - offset + width + gap, 35, msg, size, accent, 700));
}

export function renderMode(mode: Mode, c: Ctx): string {
	useFont(c.s);
	switch (mode) {
		case "dual": return dualMode(c);
		case "stats": return statsMode(c);
		case "dashboard": return dashboardMode(c);
		case "analog": return analogMode(c);
		case "progress": return progressMode(c);
		case "countdown": return countdownMode(c);
		case "message": return messageMode(c);
		default: return clockMode(c);
	}
}
