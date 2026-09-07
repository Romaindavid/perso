# Patch — questions à creuser groupées par thème (option `5c`)

Part de la version déjà en prod (bloc sauge unique « à garder en tête » dans `recap/page.tsx`). Trois modifications.

---

## 1. `src/app/api/weekly-recap/route.ts` — faire émettre le thème

Dans `SYSTEM_PROMPT`, section `## 🧭 Questions à creuser`, ajouter deux lignes de consigne de forme :

```
Format de chaque question : "- **Thème** — question"
Le thème doit être repris mot pour mot dans la liste des thèmes de la section Schémas détectés / Journal & état d'esprit ci-dessus. Un seul thème par question.
```

Aucun changement de schéma, aucun changement de contrat d'API. Les récaps déjà en base restent valides (repli ci-dessous).

## 2. `src/app/(app)/recap/page.tsx` — parser le thème

```ts
interface RecapQuestion {
  key: string;      // inchangé : `${recapId}::${questionText}`
  question: string;
  theme: string;
  weekLabel: string;
  prompt: string;
}

function extractQuestions(content: string): { theme: string; question: string }[] {
  const match = content.match(/##\s*🧭\s*Questions à creuser\s*\n([\s\S]*?)(?=\n##|$)/);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map(l => l.replace(/^[-*]\s*/, "").trim())
    .filter(l => l.length > 5)
    .map(l => {
      const m = l.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
      return m ? { theme: m[1].trim(), question: m[2].trim() } : { theme: "Sans thème", question: l };
    });
}
```

Important : **la clé d'archive reste `${recapId}::${question}`** — le thème n'y entre pas, donc les questions déjà marquées traitées le restent.

Puis grouper les questions actives, en gardant l'ordre d'apparition des récaps (le plus récent d'abord) :

```ts
const THEME_TINTS = [
  { bg: "#386458", fg: "#f4fffa", sub: "rgba(244,255,250,.65)", check: "rgba(244,255,250,.45)", btn: "rgba(244,255,250,.16)" },
  { bg: "#b9ecee", fg: "#1b1c1a", sub: "#3c6c6e",             check: "#8fc9cb",                 btn: "rgba(255,255,255,.6)" },
  { bg: "#ffdf96", fg: "#1b1c1a", sub: "#735802",             check: "#d9b25e",                 btn: "rgba(255,251,255,.6)" },
  { bg: "#efeeea", fg: "#1b1c1a", sub: "#717975",             check: "#c0c8c4",                 btn: "#ffffff" },
];

const byTheme = new Map<string, RecapQuestion[]>();
activeQuestions.forEach(q => {
  byTheme.set(q.theme, [...(byTheme.get(q.theme) || []), q]);
});

const groups = [...byTheme.entries()]
  .sort((a, b) => b[1].length - a[1].length)                 // thème le plus fourni en premier
  .sort((a, b) => (a[0] === "Sans thème" ? 1 : 0) - (b[0] === "Sans thème" ? 1 : 0)) // « Sans thème » toujours dernier
  .map(([theme, items], i) => ({ theme, items, tint: THEME_TINTS[i % THEME_TINTS.length] }));
```

La teinte suit le rang du thème dans `groups`, recalculé à chaque render : c'est stable tant que le nombre de questions ouvertes par thème ne change pas. Si tu veux une teinte figée par thème même après avoir tout coché, remplace `i % 4` par un hash du libellé :

```ts
const tintOf = (theme: string) =>
  THEME_TINTS[[...theme].reduce((n, c) => n + c.charCodeAt(0), 0) % THEME_TINTS.length];
```

## 3. Rendu — un bloc par thème au lieu du bloc unique

Remplacer le bloc sauge unique par l'en-tête de section + la pile de blocs. Le reste de la page (archive, générateur, historique) ne change pas.

```tsx
<div>
  <div className="flex items-baseline justify-between mx-1 mb-3.5">
    <h2 className="text-sm font-bold text-on-surface-variant">À garder en tête</h2>
    <span className="text-xs text-outline">
      {activeQuestions.length} {activeQuestions.length > 1 ? "ouvertes" : "ouverte"}
    </span>
  </div>

  <div className="flex flex-col gap-2.5">
    {groups.map(({ theme, items, tint }) => (
      <div key={theme} className="rounded-[26px] p-5" style={{ background: tint.bg }}>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: tint.fg }}>{theme}</span>
          <span className="text-[11px]" style={{ color: tint.sub }}>{items.length}</span>
        </div>

        <div className="flex flex-col gap-4">
          {items.map(q => (
            <div key={q.key} className="flex gap-[13px] items-start">
              <button
                onClick={() => archiveQuestion(q.key)}
                aria-label="Marquer comme traitée"
                className="flex-none w-6 h-6 mt-0.5 rounded-full border-[1.5px] bg-transparent"
                style={{ borderColor: tint.check }}
              />
              <div className="flex-1">
                <p className="text-[15px] leading-[23px] font-medium text-pretty" style={{ color: tint.fg }}>
                  {q.question}
                </p>
                <div className="flex items-center gap-2.5 mt-[9px]">
                  <span className="text-[10.5px]" style={{ color: tint.sub }}>{q.weekLabel}</span>
                  <button
                    onClick={() => openEntryFor(q)}
                    className="rounded-full px-[13px] py-[7px] text-[11px] font-bold"
                    style={{ background: tint.btn, color: tint.fg }}
                  >
                    Écrire là-dessus
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
</div>
```

Points de vigilance :
- un thème dont toutes les questions sont traitées **disparaît** — `groups` étant construit depuis `activeQuestions`, c'est automatique ; ne pas rendre de bloc vide ;
- la case à cocher fait 24px mais la ligne cliquable doit rester ≥ 44px de haut : le `py` du texte suffit, sinon ajouter `p-2.5 -m-2.5` sur le bouton ;
- l'archive « Traitées (n) » reste une liste plate, non groupée — le thème n'y sert à rien.
