// Supabase Edge Function — Deno runtime
// Deploy: Supabase Dashboard → Edge Functions → New Function → paste this file
//
// Required secrets (Dashboard → Project Settings → Edge Functions → Secrets):
//   TWILIO_ACCOUNT_SID   — your Twilio Account SID (starts with AC...)
//   TWILIO_AUTH_TOKEN    — your Twilio Auth Token
//   TWILIO_WHATSAPP_FROM — sender number, e.g. "whatsapp:+14155238886"
//                          Use the sandbox number for testing, or your verified
//                          WhatsApp Business number for production.
//
// Twilio Sandbox note:
//   Each caregiver must first text "join <sandbox-keyword>" to +1 415 523 8886
//   before they can receive messages in sandbox mode.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── env ─────────────────────────────────────────────────────
const TWILIO_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM  = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "whatsapp:+14155238886";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── helpers ─────────────────────────────────────────────────

function fmt12(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  // Keep times in the local timezone stored in the ISO string
  const local = new Date(iso);
  const lh = local.getHours(), lm = local.getMinutes();
  const ampm = lh >= 12 ? "PM" : "AM";
  return `${lh % 12 || 12}:${String(lm).padStart(2, "0")} ${ampm}`;
}

function toWhatsAppNumber(phone: string): string {
  // Ensure the number is in E.164 format and prefixed with whatsapp:
  const digits = phone.replace(/[^\d+]/g, "");
  const e164   = digits.startsWith("+") ? digits : `+${digits}`;
  return `whatsapp:${e164}`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── handler ─────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  // Verify the caller is an authenticated MediMind user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Validate JWT against Supabase auth
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let body: {
    caregiver_phone: string;
    caregiver_name:  string;
    patient_name:    string;
    medicine_name:   string;
    scheduled_time:  string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { caregiver_phone, caregiver_name, patient_name, medicine_name, scheduled_time } = body;

  if (!caregiver_phone || !caregiver_name || !medicine_name || !scheduled_time) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Build WhatsApp message
  const message =
    `Hi ${caregiver_name}, ${patient_name} missed their ${medicine_name} dose ` +
    `scheduled at ${fmt12(scheduled_time)}. Please check on them.`;

  const to = toWhatsAppNumber(caregiver_phone);

  // Call Twilio Messages API
  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
      },
      body: new URLSearchParams({
        From: TWILIO_FROM,
        To:   to,
        Body: message,
      }).toString(),
    }
  );

  const twilioBody = await twilioRes.json();

  if (!twilioRes.ok) {
    console.error("[send-whatsapp-alert] Twilio error:", twilioBody);
    return new Response(
      JSON.stringify({ error: "Twilio error", detail: twilioBody }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  console.log(`[send-whatsapp-alert] sent to ${to}, sid=${twilioBody.sid}`);

  return new Response(
    JSON.stringify({ ok: true, sid: twilioBody.sid }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
