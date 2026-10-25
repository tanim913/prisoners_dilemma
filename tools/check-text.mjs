// Fails when player-facing text has em or en dashes or stock AI phrasing.
import { readFileSync } from "node:fs";

const FILES = ["index.html", "privacy.html", "delete-account.html", "js/app.js", "js/strategies.js", "js/ideas.js", "README.md"];
const BANNED = [
  /—/, /–/, /\bdelve/i, /\btapestry/i, /\btestament to/i, /\bembark/i, /\brealm/i, /\bseamless/i,
  /\bunlock(s|ing)?\b/i, /\bjourney\b/i, /\bnavigat(e|ing) the\b/i, /\bin today's\b/i, /\bfoster/i, /\bpivotal\b/i,
  /\bnot just\b/i, /\bit's not about\b/i, /\bnot only\b.*\bbut also\b/i, /\bintricate/i, /\bever-evolving\b/i
];

let bad = 0;
for (const f of FILES) {
  let text;
  try { text = readFileSync(new URL(`../${f}`, import.meta.url), "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => {
    for (const re of BANNED) {
      if (re.test(line)) { console.log(`${f}:${i + 1}: ${re} -> ${line.trim().slice(0, 100)}`); bad++; }
    }
  });
}
if (bad) { console.log(`${bad} text problem(s)`); process.exit(1); }
console.log("text check passed");
