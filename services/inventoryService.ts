import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

type MedRow = {
  id:              string;
  name:            string;
  pill_count:      number;
  refill_alert_at: number;
};

/**
 * Atomically decrements pill_count for a medicine by 1.
 * Fires a local notification the first time the count reaches
 * or drops below refill_alert_at (the threshold crossing).
 *
 * Non-blocking — caller should fire-and-forget with .catch().
 */
export async function decrementAndCheckStock(medicineId: string): Promise<void> {
  const { data: med, error } = await supabase
    .from('medicines')
    .select('id, name, pill_count, refill_alert_at')
    .eq('id', medicineId)
    .single();

  if (error || !med) return;
  const row = med as MedRow;

  if (row.pill_count <= 0) return; // Already empty — nothing to decrement

  const newCount = row.pill_count - 1;

  await supabase
    .from('medicines')
    .update({ pill_count: newCount })
    .eq('id', medicineId);

  // Notify only on the threshold crossing (above → at/below), not every decrement
  if (row.pill_count > row.refill_alert_at && newCount <= row.refill_alert_at) {
    await sendLowStockNotification(medicineId, row.name, newCount);
  }
}

/**
 * Sets pill_count to an explicit value (after a refill).
 * Cancels any pending low-stock notification for this medicine.
 */
export async function updatePillCount(
  medicineId: string,
  newCount: number
): Promise<void> {
  await supabase
    .from('medicines')
    .update({ pill_count: newCount })
    .eq('id', medicineId);

  // Clear the low-stock notification since the user just refilled
  await Notifications.cancelScheduledNotificationAsync(
    lowStockNotifId(medicineId)
  ).catch(() => {/* already gone */});
}

// ─── internal ────────────────────────────────────────────────

function lowStockNotifId(medicineId: string): string {
  return `low_stock_${medicineId}`;
}

async function sendLowStockNotification(
  medicineId: string,
  name: string,
  count: number
): Promise<void> {
  const id = lowStockNotifId(medicineId);

  // Replace any existing low-stock notification for this medicine
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: '💊 Refill Needed',
      body:  `${name} — only ${count} ${count === 1 ? 'pill' : 'pills'} left. Time to refill!`,
      sound: true,
    },
    trigger: null, // Deliver immediately
  });
}
