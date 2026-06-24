---
name: Perso
colors:
  surface: '#fbf9f5'
  surface-dim: '#dbdad6'
  surface-bright: '#fbf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ef'
  surface-container: '#efeeea'
  surface-container-high: '#eae8e4'
  surface-container-highest: '#e4e2de'
  on-surface: '#1b1c1a'
  on-surface-variant: '#404845'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f0ed'
  outline: '#717975'
  outline-variant: '#c0c8c4'
  primary: '#386458'
  on-primary: '#ffffff'
  primary-container: '#507d70'
  on-primary-container: '#f4fffa'
  inverse-primary: '#a1d0c1'
  secondary: '#356668'
  on-secondary: '#ffffff'
  secondary-container: '#b9ecee'
  on-secondary-container: '#3c6c6e'
  tertiary: '#735802'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffdf96'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
typography:
  font-family: Plus Jakarta Sans
  headline-lg:
    size: 26px
    weight: 700
    line-height: 32px
    letter-spacing: -0.01em
  headline-md:
    size: 24px
    weight: 600
    line-height: 32px
  body-lg:
    size: 18px
    weight: 400
    line-height: 28px
  body-md:
    size: 16px
    weight: 400
    line-height: 24px
  label-md:
    size: 14px
    weight: 600
    line-height: 20px
    letter-spacing: 0.01em
  caption:
    size: 12px
    weight: 400
    line-height: 16px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 8px
  container-padding-mobile: 20px
  gutter: 16px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
shadow:
  card: 0px 10px 30px rgba(94, 139, 126, 0.08)
---

# Design System — Perso

## Philosophie

L'app adopte une approche "Human-First" : sécurité émotionnelle, accessibilité, tranquillité. L'interface est un compagnon calme, pas un outil clinique. Le style est **Soft Minimalist** avec des influences organiques — pas d'angles vifs, pas de contrastes agressifs.

## Palette de couleurs

Dérivée de la nature pour évoquer la sérénité.

| Rôle | Couleur | Hex | Usage |
|------|---------|-----|-------|
| Primary | Sauge profonde | `#386458` | Actions principales, brand, barres de progression |
| Primary container | Sauge moyenne | `#507d70` | Avatars, badges, fonds accentués |
| Secondary | Sarcelle | `#356668` | Accents, états positifs |
| Secondary container | Sarcelle claire | `#b9ecee` | Fonds de highlight |
| Tertiary | Sable chaud | `#735802` | Warnings doux, notifications non-urgentes |
| Tertiary container | Or doux | `#ffdf96` | Dots routine, badges accomplissement |
| Surface | Crème de lait | `#fbf9f5` | Background principal |
| Surface container | Crème tiède | `#efeeea` | Fonds de sections |
| On-surface | Charbon doux | `#1b1c1a` | Texte principal |
| On-surface-variant | Gris sauge | `#404845` | Texte secondaire, labels |
| Outline | Gris moyen | `#717975` | Bordures subtiles |
| Error | Rouge doux | `#ba1a1a` | Alertes, ligne objectif poids |

### Signaux tricolores

