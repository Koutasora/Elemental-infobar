import type { Settings } from "./types";

const sys = Intl.DateTimeFormat().resolvedOptions();
export const SYSTEM_LOCALE = sys.locale;
export const SYSTEM_TZ = sys.timeZone;

export const resolveLang = (v?: string) => (!v || v === "system" ? SYSTEM_LOCALE : v);

/** "local" / pusty -> strefa systemu; "custom" -> wpisana nazwa IANA; niepoprawna nazwa -> strefa systemu. */
export function resolveTz(v?: string, custom?: string): string {
	const t = v === "custom" ? (custom ?? "").trim() : v;
	if (!t || t === "local") return SYSTEM_TZ;
	try {
		new Intl.DateTimeFormat("en", { timeZone: t });
		return t;
	} catch {
		return SYSTEM_TZ;
	}
}

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = locale + JSON.stringify(opts);
	let f = cache.get(key);
	if (!f) {
		try {
			f = new Intl.DateTimeFormat(locale, opts);
		} catch {
			f = new Intl.DateTimeFormat("en", opts); // nieznany język -> angielski
		}
		cache.set(key, f);
	}
	return f;
}

export type Zoned = { y: number; mo: number; d: number; h: number; mi: number; s: number; dow: number };

/** Składniki czasu w wybranej strefie (dow: 0 = niedziela). */
export function zoned(now: Date, tz: string): Zoned {
	const f = dtf("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
	const o: Record<string, string> = {};
	for (const p of f.formatToParts(now)) o[p.type] = p.value;
	return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
}

const p2 = (n: number) => String(n).padStart(2, "0");

export type ClockParts = {
	time: string;
	ampm: string;
	weekday: string;
	weekdayShort: string;
	date: string;
	dateCompact: string;
	tz: string;
	z: Zoned;
};

export function clockParts(now: Date, s: Settings, tz: string): ClockParts {
	const locale = resolveLang(s.clockLang);
	const z = zoned(now, tz);
	const cap = (t: string) => (s.capitalize === false ? t : t.charAt(0).toLocaleUpperCase(locale) + t.slice(1));
	const name = (style: "long" | "short") => cap(dtf(locale, { timeZone: tz, weekday: style }).format(now).replace(/\.$/, ""));

	let time: string;
	let ampm = "";
	if (s.hour12 === "12") {
		time = `${z.h % 12 || 12}:${p2(z.mi)}`;
		ampm = z.h < 12 ? "AM" : "PM";
	} else {
		time = `${p2(z.h)}:${p2(z.mi)}`;
	}

	let date: string;
	switch (s.dateFormat) {
		case "dd.MM.yyyy": date = `${p2(z.d)}.${p2(z.mo)}.${z.y}`; break;
		case "yyyy-MM-dd": date = `${z.y}-${p2(z.mo)}-${p2(z.d)}`; break;
		case "MM/dd/yyyy": date = `${p2(z.mo)}/${p2(z.d)}/${z.y}`; break;
		case "dd/MM/yyyy": date = `${p2(z.d)}/${p2(z.mo)}/${z.y}`; break;
		case "mid": date = dtf(locale, { timeZone: tz, day: "numeric", month: "short", year: "numeric" }).format(now); break;
		case "long": date = dtf(locale, { timeZone: tz, day: "numeric", month: "long", year: "numeric" }).format(now); break;
		case "dm": date = dtf(locale, { timeZone: tz, day: "numeric", month: "long" }).format(now); break;
		default: date = `${z.d}.${z.mo}.${z.y}`;
	}

	return {
		time,
		ampm,
		weekday: s.weekdayStyle === "none" ? "" : name(s.weekdayStyle === "short" ? "short" : "long"),
		weekdayShort: name("short"),
		date,
		dateCompact: `${z.d}.${z.mo}`,
		tz,
		z,
	};
}

/** Krótka nazwa miasta ze strefy, np. "America/New_York" -> "New York". */
export const cityOf = (tz: string) => (tz.split("/").pop() ?? tz).replace(/_/g, " ");
