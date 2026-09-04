// supabase/functions/get-mandi-prices/index.ts

const MANDI_API_URL =
  "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";

// =============================================================
// CORS
// =============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

// =============================================================
// EDGE FUNCTION
// =============================================================

Deno.serve(async (req) => {
  // -----------------------------------------------------------
  // Handle CORS preflight
  // -----------------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    // ---------------------------------------------------------
    // Only allow POST
    // ---------------------------------------------------------

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: "Method not allowed",
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // ---------------------------------------------------------
    // Get request body
    // ---------------------------------------------------------

    const body = await req.json();

    const {
      state = "",
      district = "",
      market = "",
      commodity = "",
      variety = "",
      grade = "",
      limit = 50,
      offset = 0,
    } = body || {};

    // ---------------------------------------------------------
    // Get API key from Supabase Secret
    // ---------------------------------------------------------

    const apiKey =
      Deno.env.get("VITE_MANDI_API_KEY");

    if (!apiKey) {
      throw new Error(
        "VITE_MANDI_API_KEY is not configured in Supabase secrets."
      );
    }

    // ---------------------------------------------------------
    // Build data.gov.in URL
    // ---------------------------------------------------------

    const url =
      new URL(MANDI_API_URL);

    url.searchParams.set(
      "api-key",
      apiKey
    );

    url.searchParams.set(
      "format",
      "json"
    );

    url.searchParams.set(
      "limit",
      String(limit)
    );

    url.searchParams.set(
      "offset",
      String(offset)
    );

    // ---------------------------------------------------------
    // Filters
    // ---------------------------------------------------------

    if (state) {
      url.searchParams.set(
        "filters[state.keyword]",
        state
      );
    }

    if (district) {
      url.searchParams.set(
        "filters[district]",
        district
      );
    }

    if (market) {
      url.searchParams.set(
        "filters[market]",
        market
      );
    }

    if (commodity) {
      url.searchParams.set(
        "filters[commodity]",
        commodity
      );
    }

    if (variety) {
      url.searchParams.set(
        "filters[variety]",
        variety
      );
    }

    if (grade) {
      url.searchParams.set(
        "filters[grade]",
        grade
      );
    }

    // ---------------------------------------------------------
    // Logging
    // ---------------------------------------------------------

    console.log(
      "Fetching mandi data:",
      {
        state,
        district,
        market,
        commodity,
        variety,
        grade,
        limit,
        offset,
      }
    );

    // ---------------------------------------------------------
    // Call data.gov.in
    // ---------------------------------------------------------

    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      15000
    );

    let response;

    try {
      response = await fetch(
        url.toString(),
        {
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    // ---------------------------------------------------------
    // Handle API error
    // ---------------------------------------------------------

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "data.gov.in error:",
        response.status,
        errorText
      );

      throw new Error(
        `Mandi API returned status ${response.status}`
      );
    }

    // ---------------------------------------------------------
    // Parse response
    // ---------------------------------------------------------

    const data =
      await response.json();

    console.log(
      "Mandi API request successful"
    );

    // ---------------------------------------------------------
    // Return data to frontend
    // ---------------------------------------------------------

    return new Response(
      JSON.stringify(data),
      {
        status: 200,

        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );

  } catch (error) {
    console.error(
      "get-mandi-prices failed:",
      error
    );

    const message =
      error?.name === "AbortError"
        ? "Mandi API request timed out. Please try again."
        : error?.message ||
          "Failed to fetch mandi prices.";

    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: 500,

        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});