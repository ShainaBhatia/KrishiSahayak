import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log("ENV CHECK", {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "MISSING",
  SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  FIREBASE_PROJECT_ID: !!Deno.env.get("FIREBASE_PROJECT_ID"),
  FIREBASE_CLIENT_EMAIL: !!Deno.env.get("FIREBASE_CLIENT_EMAIL"),
  FIREBASE_PRIVATE_KEY: !!Deno.env.get("FIREBASE_PRIVATE_KEY"),
  MANDI_API_KEY: !!Deno.env.get("VITE_MANDI_API_KEY"),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ------------------------------------------------------------
// API configuration
// ------------------------------------------------------------

const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";

const MANDI_API_URL =
  "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
// TODO: verify this is your actual data.gov.in resource ID — that API
// normally addresses datasets by a UUID (e.g. 9ef84268-d588-465a-a308-a864a43d0070),
// not a readable slug like the one above. Test the full URL (with your
// real key) in a browser before trusting this in production.

// FIX: was declared as VITE_MANDI_API_KEY but referenced elsewhere as
// MANDI_API_KEY (undefined, crashed on every mandi rule). Renamed
// consistently, and dropped the VITE_ prefix — that prefix means
// "safe to expose in the browser bundle," which does NOT apply to a
// server-side Edge Function secret like this one.
const VITE_MANDI_API_KEY = Deno.env.get("VITE_MANDI_API_KEY");

// ------------------------------------------------------------
// Firebase configuration
// ------------------------------------------------------------

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID")!;
const FIREBASE_CLIENT_EMAIL = Deno.env.get("FIREBASE_CLIENT_EMAIL")!;
const FIREBASE_PRIVATE_KEY = Deno.env.get("FIREBASE_PRIVATE_KEY")!.replace(/\\n/g, "\n");

// ------------------------------------------------------------
// OAuth2 service-account auth for FCM HTTP v1
// ------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get FCM access token: ${await response.text()}`);
  }

  const json = await response.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

// ------------------------------------------------------------
// WEATHER
// ------------------------------------------------------------
// FIX: latitude/longitude no longer come from the rule row directly
// (those columns never existed on alert_rules) — they come from the
// joined farms row instead. See the query in Deno.serve() below,
// which selects alert_rules.*, farms(latitude, longitude, state, district).

async function fetchWeatherData(rule: any): Promise<Record<string, number> | null> {
  const latitude = Number(rule.farms?.latitude);
  const longitude = Number(rule.farms?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.error(
      "Weather rule's linked farm is missing latitude/longitude:",
      rule.id,
      rule.farm_id
    );
    return null;
  }

  const url = new URL(WEATHER_API_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,rain");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Open-Meteo failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const current = json.current;

  if (!current) {
    throw new Error("Open-Meteo response did not contain current weather data.");
  }

  return {
    temperature_c: Number(current.temperature_2m),
    rainfall_mm: Number(current.rain),
  };
}

// ------------------------------------------------------------
// MANDI
// ------------------------------------------------------------
// FIX: state/district now come from the joined farms row. "commodity"
// is just rule.crop_name — already a column on alert_rules, no need
// for a separate one.

async function fetchMandiData(rule: any): Promise<Record<string, number> | null> {
  if (!VITE_MANDI_API_KEY) {
    throw new Error("VITE_MANDI_API_KEY is not configured in Supabase Edge Function secrets.");
  }

  const state = String(rule.farms?.state ?? "").trim();
  const district = String(rule.farms?.district ?? "").trim();
  const commodity = String(rule.crop_name ?? "").trim();

  if (!state || !commodity) {
    console.error(
      "Mandi rule's linked farm/crop is missing state or crop_name:",
      rule.id,
      rule.farm_id
    );
    return null;
  }

  const url = new URL(MANDI_API_URL);
  url.searchParams.set("api-key", VITE_MANDI_API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "10");
  url.searchParams.set("filters[State]", state);
  url.searchParams.set("filters[Commodity]", commodity);

  if (district) {
    url.searchParams.set("filters[District]", district);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Mandi API failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const records = Array.isArray(json.records) ? json.records : [];

  if (records.length === 0) {
    console.warn("Mandi API returned no records:", { state, district, commodity });
    return null;
  }

  const record = records[0];
  const price = Number(record.Modal_Price ?? record.modal_price);

  if (!Number.isFinite(price)) {
    console.error("Mandi record did not contain a valid modal price:", record);
    return null;
  }

  return { price_per_quintal: price };
}

// ------------------------------------------------------------
// RULE EVALUATION
// ------------------------------------------------------------

function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case ">": return value > threshold;
    case "<": return value < threshold;
    case ">=": return value >= threshold;
    case "<=": return value <= threshold;
    case "=": return value === threshold;
    default: return false;
  }
}

function preferenceKeyForCategory(category: string): string {
  return (
    {
      weather: "weather_alerts",
      pest_disease: "pest_disease_alerts",
      market: "market_price_updates",
      yield_risk: "yield_risk_alerts",
    }[category] ?? ""
  );
}

// ------------------------------------------------------------
// FCM PUSH
// ------------------------------------------------------------

async function sendPushToUser(userId: string, title: string, body: string) {
  const { data: tokens, error } = await supabase
    .from("device_tokens")
    .select("fcm_token")
    .eq("user_id", userId);

  if (error || !tokens || tokens.length === 0) {
    console.warn("No FCM token found for user:", userId);
    return;
  }

  const accessToken = await getAccessToken();

  await Promise.all(
    tokens.map((token: any) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: token.fcm_token,
            notification: { title, body },
          },
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            console.error("FCM send failed:", response.status, await response.text());
          }
        })
        .catch((error) => {
          console.error("FCM request failed:", error);
        })
    )
  );
}

