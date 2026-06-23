export type JournalCategory = "sport" | "psy" | "medical" | "quotidien";

export interface JournalEntry {
  id: string;
  created_at: string;
  category: JournalCategory;
  content: string;
  user_id: string;
}

export interface GarminActivity {
  id: string;
  date: string;
  type: string;
  duration_minutes: number;
  intensity: string;
  calories: number;
}

export interface GarminSleep {
  id: string;
  date: string;
  duration_hours: number;
  quality: string;
  deep_sleep_minutes: number;
  rem_sleep_minutes: number;
}

export interface GarminMetrics {
  id: string;
  date: string;
  resting_hr: number | null;
  hrv: number | null;
  weight: number | null;
}

export type GenerationType = "sport" | "psy" | "medical";
