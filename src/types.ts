export type Mode = "clock" | "dual" | "stats" | "dashboard" | "analog" | "progress";

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
	capitalize?: boolean;

	// efekt koloru akcentu (a więc i bocznych diod)
	ledMode?: string;
	ledColor?: string; // własny kolor diod, gdy ledMode = "color"

	// wygląd i szybkość
	font?: string;
	fps?: string;
	sensorInterval?: string;

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


};

export type Val = { temp: number } | null;

export type Sensors = { cpu: Val; gpu: Val; ram: Val; status: string };
