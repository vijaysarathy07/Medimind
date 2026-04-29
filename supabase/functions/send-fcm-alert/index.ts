// Supabase Edge Function — Deno runtime
// Sends push notifications via FCM HTTP V1 API using service account auth

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY        = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVICE_ACCOUNT_RAW = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(SERVICE_ACCOUNT_RAW);

  const header  = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  }));

  const signingInput = `${header}.${payload}`;

  const pem = sa.private_key
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`OAuth error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

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

  let body: { expo_push_token: string; title: string; body: string; data?: Record<string, string> };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { expo_push_token: fcmToken, title, body: messageBody, data } = body;
  if (!fcmToken || !title || !messageBody) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const sa          = JSON.parse(SERVICE_ACCOUNT_RAW);
    const accessToken = await getAccessToken();

    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          message: {
            token:        fcmToken,
            notification: { title, body: messageBody },
            data:         data ?? {},
            android: {
              priority:     "high",
              notification: { sound: "default" },
            },
          },
        }),
      }
    );

    const fcmBody = await fcmRes.json();
    if (!fcmRes.ok) {
      console.error("[FCM] Error:", JSON.stringify(fcmBody));
      return new Response(JSON.stringify({ error: "FCM error", detail: fcmBody }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[FCM] Exception:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
