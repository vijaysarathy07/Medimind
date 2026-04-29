import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { decrementAndCheckStock } from '../services/inventoryService';

export type MealRelation = 'before_meal' | 'with_meal' | 'after_meal' | 'independent';
export type ReminderStatus = 'pending' | 'taken' | 'skipped' | 'missed';

export type ReminderItem = {
  id:             string;
  scheduled_time: string;
  taken_at:       string | null;
  skipped_at:     string | null;
  status:         ReminderStatus;
  medicine: {
    id:           string;
    name:         string;
    dosage:       string;
    meal_relation: MealRelation;
  };
};

export const OVERDUE_MS = 2 * 60 * 60 * 1000;

export function isOverdue(scheduled_time: string): boolean {
  return Date.now() - new Date(scheduled_time).getTime() > OVERDUE_MS;
}

// ─── Dev mock data ────────────────────────────────────────────
// Shown when Supabase is unreachable (no network / not yet set up).
// Replace with real data once Supabase + Auth are connected.
function buildMockReminders(): ReminderItem[] {
  const today = new Date();
  const t = (h: number, m = 0) => {
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id:             'mock-1',
      scheduled_time: t(8),
      taken_at:       t(8, 3),
      skipped_at:     null,
      status:         'taken',
      medicine:       { id: 'med-1', name: 'Metformin',  dosage: '500mg', meal_relation: 'after_meal'  },
    },
    {
      id:             'mock-2',
      scheduled_time: t(14),
      taken_at:       null,
      skipped_at:     null,
      status:         'pending',
      medicine:       { id: 'med-2', name: 'Lisinopril', dosage: '10mg',  meal_relation: 'independent' },
    },
    {
      id:             'mock-3',
      scheduled_time: t(20),
      taken_at:       null,
      skipped_at:     null,
      status:         'pending',
      medicine:       { id: 'med-3', name: 'Atorvastatin', dosage: '20mg', meal_relation: 'after_meal' },
    },
  ];
}

// ─── helpers ─────────────────────────────────────────────────

function dayBounds(): { start: string; end: string } {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ─── hook ─────────────────────────────────────────────────────

export function useTodaySchedule() {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const fetchSchedule = useCallback(async () => {
    const { start, end } = dayBounds();

    try {
      const { data, error: err } = await supabase
        .from('reminders')
        .select(`
          id,
          scheduled_time,
          taken_at,
          skipped_at,
          status,
          medicines ( id, name, dosage, meal_relation )
        `)
        .gte('scheduled_time', start)
        .lt('scheduled_time', end)
        .order('scheduled_time', { ascending: true });

      if (err) throw err;

      setUsingMock(false);
      setError(null);
      setReminders(
        (data ?? []).map((row: any) => ({
          id:             row.id,
          scheduled_time: row.scheduled_time,
          taken_at:       row.taken_at,
          skipped_at:     row.skipped_at,
          status:         row.status as ReminderStatus,
          medicine: {
            id:            row.medicines.id,
            name:          row.medicines.name,
            dosage:        row.medicines.dosage,
            meal_relation: row.medicines.meal_relation as MealRelation,
          },
        }))
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[useTodaySchedule] fetch failed, using mock data:', msg);

      // Fall back to mock data so the UI is never broken during development
      if (__DEV__) {
        setUsingMock(true);
        setReminders(buildMockReminders());
        setError(null); // don't surface to UI — mock data replaces the error
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();

    const channel = supabase
      .channel('today-schedule-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reminders' }, fetchSchedule)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reminders' }, fetchSchedule)
      .subscribe();

    const tick = setInterval(fetchSchedule, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, [fetchSchedule]);

  // Optimistic take
  async function takeDose(id: string) {
    if (usingMock) {
      // Update mock state locally — no DB call
      const now = new Date().toISOString();
      setReminders(prev =>
        prev.map(r => r.id === id ? { ...r, status: 'taken' as const, taken_at: now } : r)
      );
      return;
    }

    const now      = new Date().toISOString();
    const reminder = reminders.find(r => r.id === id);

    setReminders(prev =>
      prev.map(r => r.id === id ? { ...r, status: 'taken' as const, taken_at: now } : r)
    );

    const { error: err } = await supabase
      .from('reminders')
      .update({ status: 'taken', taken_at: now })
      .eq('id', id);

    if (err) { fetchSchedule(); return; }

    if (reminder?.medicine?.id) {
      decrementAndCheckStock(reminder.medicine.id).catch(console.warn);
    }
  }

  // Optimistic skip
  async function skipDose(id: string) {
    if (usingMock) {
      const now = new Date().toISOString();
      setReminders(prev =>
        prev.map(r => r.id === id ? { ...r, status: 'skipped' as const, skipped_at: now } : r)
      );
      return;
    }

    const now = new Date().toISOString();
    setReminders(prev =>
      prev.map(r => r.id === id ? { ...r, status: 'skipped' as const, skipped_at: now } : r)
    );
    const { error: err } = await supabase
      .from('reminders')
      .update({ status: 'skipped', skipped_at: now })
      .eq('id', id);
    if (err) fetchSchedule();
  }

  return {
    reminders,
    loading: loading && reminders.length === 0,
    error,
    usingMock,
    refetch:  fetchSchedule,
    takeDose,
    skipDose,
  };
}
