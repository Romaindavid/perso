"use client";

import { useEffect, useState } from "react";

interface Profile {
  birth_date: string;
  height_cm: number | null;
  gender: string;
  body_fat_pct: number | null;
  skeletal_muscle_kg: number | null;
  bone_mass_kg: number | null;
  water_pct: number | null;
  hr_rest: number | null;
  hr_max: number | null;
  sport_goals: string;
  sport_equipment: string;
  sport_routine: string;
  psy_context: string;
  weight_auto: number | null;
  weight_date: string | null;
  hr_rest_auto: number | null;
  hrv_auto: number | null;
  metrics_date: string | null;
  body_fat_auto: number | null;
  muscle_mass_auto: number | null;
  bone_mass_auto: number | null;
  water_pct_auto: number | null;
  body_date: string | null;
}

const defaultProfile: Profile = {
  birth_date: "", height_cm: null, gender: "male",
  body_fat_pct: null, skeletal_muscle_kg: null, bone_mass_kg: null, water_pct: null,
  hr_rest: null, hr_max: null,
  sport_goals: "", sport_equipment: "", sport_routine: "", psy_context: "",
  weight_auto: null, weight_date: null, hr_rest_auto: null, hrv_auto: null, metrics_date: null,
  body_fat_auto: null, muscle_mass_auto: null, bone_mass_auto: null, water_pct_auto: null, body_date: null,
};

function AutoBadge({ date }: { date: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/10 rounded-full px-2 py-0.5">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      Garmin{date ? ` · ${new Date(date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
    </span>
  );
}

function AutoCard({ label, value, unit }: { label: string; value: number | null; unit: string; date: string | null }) {
  return (
    <div className="rounded-xl bg-primary/10 px-3 py-2.5">
      <span className="text-xs text-on-surface-variant">{label}</span>
      <p className="text-lg font-bold text-primary mt-0.5">
        {value ?? "—"} <span className="text-xs font-normal">{unit}</span>
      </p>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-on-surface-variant">{label}</label>
      {children}
      {hint && <p className="text-xs text-outline mt-0.5">{hint}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, unit }: { value: number | null; onChange: (v: number | null) => void; unit?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        className="flex-1 mt-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-base focus:outline-none focus:border-primary"
      />
      {unit && <span className="text-sm text-on-surface-variant mt-1">{unit}</span>}
    </div>
  );
}

function TextArea({ value, onChange, rows, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows || 3}
      placeholder={placeholder}
      className="w-full mt-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
    />
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile({ ...defaultProfile, ...data });
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date).getTime()) / 31557600000)
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profil</h1>

      {/* Données auto Garmin */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-on-surface-variant">Données Garmin</h2>
          <AutoBadge date={profile.metrics_date} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <AutoCard label="Poids" value={profile.weight_auto} unit="kg" date={profile.weight_date} />
          <AutoCard label="FC repos" value={profile.hr_rest_auto} unit="bpm" date={profile.metrics_date} />
          <AutoCard label="HRV" value={profile.hrv_auto} unit="ms" date={profile.metrics_date} />
        </div>
        {(profile.body_fat_auto || profile.muscle_mass_auto || profile.bone_mass_auto || profile.water_pct_auto) ? (
          <div className="grid grid-cols-2 gap-2">
            <AutoCard label="Masse grasse" value={profile.body_fat_auto} unit="%" date={profile.body_date} />
            <AutoCard label="Masse musc." value={profile.muscle_mass_auto} unit="kg" date={profile.body_date} />
            <AutoCard label="Masse osseuse" value={profile.bone_mass_auto} unit="kg" date={profile.body_date} />
            <AutoCard label="Hydratation" value={profile.water_pct_auto} unit="%" date={profile.body_date} />
          </div>
        ) : (
          <p className="text-xs text-outline">Composition corporelle : sync ta balance Garmin</p>
        )}
      </div>

      {/* Identité */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-3">
        <h2 className="text-sm font-medium text-on-surface-variant">Identité</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Naissance" hint={age ? `${age} ans` : undefined}>
            <input
              type="date"
              value={profile.birth_date || ""}
              onChange={(e) => update("birth_date", e.target.value)}
              className="w-full mt-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Taille">
            <NumberInput value={profile.height_cm} onChange={(v) => update("height_cm", v)} unit="cm" />
          </Field>
          <Field label="Genre">
            <select
              value={profile.gender}
              onChange={(e) => update("gender", e.target.value)}
              className="w-full mt-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="male">Homme</option>
              <option value="female">Femme</option>
            </select>
          </Field>
          <Field label="FC max">
            <NumberInput value={profile.hr_max} onChange={(v) => update("hr_max", v)} unit="bpm" />
          </Field>
        </div>
      </div>

      {/* Composition corporelle (manuel — fallback si pas de données Garmin) */}
      {!profile.body_fat_auto && (
        <div className="bg-surface-container-low rounded-3xl p-4 space-y-3">
          <h2 className="text-sm font-medium text-on-surface-variant">Composition corporelle</h2>
          <p className="text-xs text-outline">Saisie manuelle — en attente sync balance Garmin</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Masse grasse">
              <NumberInput value={profile.body_fat_pct} onChange={(v) => update("body_fat_pct", v)} unit="%" />
            </Field>
            <Field label="Masse musc.">
              <NumberInput value={profile.skeletal_muscle_kg} onChange={(v) => update("skeletal_muscle_kg", v)} unit="kg" />
            </Field>
            <Field label="Masse osseuse">
              <NumberInput value={profile.bone_mass_kg} onChange={(v) => update("bone_mass_kg", v)} unit="kg" />
            </Field>
            <Field label="Hydratation">
              <NumberInput value={profile.water_pct} onChange={(v) => update("water_pct", v)} unit="%" />
            </Field>
          </div>
        </div>
      )}

      {/* Sport */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-4">
        <h2 className="text-sm font-medium text-on-surface-variant">Sport</h2>
        <Field label="Objectifs">
          <TextArea
            value={profile.sport_goals}
            onChange={(v) => update("sport_goals", v)}
            placeholder="Ex: ventre plat d'ici fin juillet, définition épaules..."
          />
        </Field>
        <Field label="Matériel disponible">
          <TextArea
            value={profile.sport_equipment}
            onChange={(v) => update("sport_equipment", v)}
            placeholder="Ex: rameur 8 niveaux, haltères 5kg x2, vélo de route..."
          />
        </Field>
        <Field label="Routine quotidienne" hint="Séances < 10 min déjà faites chaque jour">
          <TextArea
            value={profile.sport_routine}
            onChange={(v) => update("sport_routine", v)}
            placeholder="Ex: 10 pompes, 10 roue abdo, 20 curls..."
          />
        </Field>
      </div>

      {/* Sauvegarde */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-primary text-on-primary py-3 rounded-full font-medium text-base disabled:opacity-50 transition-opacity"
      >
        {saving ? "Enregistrement..." : saved ? "Enregistré !" : "Enregistrer"}
      </button>
    </div>
  );
}
