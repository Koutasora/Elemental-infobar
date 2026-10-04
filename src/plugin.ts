import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, type NeoInfobarAction } from "@elgato/streamdeck";
import { THEMES, renderMode } from "./modes";
import { readCpu, readGpu, readRam, shmStatus } from "./sensors";
import type { Mode, Sensors, Settings } from "./types";

type Entry = { bar: NeoInfobarAction<Settings>; settings: Settings; timer?: NodeJS.Timeout; last: string };

const bars = new Map<string, Entry>();
let sensors: Sensors = { cpu: null, gpu: null, ram: null, status: "unknown" };
let sensorTimer: NodeJS.Timeout | undefined;

const SENSOR_POLL_MS = 2000;
const needsSensors = (m?: Mode) => m === "stats" || m === "dashboard";

function frame(e: Entry): string {
	const s = e.settings;
	const t = THEMES[s.theme ?? "black"] ?? THEMES.black;
	const accent = s.accentMode === "custom" && /^#[0-9a-f]{6}$/i.test(s.accent ?? "") ? (s.accent as string) : t.accent;
	return renderMode(s.mode ?? "clock", { now: new Date(), s, t, accent, sensors, ms: Date.now() });
}

async function draw(id: string): Promise<void> {
	const e = bars.get(id);
	if (!e) return;
	const svg = frame(e);
	if (svg === e.last) return; // nic się nie zmieniło – nie wysyłamy
	e.last = svg;
	await e.bar.setFeedback({ img: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` });
}

/** Zegar odświeżamy co sekundę, napis przewijany ok. 15 razy na sekundę. */
function schedule(id: string): void {
	const e = bars.get(id);
	if (!e) return;
	if (e.timer) clearInterval(e.timer);
	e.last = "";
	e.timer = setInterval(() => void draw(id), (e.settings.mode ?? "clock") === "message" ? 66 : 1000);
	void draw(id);
}

async function refreshSensors(): Promise<void> {
	const [cpu, gpu] = await Promise.all([readCpu(), readGpu(0)]);
	sensors = { cpu, gpu, ram: readRam(), status: shmStatus() };
}

function ensureSensorTimer(): void {
	const need = [...bars.values()].some((e) => needsSensors(e.settings.mode));
	if (need && !sensorTimer) {
		sensorTimer = setInterval(() => void refreshSensors(), SENSOR_POLL_MS);
		void refreshSensors();
	} else if (!need && sensorTimer) {
		clearInterval(sensorTimer);
		sensorTimer = undefined;
	}
}

@action({ UUID: "com.elemental.infobar.bar" })
class Infobar extends SingletonAction<Settings> {
	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isNeoInfobar()) return;
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
		const e = bars.get(ev.action.id);
		if (!e) return;
		e.settings = ev.payload.settings;
		schedule(ev.action.id);
		ensureSensorTimer();
	}
}

streamDeck.actions.registerAction(new Infobar());
void streamDeck.connect();
