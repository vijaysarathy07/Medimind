import { supabase } from './supabase';

// ─── types ───────────────────────────────────────────────────

type ReminderRow = {
  id:             string;
  medicine_id:    string;
  scheduled_time: string;
  medicines:      { id: string; name: string } | { id: string; name: string }[];
};

type CaregiverRow = { id: string; name: string; phone: string; expo_push_token: string | null };

// ─── helpers ─────────────────────────────────────────────────

function fmt12(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// Supabase returns the joined row either as an object or single-item array
// depending on the relationship cardinality. Normalise to an object.
function normMedicine(raw: ReminderRow['medicines']): { id: string; name: string } | null {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

// ─── result type ─────────────────────────────────────────────

export type AlertCheckResult =
  | { status: 'no_user' }
  | { status: 'no_overdue_reminders' }
  | { status: 'no_caregivers' }
  | { status: 'done'; sent: number; skipped: number; failed: number; errors: string[] };

// ─── main export ─────────────────────────────────────────────

/**
 * Runs the full overdue-reminder → caregiver-alert pipeline.
 * Safe to call from a background task or from the UI.
 */
export async function checkAndSendAlerts(): Promise<AlertCheckResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'no_user' };

  // 1. Overdue reminders: pending, scheduled >2 h ago, scheduled today
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const todayStart  = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: reminders, error: remErr } = await supabase
    .from('reminders')
    .select(`
      id,
      medicine_id,
      scheduled_time,
      medicines ( id, name )
    `)
    .eq('status', 'pending')
    .lt('scheduled_time', twoHoursAgo.toISOString())
    .gte('scheduled_time', todayStart.toISOString());

  if (remErr) throw new Error(`Reminder query failed: ${remErr.message}`);
  if (!reminders?.length) return { status: 'no_overdue_reminders' };

  // 2. Caregivers for this user
  const { data: caregivers, error: careErr } = await supabase
    .from('caregivers')
    .select('id, name, phone, expo_push_token')
    .eq('user_id', user.id)
    .eq('status', 'accepted');

  if (careErr) throw new Error(`Caregiver query failed: ${careErr.message}`);
  if (!caregivers?.length) return { status: 'no_caregivers' };

  // 3. Patient name (best-effort)
  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single();
  const patientName = profile?.name || 'your patient';

  // 4. Fan out: each overdue dose × each caregiver
  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  const results = await Promise.allSettled(
    (reminders as ReminderRow[]).flatMap((reminder) => {
      const medicine = normMedicine(reminder.medicines);
      if (!medicine) return [];
      return (caregivers as CaregiverRow[]).map((caregiver) =>
        sendIfNotAlreadySent(user.id, reminder, medicine, caregiver, patientName)
      );
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value === 'skipped') skipped++;
      else sent++;
    } else {
      failed++;
      errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  return { status: 'done', sent, skipped, failed, errors };
}

// ─── internal ────────────────────────────────────────────────

async function sendIfNotAlreadySent(
  userId:     string,
  reminder:   ReminderRow,
  medicine:   { id: string; name: string },
  caregiver:  CaregiverRow,
  patientName: string
): Promise<'sent' | 'skipped'> {
  const { data: existing } = await supabase
    .from('caregiver_alerts')
    .select('id')
    .eq('medicine_id',  medicine.id)
    .eq('caregiver_id', caregiver.id)
    .eq('reason',       'missed_dose')
    .gte('sent_at',     reminder.scheduled_time)
    .maybeSingle();

  if (existing) return 'skipped';

  let pushToken = caregiver.expo_push_token;
  if (!pushToken) {
    const digits = caregiver.phone.replace(/\D/g, '').slice(-10);
    const { data: caregiverUser } = await supabase
      .from('users')
      .select('expo_push_token')
      .like('phone', `%${digits}`)
      .maybeSingle();
    pushToken = caregiverUser?.expo_push_token ?? null;
  }

  if (!pushToken) {
    throw new Error(`${caregiver.name} has no push token — they need to install the app.`);
  }

  const { error: pushErr } = await supabase.functions.invoke('send-fcm-alert', {
    body: {
      expo_push_token: pushToken,
      title:           '⚠️ Missed Dose Alert',
      body:            `${patientName} missed their ${medicine.name} dose scheduled at ${fmt12(reminder.scheduled_time)}.`,
      data: {
        type:           'missed_dose',
        medicine_name:  medicine.name,
        patient_name:   patientName,
        scheduled_time: reminder.scheduled_time,
      },
    },
  });

  if (pushErr) {
    throw new Error(`Push alert failed for ${caregiver.name} / ${medicine.name}: ${pushErr.message}`);
  }

  const { error: logErr } = await supabase.from('caregiver_alerts').insert({
    user_id:      userId,
    medicine_id:  medicine.id,
    caregiver_id: caregiver.id,
    reason:       'missed_dose',
  });

  if (logErr) {
    console.warn('[AlertService] failed to log alert:', logErr.message);
  }

  return 'sent';
}

// Re-export the formatter for use in the UI
export { fmt12 };
