import { supabase } from "../lib/supabase";

// =============================================================
// GET MANDI PRICES
// =============================================================

export async function getMandiPrices({
  state = "",
  district = "",
  market = "",
  commodity = "",
  variety = "",
  grade = "",
  limit = 50,
  offset = 0,
} = {}) {
  try {
    const { data, error } =
      await supabase.functions.invoke(
        "get-mandi-prices",
        {
          body: {
            state,
            district,
            market,
            commodity,
            variety,
            grade,
            limit,
            offset,
          },
        }
      );

    // ---------------------------------------------------------
    // Supabase Edge Function error
    // ---------------------------------------------------------

    if (error) {
      console.error(
        "Mandi Edge Function error:",
        error
      );

      throw new Error(
        error.message ||
          "Unable to fetch mandi prices."
      );
    }

    // ---------------------------------------------------------
    // Empty response
    // ---------------------------------------------------------

    if (!data) {
      throw new Error(
        "Mandi API returned no data."
      );
    }

    // ---------------------------------------------------------
    // Error returned by Edge Function
    // ---------------------------------------------------------

    if (data.error) {
      throw new Error(data.error);
    }

    // ---------------------------------------------------------
    // Success
    // ---------------------------------------------------------

    console.log(
      "Mandi API response:",
      data
    );

    return data;

  } catch (error) {
    console.error(
      "Failed to fetch mandi prices:",
      error
    );

    throw error;
  }
}