// supabase/functions/get-mandi-prices/index.ts

const MANDI_API_URL =
  "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";

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
    // Get API key from Supabase secret
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
    // Call data.gov.in from the server
    // ---------------------------------------------------------

    const response =
      await fetch(url.toString());

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

    return new Response(
      JSON.stringify({
        error:
          error?.message ||
          "Failed to fetch mandi prices",
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