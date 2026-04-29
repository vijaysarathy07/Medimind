import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabase';
import type { ReminderItem } from './useTodaySchedule';

export type WeekDay = {
  label: string;  // "Mo", "Tu" …
  full: boolean;  // true = 100% adherence
  partial: boolean;
  hasData: boolean;
};

export type StreakResult = {
  streak: number;
  weekAdherence: number;   // 0–100, last 7 complete days
  weekDays: WeekDay[];     // last 7 days oldest→newest
  loading: boolean;
};

// Supabase row type for streak query
type HistoricalRow = { scheduled_time: string; status: string };

type DayEntry = { total: number; taken: number };

function isoDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildDayMap(rows: HistoricalRow[]): Map<string, DayEntry> {
  const map = new Map<string, DayEntry>();
  for (const row of rows) {
    const key  = row.scheduled_time.slice(0, 10);
    const prev = map.get(key) ?? { total: 0, taken: 0 };
    map.set(key, {
      total: prev.total + 1,
      taken: prev.taken + (row.status === 'taken' ? 1 : 0),
    });
  }
  return map;
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Accepts today's live reminders so the streak and progress
 * update instantly when the user takes their last dose today —
 * no extra Supabase round-trip needed.
 */
export function useStreak(todayReminders: ReminderItem[]): StreakResult {
  const [histRows, setHistRows] = useState<HistoricalRow[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 61); // 61 days back to be safe

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const { data, error } = await supabase
        .from('reminders')
        .select('scheduled_time, status')
        .gte('scheduled_time', start.toISOString())
        .lt('scheduled_time', todayStart.toISOString()); // exclude today — we get it from props

      if (!error && data) setHistRows(data as HistoricalRow[]);
      setLoading(false);
    }
    fetchHistory();
  }, []);

  return useMemo<StreakResult>(() => {
    const now = new Date();

    // Build historical day map (excludes today)
    const dayMap = buildDayMap(histRows);

    // Inject today from live reminders prop
    const todayKey   = isoDateStr(now);
    const todayTaken = todayReminders.filter(r => r.status === 'taken').length;
    const todayTotal = todayReminders.length;
    if (todayTotal > 0) {
      dayMap.set(todayKey, { total: todayTotal, taken: todayTaken });
    }

    // ── Streak: consecutive fully-complete days going backward ──
    // Include today if complete, else start from yesterday
    const todayEntry   = dayMap.get(todayKey);
    const todayComplete = Boolean(todayEntry && todayEntry.taken === todayEntry.total && todayEntry.total > 0);
    const startOffset  = todayComplete ? 0 : 1;

    let streak = 0;
    for (let i = startOffset; i <= 61; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const entry = dayMap.get(isoDateStr(d));
      if (!entry || entry.total === 0 || entry.taken < entry.total) break;
      streak++;
    }

    // ── Week days: last 7 days oldest→newest ──
    const weekDays: WeekDay[] = [];
    let weekTotal = 0, weekTaken = 0;

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key   = isoDateStr(d);
      const entry = dayMap.get(key);
      const label = DAY_LABELS[d.getDay()];

      if (!entry || entry.total === 0) {
        weekDays.push({ label, full: false, partial: false, hasData: false });
      } else {
        weekTotal += entry.total;
        weekTaken += entry.taken;
        weekDays.push({
          label,
          full:    entry.taken === entry.total,
          partial: entry.taken > 0 && entry.taken < entry.total,
          hasData: true,
        });
      }
    }

    const weekAdherence = weekTotal > 0 ? Math.round((weekTaken / weekTotal) * 100) : 0;

    return { streak, weekAdherence, weekDays, loading };
  }, [histRows, todayReminders, loading]);
}
