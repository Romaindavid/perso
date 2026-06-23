#!/usr/bin/env python3
"""Sync recent Garmin data (last 3 days) and output as JSON to stdout."""

import json
import sys
from datetime import datetime, timedelta
from garminconnect import Garmin

def main():
    email = sys.argv[1] if len(sys.argv) > 1 else None
    password = sys.argv[2] if len(sys.argv) > 2 else None

    if not email or not password:
        print(json.dumps({"error": "Missing credentials"}))
        sys.exit(1)

    client = Garmin(email, password)
    client.login()

    today = datetime.now().date()
    since = today - timedelta(days=3)

    result = {"activities": [], "sleep": [], "metrics": []}

    # Activities (last 20 should cover 3 days)
    activities = client.get_activities(0, 20)
    for a in activities:
        start = a.get("startTimeLocal", "")
        if start[:10] >= str(since):
            result["activities"].append({
                "date": start[:10],
                "type": a.get("activityType", {}).get("typeKey", "unknown"),
                "duration_minutes": round((a.get("duration", 0)) / 60),
                "average_hr": a.get("averageHR"),
                "calories": a.get("calories", 0),
            })

    # Sleep
    for i in range(3):
        day = since + timedelta(days=i)
        try:
            sleep = client.get_sleep_data(day.isoformat())
            ds = sleep.get("dailySleepDTO", {})
            if ds and ds.get("sleepTimeSeconds"):
                result["sleep"].append({
                    "date": str(day),
                    "duration_hours": round(ds.get("sleepTimeSeconds", 0) / 3600, 2),
                    "deep_sleep_minutes": round(ds.get("deepSleepSeconds", 0) / 60),
                    "rem_sleep_minutes": round(ds.get("remSleepSeconds", 0) / 60),
                    "quality": ds.get("sleepScoreQualifier"),
                })
        except Exception:
            pass

    # Heart rate & HRV & weight
    for i in range(3):
        day = since + timedelta(days=i)
        m = {"date": str(day), "resting_hr": None, "hrv": None, "weight": None}
        try:
            hr = client.get_rhr_day(day.isoformat())
            if hr and hr.get("allMetrics", {}).get("metricsMap", {}).get("RESTING_HEART_RATE"):
                vals = hr["allMetrics"]["metricsMap"]["RESTING_HEART_RATE"]
                if vals:
                    m["resting_hr"] = int(vals[0].get("value", 0))
        except Exception:
            pass
        try:
            hrv = client.get_hrv_data(day.isoformat())
            if hrv and hrv.get("hrvSummary", {}).get("weeklyAvg"):
                m["hrv"] = int(hrv["hrvSummary"]["weeklyAvg"])
        except Exception:
            pass
        try:
            w = client.get_body_composition(day.isoformat())
            if w and w.get("weight"):
                m["weight"] = round(w["weight"] / 1000, 1)
        except Exception:
            pass
        result["metrics"].append(m)

    print(json.dumps(result))

if __name__ == "__main__":
    main()
