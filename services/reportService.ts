import { supabase } from './supabase';

// ─── types ───────────────────────────────────────────────────

export type MedicineStats = {
  id:           string;
  name:         string;
  dosage:       string;
  frequency:    string;
  scheduled:    number;
  taken:        number;
  missed:       number;
  skipped:      number;
  upcoming:     number;
  adherence:    number; // 0–100, based on completed doses only
};

export type DayStats = {
  date:       string; // YYYY-MM-DD
  dayLabel:   string; // Mon, Tue …
  dateLabel:  string; // Dec 7
  scheduled:  number;
  taken:      number;
  missed:     number;
  upcoming:   number;
  adherence:  number; // 0–100 of completed doses
};

export type WeeklyReport = {
  patientName:      string;
  startDate:        Date;
  endDate:          Date;
  totalScheduled:   number;
  totalTaken:       number;
  totalMissed:      number;
  totalSkipped:     number;
  totalUpcoming:    number;
  overallAdherence: number;
  medicines:        MedicineStats[];
  dayStats:         DayStats[];
};

// ─── helpers ─────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);
const OVERDUE_MS = 2 * 60 * 60 * 1000;

type NormStatus = 'taken' | 'skipped' | 'missed' | 'upcoming';

function normaliseStatus(dbStatus: string, scheduledIso: string): NormStatus {
  if (dbStatus === 'taken')   return 'taken';
  if (dbStatus === 'skipped') return 'skipped';

  const dayKey = scheduledIso.slice(0, 10);

  if (dayKey < TODAY) return 'missed'; // Past day — no excuse

  // Today: overdue by >2 h counts as missed; otherwise still upcoming
  const overdue = Date.now() - new Date(scheduledIso).getTime() > OVERDUE_MS;
  return overdue ? 'missed' : 'upcoming';
}

function adherencePct(taken: number, missed: number, skipped: number): number {
  const completed = taken + missed + skipped;
  return completed > 0 ? Math.round((taken / completed) * 100) : 0;
}

// ─── main export ─────────────────────────────────────────────

export async function generateWeeklyReport(): Promise<WeeklyReport> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // Date window: last 7 calendar days including today
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  // Patient name
  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single();
  const patientName = profile?.name || 'Patient';

  // All reminders in range, joined with medicines
  const { data: rows, error } = await supabase
    .from('reminders')
    .select(`
      id,
      scheduled_time,
      status,
      medicines ( id, name, dosage, frequency )
    `)
    .gte('scheduled_time', startDate.toISOString())
    .lte('scheduled_time', endDate.toISOString())
    .order('scheduled_time', { ascending: true });

  if (error) throw new Error(error.message);

  // ── Build per-medicine stats ──────────────────────────────
  const medMap = new Map<string, MedicineStats>();

  // ── Build per-day stats (keyed YYYY-MM-DD) ────────────────
  const dayMap = new Map<string, Omit<DayStats, 'dayLabel' | 'dateLabel'>>();
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, scheduled: 0, taken: 0, missed: 0, upcoming: 0, adherence: 0 });
  }

  for (const row of rows ?? []) {
    const med = Array.isArray((row as any).medicines)
      ? (row as any).medicines[0]
      : (row as any).medicines;
    if (!med) continue;

    const status = normaliseStatus(row.status, row.scheduled_time);
    const dayKey = row.scheduled_time.slice(0, 10);

    // medicine map
    if (!medMap.has(med.id)) {
      medMap.set(med.id, {
        id:        med.id,
        name:      med.name,
        dosage:    med.dosage,
        frequency: med.frequency,
        scheduled: 0, taken: 0, missed: 0, skipped: 0, upcoming: 0, adherence: 0,
      });
    }
    const ms = medMap.get(med.id)!;
    ms.scheduled++;
    if (status === 'taken')   ms.taken++;
    if (status === 'missed')  ms.missed++;
    if (status === 'upcoming') ms.upcoming++;
    if (row.status === 'skipped') ms.skipped++;

    // day map
    const ds = dayMap.get(dayKey);
    if (ds) {
      ds.scheduled++;
      if (status === 'taken')    ds.taken++;
      if (status === 'missed')   ds.missed++;
      if (status === 'upcoming') ds.upcoming++;
    }
  }

  // Compute adherence percentages
  const medicines: MedicineStats[] = [];
  for (const ms of medMap.values()) {
    ms.adherence = adherencePct(ms.taken, ms.missed, ms.skipped);
    medicines.push(ms);
  }
  medicines.sort((a, b) => a.name.localeCompare(b.name));

  const dayStats: DayStats[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key  = d.toISOString().slice(0, 10);
    const ds   = dayMap.get(key)!;
    ds.adherence = adherencePct(ds.taken, ds.missed, 0);
    dayStats.push({
      ...ds,
      dayLabel:  DAY_NAMES[d.getDay()],
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }

  const totalScheduled = medicines.reduce((s, m) => s + m.scheduled, 0);
  const totalTaken     = medicines.reduce((s, m) => s + m.taken,     0);
  const totalMissed    = medicines.reduce((s, m) => s + m.missed,    0);
  const totalSkipped   = medicines.reduce((s, m) => s + m.skipped,   0);
  const totalUpcoming  = medicines.reduce((s, m) => s + m.upcoming,  0);

  return {
    patientName,
    startDate,
    endDate,
    totalScheduled,
    totalTaken,
    totalMissed,
    totalSkipped,
    totalUpcoming,
    overallAdherence: adherencePct(totalTaken, totalMissed, totalSkipped),
    medicines,
    dayStats,
  };
}