- **Vert** = `primary` (#386458) — bon état, objectif atteint
- **Orange** = `tertiary` (#735802) — attention, fatigue légère
- **Rouge** = `error` (#ba1a1a) — alerte, fatigue accumulée

Pas de jaune ambigu. Les signaux utilisent un dot rond (`w-2 h-2 rounded-full`) à côté de la valeur.

## Typographie

**Plus Jakarta Sans** — friendly, apertures ouvertes, terminaisons arrondies.

- Titres en sentence case ("État de forme", pas "ÉTAT DE FORME")
- Line heights généreux pour un rendu aéré
- Pas d'all-caps ni de condensed

| Style | Taille | Poids | Line-height | Usage |
|-------|--------|-------|-------------|-------|
| headline-lg | 26px | 700 | 32px | Titre principal (mobile) |
| headline-md | 24px | 600 | 32px | Sous-titres |
| body-lg | 18px | 400 | 28px | Texte de lecture |
| body-md | 16px | 400 | 24px | Texte courant |
| label-md | 14px | 600 | 20px | Labels, boutons |
| caption | 12px | 400 | 16px | Métadonnées, dates |

## Layout

Mobile-first, colonne centrée avec `max-w-lg mx-auto`.

- Padding horizontal : 20px (mobile)
- Espacement vertical entre blocs : `space-y-6` (24px)
- Espacement interne des cartes : `p-5` (20px) ou `p-3.5` (14px pour les petites cartes)
- Grille base : 8px

## Élévation & ombres

Pas de bordures franches. Profondeur par layering tonal et ombres ambiantes.

- **Shadow carte** : `0px 10px 30px rgba(94, 139, 126, 0.08)` — ombre teintée sauge
- **Cartes** : `bg-white` sur fond `surface` crème — le contraste suffit avec l'ombre
- **Modale / overlay** : `backdrop-blur-xl` (15-20px) avec fond semi-transparent

## Formes

Extra rounded. Aucun angle vif.

| Élément | Rayon |
|---------|-------|
| Boutons | `rounded-full` (pill) |
| Cartes | `rounded-2xl` (16px) ou `rounded-3xl` (24px) |
| Inputs | `rounded-xl` (12px) |
| Mini éléments (dots, barres) | `rounded-full` |
| Icônes | Caps et joins arrondis, poids medium |

## Composants

### Cartes (Cards)

```
bg-white rounded-2xl p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]
```

Pas de bordure. L'ombre + le fond blanc sur crème suffisent.

### Cartes métriques (petites)

```
bg-white rounded-2xl p-3.5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]
```

Contenu : label (caption, semibold, on-surface-variant) + valeur (text-lg, bold) + signal dot + mini-graphe ou tendance.

### Boutons

Pill shape. Primary = fond `bg-primary text-on-primary`. Désactivé = `opacity-50`.

```
bg-primary text-on-primary py-3 rounded-full font-medium text-base
```

### Barres de progression

```
<div class="h-2 bg-surface-container-highest rounded-full">
  <div class="h-full bg-primary rounded-full" style="width: 66%" />
</div>
```

Épaisse (h-2), arrondie. Pas de pourcentage chiffré — la barre parle.

### Dots de routine (calendrier semaine)

```
w-8 h-8 rounded-full
```

- Fait : `bg-tertiary-container text-tertiary` + "✓"
- Pas fait (passé) : `bg-surface-container-highest text-outline`
- Futur : `bg-surface-container-highest/50 text-outline`

### Badges Garmin (profil)

```
inline-flex items-center gap-1 text-[10px] text-primary bg-primary/10 rounded-full px-2 py-0.5
```

Avec une icône check (✓) + "Garmin · date".

### Bottom nav

```
fixed bottom-0 bg-surface/80 backdrop-blur-xl border-t border-outline-variant/30
```

- 4 onglets : Dashboard, Journal, Assistant, Profil
- Actif : `text-primary`, icône filled
- Inactif : `text-on-surface-variant`, icône stroke

### Inputs

```
bg-surface border border-outline-variant rounded-xl px-3 py-2 focus:outline-none focus:border-primary
```

Focus = bordure primary, pas de glow épais.

### Textarea

```
bg-surface border border-outline-variant rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-primary
```

### Catégories journal

Pills sélectionnables :
- Actif : `bg-primary text-on-primary rounded-full`
- Inactif : `bg-surface-container text-on-surface-variant rounded-full`

## Mini-graphiques

Utiliser Recharts `LineChart` sans axes visibles pour les aperçus compacts :

```tsx
<ResponsiveContainer width="100%" height={60}>
  <LineChart data={data}>
    <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
    <Line dataKey="value" stroke="#386458" strokeWidth={2} dot={false} />
  </LineChart>
</ResponsiveContainer>
```

Ligne objectif poids = `ReferenceLine` en rouge pointillé (`strokeDasharray="4 3"`).

## Animations

- Transitions : `transition-colors` pour les changements d'état
- Spinner : `animate-spin` sur le bouton sync
- Pas d'animation complexe — le calme prime

## Structure des écrans

### Dashboard
1. Header : avatar + "Perso" + sync
2. État de forme : 3 cartes (Sommeil %, Récup %, Humeur)
3. Activité semaine : Routine (streak + dots), Muscu X/2, Cardio X/3
4. Poids : valeur + delta + mini-courbes 30j et 2026

### Journal
Saisie texte libre + catégories (Sport, Psy, Médical, Quotidien). Liste des entrées récentes.

### Assistant (Générer)
Choix du type (Séance sport, Bilan psy, Rapport médical) → paramètres optionnels → génération Claude.

### Profil
Données Garmin auto (poids, FC, HRV, composition corporelle) + saisie manuelle (identité, objectifs sport, matériel, notes médicales).
