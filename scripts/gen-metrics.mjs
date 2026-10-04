// Mierzy szerokości znaków (advance) czcionek systemowych Windows i zapisuje je do src/metrics.json.
// To same wymiary (liczby w jednostkach 1000 na em), nie kształty znaków – dzięki nim układ tekstu jest dokładny
// niezależnie od tego, jak renderer paska radzi sobie z pomiarem. Uruchomienie (jednorazowo, wynik jest w repozytorium):
//   node scripts/gen-metrics.mjs
import fs from "node:fs";
import opentype from "opentype.js";

const FONTS = {
	"Segoe UI": { regular: "segoeui.ttf", bold: "segoeuib.ttf" },
	Arial: { regular: "arial.ttf", bold: "arialbd.ttf" },
	Tahoma: { regular: "tahoma.ttf", bold: "tahomabd.ttf" },
	"Trebuchet MS": { regular: "trebuc.ttf", bold: "trebucbd.ttf" },
	// Bahnschrift to czcionka zmienna: mierzymy domyślną instancję, pogrubienie to ok. +4% szerokości
	Bahnschrift: { regular: "bahnschrift.ttf", bold: null },
};
const ranges = [[0x20, 0x7e], [0xa0, 0xff], [0x100, 0x17f], [0x400, 0x4ff], [0x2b0, 0x2ff], [0x2010, 0x2027], [0x2030, 0x2030], [0x20ac, 0x20ac], [0x2190, 0x2193]];
const chars = [];
for (const [a, b] of ranges) for (let c = a; c <= b; c++) chars.push(String.fromCodePoint(c));

const load = (file) => {
	const b = fs.readFileSync("C:/Windows/Fonts/" + file);
	return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const advances = (font, k = 1) => {
	const out = {};
	for (const ch of chars) {
		const idx = font.charToGlyphIndex(ch);
		if (idx > 0) out[ch] = Math.round((font.glyphs.get(idx).advanceWidth * 1000) / font.unitsPerEm * k);
	}
	return out;
};

const result = {};
for (const [name, files] of Object.entries(FONTS)) {
	const regular = advances(load(files.regular));
	const bold = files.bold ? advances(load(files.bold)) : advances(load(files.regular), 1.04);
	result[name] = { regular, bold };
	console.log(name.padEnd(13), `chars=${Object.keys(regular).length}`, `digit0 regular=${regular["0"]} bold=${bold["0"]}`, `colon bold=${bold[":"]}`);
}
fs.writeFileSync("src/metrics.json", JSON.stringify(result));
console.log("src/metrics.json", Math.round(fs.statSync("src/metrics.json").size / 1024), "KB");
