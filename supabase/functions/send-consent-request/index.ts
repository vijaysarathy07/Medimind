// Supabase Edge Function — Deno runtime
// Sends a consent request push notification when a patient adds a caregiver

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { caregiver_id: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { caregiver_id } = body;
  if (!caregiver_id) {
    return new Response(JSON.stringify({ error: "Missing caregiver_id" }), {
      status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Fetch caregiver record (service role bypasses RLS)
  const { data: caregiver, error: careErr } = await supabase
    .from("caregivers")
    .select("phone, name, user_id")
    .eq("id", caregiver_id)
    .single();

  if (careErr || !caregiver) {
    return new Response(JSON.stringify({ error: "Caregiver not found" }), {
      status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Fetch patient name
  const { data: patient } = await supabase
    .from("users")
    .select("name")
    .eq("id", caregiver.user_id)
    .single();

  // Find caregiver's expo_push_token by phone (service role bypasses RLS)
  const digits = caregiver.phone.replace(/[^0-9]/g, "").slice(-10);
  const { data: caregiverUser } = await supabase
    .from("users")
    .select("expo_push_token")
    .like("phone", `%${digits}`)
    .maybeSingle();

  if (!caregiverUser?.expo_push_token) {
    // Caregiver doesn't have the app yet — not an error
    return new Response(JSON.stringify({ ok: true, notified: false }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const patientName = patient?.name ?? "Someone";

  const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      to:        caregiverUser.expo_push_token,
      title:     "Caregiver Request",
      body:      `${patientName} wants to add you as a caregiver in MediMind. Open the app to accept or decline.`,
      data:      { type: "consent_request", caregiver_id },
      priority:  "high",
      sound:     "default",
      channelId: "medimind-reminders",
    }),
  });

  const expoBody = await expoRes.json();
  console.log(`[consent] Push to caregiver result:`, JSON.stringify(expoBody));

  return new Response(JSON.stringify({ ok: true, notified: true }), {
    status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
