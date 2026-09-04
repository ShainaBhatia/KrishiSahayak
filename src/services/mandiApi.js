// src/services/mandiApi.js

import { supabase } from "../lib/supabase";

// =============================================================
// GET MANDI PRICES
// =============================================================

export async function getMandiPrices({
  state,
  district,
  market,
  commodity,
  variety,
  grade,
  limit = 50,
  offset = 0,
} = {}) {
  try {
    const { data, error } =
      await supabase.functions.invoke(
        "get-mandi-prices",
        {
          body: {
            state: state || "",
            district: district || "",
            market: market || "",
            commodity: commodity || "",
            variety: variety || "",
            grade: grade || "",
            limit,
            offset,
          },
        }
      );

    if (error) {
      console.error(
        "Mandi Edge Function error:",
        error
      );

      throw new Error(
        error.message ||
          "Unable to fetch mandi prices"
      );
    }

    if (!data) {
      throw new Error(
        "Mandi API returned no data"
      );
    }

    if (data.error) {
      throw new Error(data.error);
    }

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