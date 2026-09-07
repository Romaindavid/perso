# Patch — section « En ce moment » (option `6a`)

Nouvelle section, insérée **au-dessus** de « À garder en tête » sur `/recap`. Un bloc par thème préoccupant : nom, volume, tendance, une phrase de synthèse, et une trame de 14 barres (les 14 derniers jours).

Principe de répartition du travail : **Claude écrit la phrase et liste les dates où le thème apparaît ; le code compte, trie, calcule la tendance et dessine les barres.** On ne demande jamais un chiffre ou un pourcentage au modèle.

---

## 1. `src/app/api/weekly-recap/route.ts` — nouvelle section dans `SYSTEM_PROMPT`

Ajouter une section, juste avant `## 🧭 Questions à creuser` :

```
## 🌡️ En ce moment

Deux à quatre thèmes qui occupent le plus la personne sur la période, du plus présent au moins présent.
Format de chaque ligne, sans rien d'autre :
- **Thème** — phrase de synthèse — dates: YYYY-MM-DD, YYYY-MM-DD, ...

Contraintes :
- Le thème est repris mot pour mot dans la liste des thèmes de la section Schémas détectés. Un thème par ligne, jamais deux fois le même.
- La phrase fait une à deux propositions, au présent, adressée à la personne (« tu »). Elle dit ce qui se passe et ce qui est en jeu, pas ce qu'il faudrait faire. Pas de question, pas de conseil, pas de superlatif.
- `dates:` liste toutes les dates d'entrées de la période où ce thème est présent, une fois chacune, dans l'ordre chronologique. Ne pas inventer de date : uniquement des dates d'entrées réelles.
- Un thème qui n'apparaît plus depuis longtemps mais qui comptait avant reste éligible : la phrase le dit alors (« plus rien depuis le 22 août »), et `dates:` ne contient que ses dates réelles.
```

Pas de changement de schéma ni de contrat d'API : la section vit dans le markdown du récap, comme les autres.

## 2. `src/app/(app)/recap/page.tsx` — parser et dériver

```ts
interface Concern {
  theme: string;
  sentence: string;
  dates: string[];      // ISO, chronologique
  count: number;        // mentions sur la fenêtre
  bars: number[];       // 14 valeurs, 0..n mentions par jour
  trend: "up" | "flat" | "down";
}

function extractConcerns(content: string, endDate: Date): Concern[] {
  const match = content.match(/##\s*🌡️\s*En ce moment\s*\n([\s\S]*?)(?=\n##|$)/);
  if (!match) return [];

  const days: string[] = [];               // 14 jours, du plus ancien à aujourd'hui
  for (let i = 13; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  return match[1]
    .split("\n")
    .map(l => l.replace(/^[-*]\s*/, "").trim())
    .map(l => l.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+?)\s*[—–-]\s*dates:\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => {
      const dates = m[3].split(",").map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
      const bars = days.map(d => dates.filter(x => x === d).length);
      const recent = bars.slice(7).reduce((a, b) => a + b, 0);
      const before = bars.slice(0, 7).reduce((a, b) => a + b, 0);
      const trend = recent > before ? "up" : recent < before ? "down" : "flat";
      return { theme: m[1].trim(), sentence: m[2].trim(), dates, count: dates.length, bars, trend };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}
```

`endDate` = fin de période du récap le plus récent (ou `new Date()`). La section n'affiche que le **dernier** récap : `const concerns = latestRecap ? extractConcerns(latestRecap.content, end) : []` — pas d'agrégation entre récaps, sinon les phrases se contredisent.

Si `concerns.length === 0`, ne rien rendre du tout : pas d'état vide, pas de titre orphelin.

## 3. Teintes

Mêmes teintes que les blocs de questions (`PATCH_5c.md`), mais l'ordre ici est celui de la préoccupation : le thème le plus présent prend la teinte la plus dense.

```ts
const CONCERN_TINTS = [
  { bg: "#ffdf96", fg: "#1b1c1a", sub: "#735802", bar: "115,88,2"    },
  { bg: "#386458", fg: "#f4fffa", sub: "rgba(244,255,250,.75)", bar: "244,255,250" },
  { bg: "#b9ecee", fg: "#1b1c1a", sub: "#3c6c6e", bar: "60,108,110"  },
  { bg: "#efeeea", fg: "#404845", sub: "#717975", bar: "113,121,117" },
];

const TREND_LABEL = { up: "↑ en hausse", flat: "→ constant", down: "↓ recule" } as const;
```

Barres : hauteur 6px minimum (un jour sans mention reste visible), 26px pour le max de la ligne ; opacité croissante par quart de fenêtre, pour que « récent » se lise sans axe.

```ts
const barStyle = (v: number, max: number, i: number, bar: string, down: boolean) => {
  const h = v === 0 ? 6 : Math.round(6 + (v / max) * 20);
  const op = down ? 0.35 - i * 0.017 : [0.28, 0.42, 0.56, 1][Math.floor(i / 3.5)];
  return { flex: 1, height: h, borderRadius: 3, background: `rgba(${bar},${op})` };
};
```

Sur un thème `down`, l'opacité décroît vers aujourd'hui : le bloc s'éteint visuellement. C'est l'intention du design, garde-la.

## 4. Rendu

```tsx
{concerns.length > 0 && (
  <div className="mb-6">
    <div className="flex items-baseline justify-between mx-1 mb-3.5">
      <h2 className="text-sm font-bold text-on-surface-variant">En ce moment</h2>
      <span className="text-xs text-outline">14 derniers jours</span>
    </div>

    <div className="flex flex-col gap-2.5">
      {concerns.map((c, i) => {
        const t = CONCERN_TINTS[i % CONCERN_TINTS.length];
        const max = Math.max(...c.bars, 1);
        return (
          <div key={c.theme} className="rounded-[26px] p-5" style={{ background: t.bg }}>
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: t.fg }}>{c.theme}</span>
              <span className="text-[11px] font-bold" style={{ color: t.sub }}>
                {c.count} mention{c.count > 1 ? "s" : ""}
              </span>
              <span className="flex-1" />
              <span className="text-[11px] font-bold" style={{ color: t.sub }}>{TREND_LABEL[c.trend]}</span>
            </div>

            <p className="text-[15px] leading-[23px] font-medium mt-2.5 text-pretty" style={{ color: t.fg }}>
              {c.sentence}
            </p>

            <div className="flex items-end gap-1 h-[26px] mt-4" aria-hidden>
              {c.bars.map((v, j) => (
                <span key={j} style={barStyle(v, max, j, t.bar, c.trend === "down")} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
```

Points de vigilance :
- la section est **décorative et informative, pas actionnable** : rien à cocher, rien à cliquer. Les actions restent dans « À garder en tête » juste en dessous ;
- `aria-hidden` sur la trame de barres — la phrase et le compteur portent déjà l'information ;
- les récaps déjà en base n'ont pas la section `🌡️` : `extractConcerns` renvoie `[]` et la page s'affiche comme avant. Rien à migrer ;
- si une phrase dépasse trois lignes sur 390px, c'est le prompt qu'il faut resserrer, pas le bloc qu'il faut tronquer.
