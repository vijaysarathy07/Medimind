import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// One-shot reminder at a specific Date
export async function scheduleDoseReminder(
  medicineName: string,
  date: Date,
  id: string
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: 'Time for your medicine 💊',
      body: `Take ${medicineName} now`,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

// Daily repeating reminder at a fixed hour:minute
export async function scheduleDailyReminder(
  id: string,
  medicineName: string,
  dosage: string,
  time: Date
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: '💊 Time for your medicine',
      body: `Take ${medicineName} ${dosage}`,
      sound: true,
      data: { notificationId: id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.getHours(),
      minute: time.getMinutes(),
    },
  });
}

export async function cancelReminder(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function cancelAllRemindersForMedicine(medicineId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter((n) =>
    (n.identifier as string).startsWith(`med_${medicineId}`)
  );
  await Promise.all(toCancel.map((n) => cancelReminder(n.identifier)));
}
