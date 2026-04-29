import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { checkAndSendAlerts } from './alertService';

export const ALERT_TASK = 'MEDIMIND_CAREGIVER_ALERT_CHECK';

// ─────────────────────────────────────────────────────────────
// Task definition MUST run at module-load time (not inside a
// component or async callback) so the OS can wake the task.
// This file is imported as a side-effect at the top of App.tsx.
// ─────────────────────────────────────────────────────────────
TaskManager.defineTask(ALERT_TASK, async () => {
  try {
    console.log('[BackgroundTask] running caregiver alert check');
    await checkAndSendAlerts();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.warn('[BackgroundTask] error:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─────────────────────────────────────────────────────────────
// Call this once (guarded) from App.tsx useEffect after the
// user has signed in, so the task survives app restarts.
// ─────────────────────────────────────────────────────────────
export async function registerAlertTask(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();

    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
        status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.log('[BackgroundTask] background fetch is disabled on this device');
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(ALERT_TASK);
    if (isRegistered) return; // Already registered — don't double-register

    await BackgroundFetch.registerTaskAsync(ALERT_TASK, {
      minimumInterval: 30 * 60, // 30 minutes (OS may run it less often on iOS)
      stopOnTerminate:  false,   // Continue after app is killed (Android)
      startOnBoot:      true,    // Restart after device reboot (Android)
    });

    console.log('[BackgroundTask] caregiver alert task registered');
  } catch (err) {
    // Non-fatal: background tasks are best-effort
    console.warn('[BackgroundTask] registration failed:', err);
  }
}

export async function unregisterAlertTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(ALERT_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(ALERT_TASK);
  }
}
