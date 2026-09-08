// One-off: import Day One journal exports into journal_entries.
// Only content + date are kept (no location/weather/starred, per user request).
// created_at is stored at local noon on the entry's own local calendar date
// (computed via its timeZone), matching how the app already stores new entries
// (entryDate + "T12:00:00") — avoids UTC day-shift for late-night entries, which
// matters for any month/day matching (e.g. "on this day" features).
//
// Run with: bun scripts/import-dayone.mjs

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: tokenRow } = await admin.from("google_tokens").select("user_id").single();
const userId = tokenRow.user_id;

function localDateNoonISO(creationDate, timeZone) {
  const d = new Date(creationDate);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  const localDate = fmt.format(d); // YYYY-MM-DD in that timezone
  return `${localDate}T12:00:00.000Z`;
}

const files = ["Dayone/Journal.json", "Dayone/Journal de confinement.json"];
const rows = [];
for (const f of files) {
  const entries = JSON.parse(fs.readFileSync(f, "utf8")).entries;
  entries.forEach(e => {
    if (!e.text || !e.text.trim()) return;
    rows.push({
      user_id: userId,
      category: "quotidien",
      content: e.text.trim(),
      created_at: localDateNoonISO(e.creationDate, e.timeZone),
    });
  });
}

console.log(`${rows.length} entries to import.`);

const CHUNK = 200;
let inserted = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const { error } = await admin.from("journal_entries").insert(chunk);
  if (error) { console.error("ERROR at chunk", i, error); process.exit(1); }
  inserted += chunk.length;
  console.log(`Inserted ${inserted}/${rows.length}`);
}

console.log("Done.");
