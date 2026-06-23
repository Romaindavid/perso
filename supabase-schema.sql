-- Journal entries
create table journal_entries (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) default auth.uid(),
  category text check (category in ('sport', 'psy', 'medical', 'quotidien')) not null,
  content text not null
);

alter table journal_entries enable row level security;

create policy "Users can manage their own entries"
  on journal_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Garmin activities
create table garmin_activities (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) default auth.uid(),
  date date not null,
  type text not null,
  duration_minutes integer not null,
  intensity text,
  calories integer
);

alter table garmin_activities enable row level security;

create policy "Users can manage their own activities"
  on garmin_activities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Garmin sleep
create table garmin_sleep (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) default auth.uid(),
  date date not null,
  duration_hours numeric not null,
  quality text,
  deep_sleep_minutes integer,
  rem_sleep_minutes integer
);

alter table garmin_sleep enable row level security;

create policy "Users can manage their own sleep"
  on garmin_sleep for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Garmin metrics (HR, HRV, weight)
create table garmin_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) default auth.uid(),
  date date not null,
  resting_hr integer,
  hrv integer,
  weight numeric
);

alter table garmin_metrics enable row level security;

create policy "Users can manage their own metrics"
  on garmin_metrics for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
