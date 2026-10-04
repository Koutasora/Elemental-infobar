import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, type NeoInfobarAction } from "@elgato/streamdeck";
import { THEMES, renderMode } from "./modes";
import { readCpu, readGpu, readRam, shmStatus } from "./sensors";
import { ledColor, ledStrip } from "./led";
import type { Sensors, Settings } from "./types";

type Entry = { bar: NeoInfobarAction<Settings>; settings: Settings; timer?: NodeJS.Timeout; last: string };

const bars = new Map<string, Entry>();
let sensors: Sensors = { cpu: null, gpu: null, ram: null, status: "unknown" };
let sensorTimer: NodeJS.Timeout | undefined;
let sensorEveryS = 0;

const DEFAULT_SENSOR_S = 2;
const DEFAULT_ACCENT = "#38bdf8"; // taka sama wartość jak default próbnika koloru w panelu
/** Odczyty potrzebne w trybach z odczytami oraz w diodach zależnych od temperatury. */
const needsSensors = (s: Settings) => s.mode === "stats" || s.mode === "dashboard" || s.ledMode === "temp" || s.ledMode === "alert";

function frame(e: Entry): string {
	const s = e.settings;
	const t = THEMES[s.theme ?? "black"] ?? THEMES.black;
	// Własny kolor: domyślna wartość próbnika w panelu (#38bdf8) nie jest zapisywana, dopóki jej nie zmienisz – używamy jej od razu
	const picked = /^#[0-9a-f]{6}$/i.test(s.accent ?? "") ? (s.accent as string) : DEFAULT_ACCENT;
	const base = s.accentMode === "custom" ? picked : t.accent;
	const now = new Date();
	const ms = Date.now();
	const svg = renderMode(s.mode ?? "clock", { now, s, t, accent: base, sensors, ms, smooth: rateOf(s) > 1 });
	// Diodami sterujemy tylko kolorem cienkiej linii przy dolnej krawędzi; żaden inny kolor na pasku się nie zmienia
	const led = ledColor({ s, now, sensors, ms });
	return led ? svg.replace("</svg>", `${ledStrip(led)}</svg>`) : svg;
}

/** Liczba odświeżeń na sekundę: wybrana w panelu albo domyślnie 1. */
function rateOf(s: Settings): number {
	const n = Number(s.fps);
	const base = s.fps && s.fps !== "auto" && Number.isFinite(n) && n >= 1 ? Math.min(30, n) : 1;
	// tęcza, pulsowanie i miganie alarmu potrzebują kilku klatek na sekundę, żeby wyglądały płynnie
	return s.ledMode === "rainbow" || s.ledMode === "pulse" || s.ledMode === "alert" ? Math.max(base, 5) : base;
}

async function draw(id: string): Promise<void> {
	const e = bars.get(id);
	if (!e) return;
	const svg = frame(e);
	if (svg === e.last) return; // nic się nie zmieniło – nie wysyłamy
	e.last = svg;
	await e.bar.setFeedback({ img: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` });
}

/** Odświeżamy z częstotliwością z panelu; gdy obraz się nie zmienił, nic nie wysyłamy. */
function schedule(id: string): void {
	const e = bars.get(id);
	if (!e) return;
	if (e.timer) clearInterval(e.timer);
	e.last = "";
	e.timer = setInterval(() => void draw(id), Math.round(1000 / rateOf(e.settings)));
	void draw(id);
}

async function refreshSensors(): Promise<void> {
	const [cpu, gpu] = await Promise.all([readCpu(), readGpu(0)]);
	sensors = { cpu, gpu, ram: readRam(), status: shmStatus() };
}

function ensureSensorTimer(): void {
	const users = [...bars.values()].filter((e) => needsSensors(e.settings));
	// najkrótszy interwał ze wszystkich pasków, które potrzebują odczytów
	const every = users.length ? Math.min(...users.map((e) => Math.max(1, Number(e.settings.sensorInterval) || DEFAULT_SENSOR_S))) : 0;
	if (every === sensorEveryS && (every === 0) === !sensorTimer) return;
	if (sensorTimer) clearInterval(sensorTimer);
	sensorTimer = undefined;
	sensorEveryS = every;
	if (every > 0) {
		sensorTimer = setInterval(() => void refreshSensors(), every * 1000);
		void refreshSensors();
	}
}

@action({ UUID: "com.elemental.infobar.bar" })
class Infobar extends SingletonAction<Settings> {
	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isNeoInfobar()) return;
		streamDeck.logger.info(`appear settings=${JSON.stringify(ev.payload.settings)}`);
		await ev.action.setFeedbackLayout("layouts/bar.json");
		// drugi zegar ma sensowną wartość domyślną, żeby panel nie pokazywał "lokalny" dwa razy
		if (ev.payload.settings.tz2 === undefined) await ev.action.setSettings({ ...ev.payload.settings, tz2: "America/New_York" });
		bars.set(ev.action.id, { bar: ev.action, settings: ev.payload.settings, last: "" });
		schedule(ev.action.id);
		ensureSensorTimer();
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		const e = bars.get(ev.action.id);
		if (e?.timer) clearInterval(e.timer);
		bars.delete(ev.action.id);
		ensureSensorTimer();
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		streamDeck.logger.info(`settings changed=${JSON.stringify(ev.payload.settings)} known=${bars.has(ev.action.id)}`);
		const e = bars.get(ev.action.id);
		if (!e) return;
		e.settings = ev.payload.settings;
		schedule(ev.action.id);
		ensureSensorTimer();
	}
}

streamDeck.actions.registerAction(new Infobar());
void streamDeck.connect();
