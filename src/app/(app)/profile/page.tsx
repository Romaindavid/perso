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
  medical_notes: string;
  psy_context: string;
  weight_auto: number | null;
}

const defaultProfile: Profile = {
  birth_date: "",
  height_cm: null,
  gender: "male",
  body_fat_pct: null,
  skeletal_muscle_kg: null,
  bone_mass_kg: null,
  water_pct: null,
  hr_rest: null,
  hr_max: null,
  sport_goals: "",
  sport_equipment: "",
  sport_routine: "",
  medical_notes: "",
  psy_context: "",
  weight_auto: null,
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-on-surface-variant">{label}</label>
      {children}
      {hint && <p className="text-xs text-outline mt-0.5">{hint}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, unit, placeholder }: { value: number | null; onChange: (v: number | null) => void; unit?: string; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        placeholder={placeholder}
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

      {/* Identité */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-4">
        <h2 className="text-sm font-medium text-on-surface-variant">Identité</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date de naissance" hint={age ? `${age} ans` : undefined}>
            <input
              type="date"
              value={profile.birth_date || ""}
              onChange={(e) => update("birth_date", e.target.value)}
              className="w-full mt-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-base focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Taille">
            <NumberInput value={profile.height_cm} onChange={(v) => update("height_cm", v)} unit="cm" />
          </Field>
        </div>
        <Field label="Genre">
          <select
            value={profile.gender}
            onChange={(e) => update("gender", e.target.value)}
            className="w-full mt-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-base focus:outline-none focus:border-primary"
          >
            <option value="male">Homme</option>
            <option value="female">Femme</option>
          </select>
        </Field>
      </div>

      {/* Composition corporelle */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-4">
        <h2 className="text-sm font-medium text-on-surface-variant">Composition corporelle</h2>
        <div className="rounded-xl bg-primary/10 px-3 py-2">
          <p className="text-sm text-primary font-medium">Poids : {profile.weight_auto ?? "—"} kg</p>
          <p className="text-xs text-outline">Mis à jour automatiquement via Garmin</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Masse grasse">
            <NumberInput value={profile.body_fat_pct} onChange={(v) => update("body_fat_pct", v)} unit="%" />
          </Field>
          <Field label="Masse musc. squelettique">
            <NumberInput value={profile.skeletal_muscle_kg} onChange={(v) => update("skeletal_muscle_kg", v)} unit="kg" />
          </Field>
          <Field label="Masse osseuse">
            <NumberInput value={profile.bone_mass_kg} onChange={(v) => update("bone_mass_kg", v)} unit="kg" />
          </Field>
          <Field label="Masse hydrique">
            <NumberInput value={profile.water_pct} onChange={(v) => update("water_pct", v)} unit="%" />
          </Field>
        </div>
      </div>

      {/* Cardio */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-4">
        <h2 className="text-sm font-medium text-on-surface-variant">Cardio</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="FC repos" hint="Mis à jour auto via Garmin">
            <NumberInput value={profile.hr_rest} onChange={(v) => update("hr_rest", v)} unit="bpm" />
          </Field>
          <Field label="FC max">
            <NumberInput value={profile.hr_max} onChange={(v) => update("hr_max", v)} unit="bpm" />
          </Field>
        </div>
      </div>

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

      {/* Médical */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-4">
        <h2 className="text-sm font-medium text-on-surface-variant">Notes médicales</h2>
        <Field label="Contexte médical">
          <TextArea
            value={profile.medical_notes}
            onChange={(v) => update("medical_notes", v)}
            rows={4}
            placeholder="Antécédents, traitements en cours, allergies..."
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