// ------------------------------------------------------------
// MAIN EDGE FUNCTION
// ------------------------------------------------------------

Deno.serve(async () => {
  // FIX: joins farms so weather/mandi lookups have real coordinates and
  // location data to work with, instead of reading columns that were
  // never on alert_rules in the first place.
  const { data: rules, error: rulesError } = await supabase
    .from("alert_rules")
    .select("*, farms(latitude, longitude, state, district)")
    .eq("is_active", true);

  if (rulesError) {
    return new Response(JSON.stringify({ error: rulesError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let evaluated = 0;
  let triggered = 0;

  for (const rule of rules ?? []) {
    evaluated++;

    try {
      let data: Record<string, number> | null = null;

      if (rule.category === "weather") {
        data = await fetchWeatherData(rule);
      } else if (rule.category === "market") {
        data = await fetchMandiData(rule);
      }

      if (!data || data[rule.metric] === undefined) {
        continue;
      }

      const value = Number(data[rule.metric]);
      const threshold = Number(rule.threshold);

      if (!Number.isFinite(value) || !Number.isFinite(threshold)) {
        console.error("Invalid rule value:", rule);
        continue;
      }

      const isTriggered = evaluateCondition(value, rule.operator, threshold);
      if (!isTriggered) continue;

      const prefKey = preferenceKeyForCategory(rule.category);
      if (prefKey) {
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select(prefKey)
          .eq("user_id", rule.user_id)
          .maybeSingle();

        if (prefs && prefs[prefKey] === false) continue;
      }

      const dedupeKey = `${rule.id}:${rule.metric}:${new Date().toISOString().slice(0, 10)}`;
      const title = rule.category === "weather" ? "Weather Alert" : "Market Alert";
      const body = `${rule.metric.replace(/_/g, " ")} is ${value} (rule: ${rule.operator} ${rule.threshold})${
        rule.crop_name ? ` for ${rule.crop_name}` : ""
      }.`;

      const { error: insertError, data: inserted } = await supabase
        .from("notifications")
        .upsert(
          {
            user_id: rule.user_id,
            category: rule.category,
            title,
            body,
            severity: "warn",
            dedupe_key: dedupeKey,
            sent_at: new Date().toISOString(),
          },
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
        )
        .select();

      if (insertError) {
        console.error("Failed to insert notification:", insertError);
        continue;
      }

      if (inserted && inserted.length > 0) {
        triggered++;
        await sendPushToUser(rule.user_id, title, body);
      }
    } catch (error) {
      console.error(`Failed to evaluate rule ${rule.id}:`, error);
    }
  }

  return new Response(JSON.stringify({ evaluated, triggered }), {
    headers: { "Content-Type": "application/json" },
  });
});