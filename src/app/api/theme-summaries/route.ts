import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWithContext } from "@/lib/claude";

const SUMMARY_PROMPT = `
Tu reçois des thèmes, chacun suivi des questions ouvertes que la personne garde en tête sur ce thème.

Pour chaque thème, écris une seule phrase qui synthétise ce que ces questions, prises ensemble, disent de sa préoccupation en ce moment.

Format de sortie, une ligne par thème reçu, dans le même ordre, sans rien d'autre :
- **Thème** — phrase

Contraintes :
- Une affirmation, jamais une question. Pas de point d'interrogation.
- Une à deux propositions, au présent, adressée à la personne (« tu »).
- Elle dit ce qui se joue à travers ces questions, pas ce qu'il faudrait faire : ni conseil, ni injonction, ni encouragement.
- Elle synthétise l'ensemble des questions du thème. Ne pas paraphraser une seule d'entre elles, ne pas les énumérer.
- Pas de chiffre, pas de superlatif, pas de vocabulaire clinique.
- Reprends le libellé du thème mot pour mot.
`.trim();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { themes } = await request.json().catch(() => ({})) as { themes?: { theme: string; questions: string[] }[] };
  if (!themes?.length) return NextResponse.json({ summaries: {} });

  const userMessage = themes
    .map(t => `## ${t.theme}\n${t.questions.map(q => `- ${q}`).join("\n")}`)
    .join("\n\n");

  const text = await generateWithContext(SUMMARY_PROMPT, userMessage);

  const summaries: Record<string, string> = {};
  text.split("\n").forEach(l => {
    const m = l.replace(/^[-*]\s*/, "").trim().match(/^\*\*(.+?)\*\*\s*[—–:]+\s*(.+)$/);
    if (m) summaries[m[1].trim()] = m[2].trim();
  });

  return NextResponse.json({ summaries });
}
