# MediMind — Dev Log

## Architecture Overview

| Layer | Technology |
|---|---|
| Mobile App | React Native + Expo (SDK 54) |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Push Notifications | FCM (Firebase Cloud Messaging) via Supabase Edge Function |
| WhatsApp Alerts | Twilio via Supabase Edge Function |
| Build | expo run:android (local), EAS linked (project: vijayasarathy/medimind) |

---

## Database Tables

| Table | Purpose |
|---|---|
| `users` | One row per auth user. Stores `expo_push_token` (raw FCM token) |
| `medicines` | Medicines added by the patient |
| `reminders` | Scheduled dose instances per medicine |
| `caregivers` | People the patient wants to notify. Has `status` (pending/accepted/declined) |
| `caregiver_alerts` | Log of every alert sent (dedup guard) |

### Important column names
- `users.expo_push_token` — stores raw FCM device token (renamed from `fcm_token`)
- `caregivers.expo_push_token` — caregiver's FCM token (renamed from `fcm_token`)
- `caregivers.status` — `pending` | `accepted` | `declined`

---

## Push Notification Flow

```
App opens / user signs in
  → pushService.ts: getDevicePushTokenAsync()
  → saves raw FCM token to users.expo_push_token
  → also updates caregivers.expo_push_token by phone match

Background task (every 30 min)
  → alertService.ts: checkAndSendAlerts()
  → finds reminders: status=pending, scheduled >2h ago, today
  → finds caregivers: status=accepted only
  → calls Supabase Edge Function: send-fcm-alert
  → Edge Function uses FIREBASE_SERVICE_ACCOUNT secret to get OAuth token
  → calls FCM HTTP V1 API → notification delivered to caregiver
```

---

## Caregiver Consent Flow

```
Patient adds caregiver (phone + name + relationship)
  → inserted with status = 'pending'
  → send-consent-request Edge Function fires
  → looks up caregiver's expo_push_token by phone
  → sends push: "X wants to add you as caregiver"

Caregiver opens app → sees "Requests for You" section
  → taps Accept → status = 'accepted' → will now receive alerts
  → taps Decline → status = 'declined' → never gets alerts
```

---

## Edge Functions (Supabase Dashboard)

| Function | Purpose | Secrets needed |
|---|---|---|
| `send-fcm-alert` | Sends missed dose push to caregiver | `FIREBASE_SERVICE_ACCOUNT` |
| `send-consent-request` | Sends consent request push when caregiver added | none extra |
| `send-whatsapp-alert` | Sends WhatsApp message via Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` |

---

## Supabase Secrets Required

| Secret | Where to get it |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → medimind-13d78 → Project Settings → Service Accounts → Generate new private key |
| `TWILIO_ACCOUNT_SID` | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Twilio Console |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp sandbox number |

---

## Key Files

| File | Purpose |
|---|---|
| `services/pushService.ts` | Registers FCM token on sign-in, listens for refresh |
| `services/alertService.ts` | Checks overdue reminders, fans out alerts to caregivers |
| `services/backgroundTask.ts` | Runs alertService every 30 min in background |
| `screens/CaregiversScreen.tsx` | Caregiver list + status badges + consent requests UI |
| `components/AddCaregiverModal.tsx` | Modal to add a new caregiver |
| `supabase/schema.sql` | Full DB schema + RLS policies |
| `app.json` | Expo config — EAS project ID: `147d6fe3-61cf-4265-80b2-82078fa55f6e` |

---

## RLS Policies (non-obvious ones)

```sql
-- Caregivers can see requests directed at them (by phone match)
"caregivers: read as target"

-- Caregivers can accept/decline requests directed at them
"caregivers: update status as target"
```

---

## Android Build Notes

- `android/app/google-services.json` — must stay, required for FCM to initialize on Android
- `android/build.gradle` — has `com.google.gms:google-services:4.4.1` classpath
- `android/app/build.gradle` — has `apply plugin: 'com.google.gms.google-services'`
- These are build infrastructure only — app code has zero direct Firebase API calls

---

## What We Tried & Learned

### Expo Push Notifications (abandoned)
- Tried switching from raw FCM tokens to Expo Push Tokens (`getExpoPushTokenAsync`)
- Requires FCM credentials uploaded to EAS project to work on Android
- Expo just wraps FCM — no way around FCM on Android
- Reverted to original raw FCM token approach

### Firebase Removal
- Removed: `service-account.json`, root `google-services.json`, `fcmService.ts`
- Firebase credentials now live as Supabase secret (`FIREBASE_SERVICE_ACCOUNT`)
- App code has no Firebase imports or API calls
- FCM still used at the OS level (unavoidable on Android)

---

## Common Issues & Fixes

| Issue | Fix |
|---|---|
| FCM token not saving | Sign out and sign back in to trigger `registerAndSavePushToken()` |
| Old raw FCM token in `expo_push_token` column | `UPDATE users SET expo_push_token = NULL` then sign out/in |
| Missing user profile after table truncate | `INSERT INTO public.users SELECT from auth.users WHERE missing` |
| Medicine insert foreign key error | User profile row missing — run the above insert |
| Edge function 502 | Check Supabase Edge Function logs for exact error |
| Supabase free tier pauses | Upgrade to Pro for production |
