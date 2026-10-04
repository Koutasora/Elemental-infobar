// Generuje com.elemental.infobar.sdPlugin/fonts/<id>.json z plików WOFF paczek @fontsource (licencja SIL OFL-1.1).
// W pluginie nie ma pełnych czcionek – tylko kształty ok. 600 potrzebnych znaków (łacina, rozszerzona łacina, cyrylica,
// interpunkcja) jako ścieżki SVG w jednostkach 1000 na em. Uruchomienie (jednorazowo, wyniki są w repozytorium):
//   node scripts/gen-fonts.mjs <katalog z node_modules/@fontsource> [pakiet,pakiet...]  (drugi argument ogranicza generowanie do wybranych czcionek)
import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

const src = process.argv[2] ?? "node_modules/@fontsource";
const out = path.resolve("com.elemental.infobar.sdPlugin/fonts");
fs.mkdirSync(out, { recursive: true });

// zestaw znaków: ASCII, Latin-1, Latin Extended-A, cyrylica, wybrana interpunkcja i symbole
const ranges = [[0x20, 0x7e], [0xa0, 0xff], [0x100, 0x17f], [0x400, 0x4ff], [0x2b0, 0x2ff], [0x2010, 0x2027], [0x2030, 0x2030], [0x20ac, 0x20ac], [0x2190, 0x2193], [0x2022, 0x2022]];
const chars = [];
for (const [a, b] of ranges) for (let c = a; c <= b; c++) chars.push(String.fromCodePoint(c));

const FAMILIES = {
	"jetbrains-mono": { id: "JetBrains Mono", weights: { regular: 400, bold: 700 }, subsets: ["latin", "latin-ext", "cyrillic"] },
	"iosevka": { id: "Iosevka", weights: { regular: 400, bold: 700 }, subsets: ["latin"] }, // jeden plik pokrywa wszystkie zakresy
	"vt323": { id: "VT323", weights: { regular: 400 }, subsets: ["latin", "latin-ext"] }, // pikselowa, bez wersji pogrubionej
	"press-start-2p": { id: "Press Start 2P", weights: { regular: 400 }, subsets: ["latin", "latin-ext", "cyrillic"] }, // pikselowa, bez wersji pogrubionej
	"ibm-plex-mono": { id: "IBM Plex Mono", weights: { regular: 400, bold: 700 }, subsets: ["latin", "latin-ext", "cyrillic"] },
	"fira-code": { id: "Fira Code", weights: { regular: 400, bold: 700 }, subsets: ["latin", "latin-ext", "cyrillic"] },
};

/** Zapis komend ścieżki z jawnymi odstępami; współrzędne zaokrąglone do liczb całkowitych (1000 jednostek na em). */
const num = (v) => String(Math.round(v) || 0);
const pathData = (cmds, k) =>
	cmds
		.map((c) => {
			const p = (...v) => v.map((n) => num(n * k)).join(" ");
			switch (c.type) {
				case "M": return "M" + p(c.x, c.y);
				case "L": return "L" + p(c.x, c.y);
				case "Q": return "Q" + p(c.x1, c.y1, c.x, c.y);
				case "C": return "C" + p(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
				case "Z": return "Z";
				default: return "";
			}
		})
		.join("");

const load = (file) => {
	const b = fs.readFileSync(file);
	return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

const only = process.argv[3]?.split(",");
for (const [pkg, fam] of Object.entries(FAMILIES)) {
	if (only && !only.includes(pkg)) continue;
	const result = { id: fam.id, upm: 1000 };
	for (const [style, weight] of Object.entries(fam.weights)) {
		const glyphs = {};
		for (const subset of fam.subsets) {
			const file = path.join(src, pkg, "files", `${pkg}-${subset}-${weight}-normal.woff`);
			if (!fs.existsSync(file)) continue;
			const font = load(file);
			const k = 1000 / font.unitsPerEm;
			for (const ch of chars) {
				if (glyphs[ch]) continue;
				const idx = font.charToGlyphIndex(ch);
				if (idx <= 0) continue;
				const g = font.glyphs.get(idx);
				glyphs[ch] = { a: Math.round(g.advanceWidth * k), d: pathData(g.getPath(0, 0, font.unitsPerEm).commands, k) }; // baza w y=0, oś y w dół
			}
		}
		if (Object.keys(glyphs).length) result[style] = glyphs; // brak pliku danej grubości = czcionka bez wersji pogrubionej
	}
	const json = JSON.stringify(result);
	fs.writeFileSync(path.join(out, `${fam.id}.json`), json);
	console.log(fam.id.padEnd(15), `regular=${Object.keys(result.regular).length} bold=${Object.keys(result.bold ?? {}).length}`, `${Math.round(json.length / 1024)} KB`);
}
