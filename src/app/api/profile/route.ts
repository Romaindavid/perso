import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getGarminAutoData(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: latestWeight }, { data: latestMetric }, { data: latestBody }] = await Promise.all([
    supabase
      .from("garmin_metrics")
      .select("weight, date")
      .not("weight", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("garmin_metrics")
      .select("resting_hr, hrv, date")
      .not("resting_hr", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("garmin_metrics")
      .select("body_fat_pct, muscle_mass_kg, bone_mass_kg, water_pct, date")
      .not("body_fat_pct", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .single(),
  ]);

  return {
    weight_auto: latestWeight?.weight || null,
    weight_date: latestWeight?.date || null,
    hr_rest_auto: latestMetric?.resting_hr || null,
    hrv_auto: latestMetric?.hrv || null,
    metrics_date: latestMetric?.date || null,
    body_fat_auto: latestBody?.body_fat_pct || null,
    muscle_mass_auto: latestBody?.muscle_mass_kg || null,
    bone_mass_auto: latestBody?.bone_mass_kg || null,
    water_pct_auto: latestBody?.water_pct || null,
    body_date: latestBody?.date || null,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const garmin = await getGarminAutoData(supabase);
  const { data } = await supabase.from("user_profile").select("*").eq("id", user.id).single();

  return NextResponse.json({ ...(data || { id: user.id }), ...garmin });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const profile = {
    id: user.id,
    updated_at: new Date().toISOString(),
    birth_date: body.birth_date || null,
    height_cm: body.height_cm || null,
    gender: body.gender || null,
    body_fat_pct: body.body_fat_pct || null,
    skeletal_muscle_kg: body.skeletal_muscle_kg || null,
    bone_mass_kg: body.bone_mass_kg || null,
    water_pct: body.water_pct || null,
    hr_rest: body.hr_rest || null,
    hr_max: body.hr_max || null,
    sport_goals: body.sport_goals || null,
    sport_equipment: body.sport_equipment || null,
    sport_routine: body.sport_routine || null,
    medical_notes: body.medical_notes || null,
    psy_context: body.psy_context || null,
  };

  const { error } = await supabase.from("user_profile").upsert(profile);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
