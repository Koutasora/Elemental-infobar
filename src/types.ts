export type Mode = "clock" | "dual" | "stats" | "dashboard" | "analog" | "progress" | "countdown" | "message";

/** Ustawienia akcji Infobar zapisywane przez panel. */
export type Settings = {
	mode?: Mode;
	theme?: string;
	accentMode?: "theme" | "custom";
	accent?: string;

	// czas i data
	clockLang?: string;
	tz?: string;
	customTz?: string;
	tz2?: string;
	customTz2?: string;
	label1?: string;
	label2?: string;
	hour12?: "24" | "12";
	showSeconds?: boolean;
	weekdayStyle?: "long" | "short" | "none";
	dateFormat?: string;
	showWeek?: boolean;
	capitalize?: boolean;

	// odczyty
	showCpu?: boolean;
	showGpu?: boolean;
	showRam?: boolean;
	unit?: "C" | "F";

	// postęp
	progDay?: boolean;
	progWeek?: boolean;
	progMonth?: boolean;
	progYear?: boolean;

	// odliczanie
	targetLabel?: string;
	targetDate?: string;

	// napis
	message?: string;
	scroll?: "slow" | "normal" | "fast";
};

export type Val = { temp: number } | null;

export type Sensors = { cpu: Val; gpu: Val; ram: Val; status: string };
