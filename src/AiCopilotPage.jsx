import React, {
  useEffect,
  useState,
} from "react";

import {
  Mic,
  Volume2,
  Send,
  Star,
  Loader2,
  Square,
} from "lucide-react";

import { useLocation } from "react-router-dom";

import Layout from "./Layout.jsx";

import {
  getChatResponse,
} from "./services/gemini.js";

import {
  startListening,
  stopListening,
  speakResponse,
  stopSpeaking,
} from "./services/voiceAssistant";

import {
  getCoordinatesFromLocation,
} from "./services/geocodingApi.js";

import {
  getWeather,
} from "./services/weatherApi.js";

import {
  getMandiPrices,
} from "./services/mandiApi.js";

import { supabase } from "./lib/supabase";

import { useAuth } from "./context/AuthContext";

import { useLanguage } from "./context/LanguageContext";

import { translateTexts } from "./services/translation";

/* =============================================================
   LANGUAGE NAMES
   ============================================================= */

const LANGUAGE_NAMES = {
  en: "English",
  hi: "हिंदी",
  mr: "मराठी",
  ta: "தமிழ்",
  te: "తెలుగు",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  gu: "ગુજરાતી",
  pa: "ਪੰਜਾਬੀ",
  bn: "বাংলা",
  or: "ଓଡ଼ିଆ",
};

const SUPPORTED_LANGUAGES =
  Object.keys(LANGUAGE_NAMES);

/* =============================================================
   VOICE LANGUAGE CODES
   ============================================================= */

const LANGUAGE_VOICE_CODES = {
  hi: "hi-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  pa: "pa-IN",
  bn: "bn-IN",
  or: "or-IN",
  gu: "gu-IN",
  ml: "ml-IN",
  en: "en-IN",
};

/* =============================================================
   GEMINI LANGUAGE CODES
   ============================================================= */

const LANGUAGE_PROMPT_CODES = {
  hi: "hi",
  mr: "mr",
  ta: "ta",
  te: "te",
  kn: "kn",
  pa: "pa",
  bn: "bn",
  or: "or",
  gu: "gu",
  ml: "ml",
  en: "en",
};

/* =============================================================
   ENGLISH UI TEXTS
   ============================================================= */

const ENGLISH_TEXTS = {
  copilotTitle: "AI Farming Copilot",

  copilotSubtitle: "Online · Multilingual",

  voiceLanguage: "Voice language:",

  quickPest: "Pest control",

  quickRain: "Weather advice",

  quickSell: "Sell today?",

  quickIrrigation: "When to irrigate?",

  initialGreeting:
    "नमस्ते! I'm KrishiShayak AI. Ask me anything about your crops, weather, pests, or market prices — in Hindi, Marathi, Tamil, Telugu, or English.",

  listen: "Listen",

  thinking: "AI is thinking...",

  inputPlaceholder:
    "Type or speak in any language...",

  stopVoiceResponse:
    "Stop voice response",

  sampleQuestions:
    "Sample Questions",

  questionDisease:
    "Which disease is affecting my cotton?",

  questionRain:
    "What should I do after tomorrow's rain?",

  questionTomato:
    "Is it a good time to sell tomatoes today?",

  questionWheat:
    "When should I irrigate wheat?",

  questionPesticide:
    "Which pesticide is suitable for bollworm?",

  questionMandi:
    "Which is the best mandi for onion today?",

  supportedLanguages:
    "Supported Languages",

  micPermission:
    "Microphone permission was denied. Please allow microphone access in your browser.",

  micError:
    "I couldn't hear that clearly. Please try speaking again.",

  aiError:
    "Unable to connect to the AI assistant.",

  translating:
    "Translating...",
};

/* =============================================================
   QUICK QUESTIONS
   ============================================================= */

const QUICK_QUESTIONS = [
  {
    key: "quickPest",
    english: "Pest control",
  },
  {
    key: "quickRain",
    english: "Weather advice",
  },
  {
    key: "quickSell",
    english: "Sell today?",
  },
  {
    key: "quickIrrigation",
    english: "When to irrigate?",
  },
];

/* =============================================================
   SAMPLE QUESTIONS
   ============================================================= */

const SAMPLE_QUESTIONS = [
  {
    key: "questionDisease",
    english:
      "Which disease is affecting my cotton?",
  },
  {
    key: "questionRain",
    english:
      "What should I do after tomorrow's rain?",
  },
  {
    key: "questionTomato",
    english:
      "Is it a good time to sell tomatoes today?",
  },
  {
    key: "questionWheat",
    english:
      "When should I irrigate wheat?",
  },
  {
    key: "questionPesticide",
    english:
      "Which pesticide is suitable for bollworm?",
  },
  {
    key: "questionMandi",
    english:
      "Which is the best mandi for onion today?",
  },
];

/* =============================================================
   COMMODITY DETECTION
   ============================================================= */

function detectCommodity(question) {
  const text = String(question || "")
    .toLowerCase();

  const commodities = [
    {
      names: [
        "onion",
        "प्याज",
        "कांदा",
      ],
      value: "Onion",
    },
    {
      names: [
        "tomato",
        "टमाटर",
        "टोमॅटो",
      ],
      value: "Tomato",
    },
    {
      names: [
        "wheat",
        "गेहूं",
        "गहू",
      ],
      value: "Wheat",
    },
    {
      names: [
        "rice",
        "धान",
        "चावल",
        "तांदूळ",
      ],
      value: "Rice",
    },
    {
      names: [
        "cotton",
        "कपास",
        "कापूस",
      ],
      value: "Cotton",
    },
    {
      names: [
        "potato",
        "आलू",
        "बटाटा",
      ],
      value: "Potato",
    },
    {
      names: [
        "soybean",
        "सोयाबीन",
      ],
      value: "Soybean",
    },
    {
      names: [
        "maize",
        "corn",
        "मक्का",
      ],
      value: "Maize",
    },
    {
      names: [
        "sugarcane",
        "गन्ना",
      ],
      value: "Sugarcane",
    },
    {
      names: [
        "mustard",
        "सरसों",
      ],
      value: "Mustard",
    },
  ];

  for (const commodity of commodities) {
    if (
      commodity.names.some((name) =>
        text.includes(name)
      )
    ) {
      return commodity.value;
    }
  }

  return null;
}

/* =============================================================
   CHECK WHETHER QUESTION NEEDS MANDI DATA
   ============================================================= */

function needsMandiData(question) {
  const text = String(question || "")
    .toLowerCase();

  const mandiKeywords = [
    "mandi",
    "market",
    "price",
    "prices",
    "rate",
    "sell",
    "selling",
    "बेचना",
    "बेचें",
    "बेच",
    "भाव",
    "कीमत",
    "मंडी",
    "बाजार",
    "दर",
  ];

  const hasMandiKeyword =
    mandiKeywords.some((keyword) =>
      text.includes(keyword)
    );

  const commodity =
    detectCommodity(question);

  return (
    hasMandiKeyword ||
    Boolean(commodity)
  );
}

/* =============================================================
   FETCH MANDI DATA
   ============================================================= */

async function fetchRelevantMandiData(
  question,
  location
) {
  if (!needsMandiData(question)) {
    return null;
  }

  const commodity =
    detectCommodity(question);

  if (!commodity) {
    return null;
  }

  const state =
    location?.state || "";

  const district =
    location?.district || "";

  try {
    /* ---------------------------------------------------------
       First try district + state + commodity
       --------------------------------------------------------- */

    let data =
      await getMandiPrices({
        state,
        district,
        commodity,
        limit: 30,
      });

    if (
      Array.isArray(data?.records) &&
      data.records.length > 0
    ) {
      return data;
    }

    /* ---------------------------------------------------------
       Second try state + commodity
       --------------------------------------------------------- */

    data =
      await getMandiPrices({
        state,
        commodity,
        limit: 30,
      });

    if (
      Array.isArray(data?.records) &&
      data.records.length > 0
    ) {
      return data;
    }

    /* ---------------------------------------------------------
       Third try commodity only
       --------------------------------------------------------- */

    data =
      await getMandiPrices({
        commodity,
        limit: 30,
      });

    return data;
  } catch (error) {
    console.error(
      "Mandi lookup failed:",
      error
    );

    return null;
  }
}

/* =============================================================
   COMPONENT
   ============================================================= */

export default function AiCopilotPage() {
  const routerLocation =
    useLocation();

  const { user } = useAuth();

  /*
   * IMPORTANT:
   * LanguageContext is now the single source of truth
   * for the entire application.
   */
  const {
    language,
    setLanguage,
  } = useLanguage();

  /* ===========================================================
     CHAT STATE
     =========================================================== */

  const [messages, setMessages] =
    useState([]);

  const [input, setInput] =
    useState("");

  /* ===========================================================
     VOICE STATE
     =========================================================== */

  const [isListening, setIsListening] =
    useState(false);

  const [isThinking, setIsThinking] =
    useState(false);

  const [voiceError, setVoiceError] =
    useState("");

  /* ===========================================================
     UI TRANSLATION STATE
     =========================================================== */

  const [translations, setTranslations] =
    useState(ENGLISH_TEXTS);

  const [isTranslating, setIsTranslating] =
    useState(false);

  /* ===========================================================
     FARMER CONTEXT
     =========================================================== */

  const [farmerContext, setFarmerContext] =
    useState({
      location: null,
      weather: null,
      mandi: null,
    });

  const [contextLoading, setContextLoading] =
    useState(true);

  /* ===========================================================
     INITIAL GREETING
     =========================================================== */

  useEffect(() => {
    setMessages([
      {
        sender: "ai",
        text: translations.initialGreeting,
        time: "Now",
      },
    ]);
  }, [translations.initialGreeting]);

  /* ===========================================================
     TRANSLATE COPILOT UI
     =========================================================== */

  useEffect(() => {
    let cancelled = false;

    async function loadTranslations() {
      if (
        !language ||
        language === "en"
      ) {
        setTranslations(
          ENGLISH_TEXTS
        );

        setIsTranslating(false);

        return;
      }

      setIsTranslating(true);

      try {
        const keys =
          Object.keys(ENGLISH_TEXTS);

        const englishTexts =
          Object.values(
            ENGLISH_TEXTS
          );

        const translated =
          await translateTexts(
            englishTexts,
            language,
            "en"
          );

        if (cancelled) {
          return;
        }

        const translatedObject = {};

        keys.forEach(
          (key, index) => {
            translatedObject[key] =
              translated[index] ||
              ENGLISH_TEXTS[key];
          }
        );

        setTranslations(
          translatedObject
        );
      } catch (error) {
        console.error(
          "AI Copilot translation error:",
          error
        );

        if (!cancelled) {
          setTranslations(
            ENGLISH_TEXTS
          );
        }
      } finally {
        if (!cancelled) {
          setIsTranslating(false);
        }
      }
    }

    loadTranslations();

    return () => {
      cancelled = true;
    };
  }, [language]);

  /* ===========================================================
     LOAD ONBOARDING LOCATION + WEATHER
     =========================================================== */

  async function loadFarmerContext() {
    try {
      setContextLoading(true);

      if (!user) {
        throw new Error(
          "You must be logged in."
        );
      }

      /* -------------------------------------------------------
         Get state + district saved during onboarding
         ------------------------------------------------------- */

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("state, district")
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      const state =
        profile?.state?.trim();

      const district =
        profile?.district?.trim();

      if (!state || !district) {
        throw new Error(
          "Your state and district are not available. Please update your farm location."
        );
      }

      console.log(
        "Farmer onboarding location:",
        {
          state,
          district,
        }
      );

      /* -------------------------------------------------------
         Convert onboarding location into coordinates

         IMPORTANT:
         This is NOT live GPS.
         ------------------------------------------------------- */

      const coordinates =
        await getCoordinatesFromLocation(
          state,
          district
        );

      console.log(
        "Geocoded farmer location:",
        coordinates
      );

      /* -------------------------------------------------------
         Get weather for onboarding location
         ------------------------------------------------------- */

      const weather =
        await getWeather(
          coordinates.latitude,
          coordinates.longitude
        );

      /* -------------------------------------------------------
         Build farmer context
         ------------------------------------------------------- */

      const context = {
        location: {
          latitude:
            coordinates.latitude,

          longitude:
            coordinates.longitude,

          state,

          district,
        },

        weather,

        mandi: null,
      };

      setFarmerContext(context);

      console.log(
        "Farmer context loaded:",
        context
      );

      return context;
    } catch (error) {
      console.error(
        "Failed to load farmer context:",
        error
      );

      return {
        location: null,
        weather: null,
        mandi: null,
      };
    } finally {
      setContextLoading(false);
    }
  }

  /* ===========================================================
     INITIAL CONTEXT LOAD
     =========================================================== */

  useEffect(() => {
    if (user) {
      loadFarmerContext();
    }
  }, [user]);

  /* ===========================================================
     SEND MESSAGE
     =========================================================== */

  async function sendMessage(
    messageOverride = null
  ) {
    const trimmed =
      typeof messageOverride === "string"
        ? messageOverride.trim()
        : input.trim();

    if (
      !trimmed ||
      isThinking
    ) {
      return;
    }

    console.log(
      "Sending message:",
      trimmed
    );

    console.log(
      "Global language:",
      language
    );

    /* ---------------------------------------------------------
       Add user message
       --------------------------------------------------------- */

    setMessages((prev) => [
      ...prev,

      {
        sender: "user",
        text: trimmed,
        time: "Now",
      },
    ]);

    setInput("");
    setIsThinking(true);

    try {
      /*
       * Convert the global language code into the code expected
       * by Gemini.
       */
      const languageCode =
        LANGUAGE_PROMPT_CODES[
          language
        ] || "en";

      /* -------------------------------------------------------
         Ensure onboarding location/weather are available
         ------------------------------------------------------- */

      let context =
        farmerContext;

      if (
        !context?.location ||
        !context?.weather
      ) {
        context =
          await loadFarmerContext();
      }

      /* -------------------------------------------------------
         If onboarding location could not be loaded
         ------------------------------------------------------- */

      if (!context?.location) {
        throw new Error(
          "Your onboarding location could not be loaded. Please check your state and district in your profile."
        );
      }

      /* -------------------------------------------------------
         Fetch Mandi data only when needed
         ------------------------------------------------------- */

      const mandiData =
        await fetchRelevantMandiData(
          trimmed,
          context?.location
        );

      const finalContext = {
        ...context,
        mandi: mandiData,
      };

      setFarmerContext(
        finalContext
      );

      console.log(
        "AI context for question:",
        finalContext
      );

      console.log(
        "Sending question to Gemini with language:",
        languageCode
      );

      /* -------------------------------------------------------
         Ask Gemini
         ------------------------------------------------------- */

      const answer =
        await getChatResponse(
          trimmed,
          languageCode,
          finalContext
        );

      const safeAnswer =
        typeof answer === "string" &&
        answer.trim()
          ? answer.trim()
          : "Sorry, I could not generate an answer right now.";

      console.log(
        "Gemini response:",
        safeAnswer
      );

      /* -------------------------------------------------------
         Add AI response
         ------------------------------------------------------- */

      setMessages((prev) => [
        ...prev,

        {
          sender: "ai",
          text: safeAnswer,
          time: "Now",
        },
      ]);

      /* -------------------------------------------------------
         Text-to-speech
         ------------------------------------------------------- */

      try {
        const speechLanguage =
          LANGUAGE_VOICE_CODES[
            language
          ] || "en-IN";

        speakResponse(
          safeAnswer,
          speechLanguage
        );
      } catch (speechError) {
        console.warn(
          "Text-to-speech failed:",
          speechError
        );
      }
    } catch (error) {
      console.error(
        "AI assistant error:",
        error
      );

      const errorMessage =
        error?.message ||
        translations.aiError;

      setMessages((prev) => [
        ...prev,

        {
          sender: "ai",
          text: errorMessage,
          time: "Now",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  /* ===========================================================
     DASHBOARD → COPILOT PROMPT
     =========================================================== */

  useEffect(() => {
    const prompt =
      routerLocation.state?.prompt;

    if (!prompt) {
      return;
    }

    console.log(
      "Received dashboard prompt:",
      prompt
    );

    /* ---------------------------------------------------------
       Clear navigation state so the same prompt
       does not execute again.
       --------------------------------------------------------- */

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

    sendMessage(prompt);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state?.prompt]);

  /* ===========================================================
     MICROPHONE
     =========================================================== */

  const handleMicClick = () => {
    /* ---------------------------------------------------------
       Stop current listening
       --------------------------------------------------------- */

    if (isListening) {
      stopListening();
      setIsListening(false);
      return;
    }

    /* ---------------------------------------------------------
       Clear old voice error
       --------------------------------------------------------- */

    setVoiceError("");

    /* ---------------------------------------------------------
       Select browser language
       --------------------------------------------------------- */

    const speechLanguage =
      LANGUAGE_VOICE_CODES[
        language
      ] || "en-IN";

    console.log(
      "Starting speech recognition with language:",
      speechLanguage
    );

    /* ---------------------------------------------------------
       Start recognition
       --------------------------------------------------------- */

    startListening({
      language: speechLanguage,

      onStart: () => {
        setVoiceError("");
        setIsListening(true);
      },

      onResult: (spokenText) => {
        const text =
          typeof spokenText === "string"
            ? spokenText.trim()
            : "";

        if (!text) {
          return;
        }

        setInput(text);

        /* -----------------------------------------------------
           Send transcript directly because React state updates
           asynchronously.
           ----------------------------------------------------- */

        sendMessage(text);
      },

      onEnd: () => {
        setIsListening(false);
      },

      onError: (errorMessage) => {
        console.error(
          "Voice input error:",
          errorMessage
        );

        setIsListening(false);

        if (
          typeof errorMessage === "string" &&
          errorMessage
            .toLowerCase()
            .includes("network")
        ) {
          setVoiceError(
            "Voice input could not connect to the browser speech service. Check your internet connection and try again."
          );
        } else {
          setVoiceError(
            errorMessage ||
              translations.micError
          );
        }
      },
    });
  };

  /* ===========================================================
     SPEAK INDIVIDUAL AI MESSAGE
     =========================================================== */

  const handleSpeak = (text) => {
    if (!text) {
      return;
    }

    try {
      const speechLanguage =
        LANGUAGE_VOICE_CODES[
          language
        ] || "en-IN";

      speakResponse(
        text,
        speechLanguage
      );
    } catch (error) {
      console.error(
        "Failed to speak message:",
        error
      );
    }
  };

  /* ===========================================================
     LANGUAGE CHANGE
     =========================================================== */

  const handleLanguageChange = (
    event
  ) => {
    const newLanguage =
      event.target.value;

    stopSpeaking();

    if (isListening) {
      stopListening();
      setIsListening(false);
    }

    setVoiceError("");

    /*
     * IMPORTANT:
     * Update the global LanguageContext instead of maintaining
     * a separate local language state.
     *
     * This means:
     *
     * Copilot → LanguageContext
     * Profile → LanguageContext
     * LanguageContext → entire application
     */
    setLanguage(newLanguage);
  };

  /* ===========================================================
     ENTER KEY
     =========================================================== */

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  /* ===========================================================
     CLEANUP
     =========================================================== */

  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();

      if (
        "speechSynthesis" in window
      ) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  /* =============================================================
     UI
     ============================================================= */

  return (
    <Layout
      title={
        translations.copilotTitle
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">

        {/* ===================================================
            MAIN COPILOT AREA
        =================================================== */}

        <div>

          {/* =================================================
              HEADER
          ================================================= */}

          <div className="rounded-2xl bg-[#f4f1e7] p-5 sm:p-6">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex items-center gap-3">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1f5b3d] text-white">
                  <Mic size={22} />
                </div>

                <div>

                  <h2 className="font-serif text-xl font-bold text-[#24352a]">
                    {translations.copilotTitle}
                  </h2>

                  <p className="flex items-center gap-1.5 text-sm text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    {translations.copilotSubtitle}
                  </p>

                </div>

              </div>

              {/* LANGUAGE SELECTOR */}

              <div className="flex items-center gap-2">

                <label
                  htmlFor="copilot-language"
                  className="text-sm font-medium text-slate-500"
                >
                  Language
                </label>

                <select
                  id="copilot-language"
                  value={language || "en"}
                  onChange={
                    handleLanguageChange
                  }
                  className="rounded-full border border-[#e5dfd2] bg-white px-3 py-2 text-sm font-medium text-[#24352a] outline-none focus:border-[#2f7357]"
                >

                  {SUPPORTED_LANGUAGES.map(
                    (code) => (
                      <option
                        key={code}
                        value={code}
                      >
                        {LANGUAGE_NAMES[code]}
                      </option>
                    )
                  )}

                </select>

              </div>

            </div>

            {/* LOCATION / CONTEXT STATUS */}

            <div className="mt-3 text-xs text-slate-400">

              {contextLoading
                ? "Loading your onboarding location and live weather..."
                : farmerContext?.location
                  ? `Using onboarding location: ${
                      farmerContext.location
                        .district ||
                      farmerContext.location
                        .state ||
                      "your location"
                    }${
                      farmerContext.location
                        .state
                        ? `, ${farmerContext.location.state}`
                        : ""
                    }`
                  : "Onboarding location unavailable"}

            </div>

          </div>

          {/* =================================================
              DISCLAIMER
          ================================================= */}

          <div className="mt-4 rounded-xl border border-[#e5dfd2] bg-[#f7f5ee] px-4 py-3 text-xs leading-5 text-slate-500">

            <span className="font-semibold text-[#59645c]">
              Disclaimer:
            </span>{" "}
            AI-generated guidance is for
            informational purposes only.
            Please do not follow
            recommendations blindly;
            consult a qualified
            agricultural expert or relevant
            professional before taking major
            farming decisions.

          </div>

          {/* =================================================
              QUICK CHIPS
          ================================================= */}

          <div className="mt-5 flex flex-wrap gap-2">

            {QUICK_QUESTIONS.map(
              (chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() =>
                    /*
                     * Send the canonical English question
                     * to Gemini. Gemini will answer using
                     * the current global language.
                     */
                    sendMessage(
                      chip.english
                    )
                  }
                  disabled={isThinking}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[#24352a] shadow-sm ring-1 ring-[#e5dfd2] transition hover:bg-[#e7edda] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {
                    translations[
                      chip.key
                    ] || chip.english
                  }
                </button>
              )
            )}

          </div>

          {isTranslating && (
            <p className="mt-2 text-xs text-slate-400">
              {translations.translating}
            </p>
          )}

          {/* =================================================
              CHAT CONTAINER
          ================================================= */}

          <div className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#e5dfd2]">

            {/* MESSAGES */}

            <div className="min-h-[420px] space-y-5 p-4 sm:p-6">

              {messages.map(
                (message, index) => {
                  const isUser =
                    message.sender ===
                    "user";

                  return (
                    <div
                      key={`${message.sender}-${index}`}
                      className={`flex ${
                        isUser
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >

                      {isUser ? (

                        <div className="max-w-xl whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#214d34] px-4 py-3 text-sm text-white shadow-sm">
                          {message.text}
                        </div>

                      ) : (

                        <div className="flex items-start gap-2.5">

                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1f5b3d] text-white">
                            <Mic size={14} />
                          </div>

                          <div>

                            <div className="max-w-xl whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 text-sm leading-6 text-gray-900">
                              {message.text}
                            </div>

                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">

                              <span>
                                {message.time}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  handleSpeak(
                                    message.text
                                  )
                                }
                                className="flex items-center gap-1 hover:text-[#1f5b3d]"
                              >
                                <Volume2 size={12} />
                                {
                                  translations.listen
                                }
                              </button>

                            </div>

                          </div>

                        </div>

                      )}

                    </div>
                  );
                }
              )}

              {/* THINKING */}

              {isThinking && (

                <div className="flex items-start gap-2.5">

                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1f5b3d] text-white">
                    <Mic size={14} />
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 text-sm text-gray-600">

                    <Loader2
                      size={17}
                      className="animate-spin"
                    />

                    <span>
                      Checking live data and thinking...
                    </span>

                  </div>

                </div>

              )}

            </div>

            {/* =================================================
                VOICE ERROR
            ================================================= */}

            {voiceError && (

              <div className="border-t border-gray-100 bg-red-50 px-4 py-3 sm:px-6">

                <div className="flex items-start justify-between gap-3">

                  <p className="text-sm text-red-700">
                    {voiceError}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setVoiceError("")
                    }
                    className="text-xs font-medium text-red-700 hover:text-red-900"
                  >
                    Dismiss
                  </button>

                </div>

              </div>

            )}

            {/* =================================================
                INPUT AREA
            ================================================= */}

            <div className="border-t border-gray-100 p-4 sm:p-6">

              <div className="flex flex-col gap-3">

                {/* TEXT INPUT */}

                <div className="flex items-end gap-2">

                  <textarea
                    value={input}
                    onChange={(event) =>
                      setInput(
                        event.target.value
                      )
                    }
                    onKeyDown={handleKeyDown}
                    placeholder={
                      translations.inputPlaceholder
                    }
                    rows={2}
                    disabled={isThinking}
                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 disabled:bg-gray-50"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      sendMessage()
                    }
                    disabled={
                      !input.trim() ||
                      isThinking
                    }
                    className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-green-600 text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Send message"
                  >
                    <Send size={20} />
                  </button>

                </div>

                {/* =================================================
                    MICROPHONE
                ================================================= */}

                <div className="flex flex-wrap items-center gap-3">

                  <button
                    type="button"
                    onClick={
                      handleMicClick
                    }
                    disabled={isThinking}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                      isListening
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    title={
                      isListening
                        ? "Stop recording"
                        : "Speak your question"
                    }
                  >

                    {isListening ? (
                      <>
                        <Square size={17} />
                        Stop recording
                      </>
                    ) : (
                      <>
                        <Mic size={18} />
                        Speak
                      </>
                    )}

                  </button>

                  {isListening && (

                    <span className="text-sm text-red-600">
                      Listening... speak now
                    </span>

                  )}

                  {!isListening &&
                    !voiceError && (

                      <span className="text-xs text-gray-500">
                        Tap Speak and ask your farming question.
                      </span>

                    )}

                </div>

                {/* STOP TTS */}

                <button
                  type="button"
                  onClick={
                    stopSpeaking
                  }
                  className="self-start text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  {
                    translations.stopVoiceResponse
                  }
                </button>

              </div>

            </div>

          </div>

        </div>

        {/* ===================================================
            RIGHT SIDEBAR
        =================================================== */}

        <div className="space-y-5">

          {/* =================================================
              SAMPLE QUESTIONS
          ================================================= */}

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#e5dfd2]">

            <p className="flex items-center gap-2 font-serif text-base font-bold text-[#24352a]">

              <Star
                size={16}
                className="text-[#c9a24b]"
                fill="#c9a24b"
              />

              {translations.sampleQuestions}

            </p>

            <div className="mt-3 space-y-2">

              {SAMPLE_QUESTIONS.map(
                (question) => (

                  <button
                    key={question.key}
                    type="button"
                    onClick={() =>
                      /*
                       * Send the canonical English question.
                       * Gemini responds in the current global
                       * language.
                       */
                      sendMessage(
                        question.english
                      )
                    }
                    disabled={isThinking}
                    className="block w-full rounded-xl bg-[#f7f5ee] px-3 py-2.5 text-left text-sm text-[#24352a] hover:bg-[#e7edda] disabled:opacity-60"
                  >
                    {
                      translations[
                        question.key
                      ] || question.english
                    }
                  </button>

                )
              )}

            </div>

          </div>

          {/* =================================================
              SUPPORTED LANGUAGES
          ================================================= */}

          <div className="rounded-2xl bg-[#e7edda] p-5">

            <p className="font-serif text-base font-bold text-[#24352a]">
              {
                translations.supportedLanguages
              }
            </p>

            <div className="mt-3 flex flex-wrap gap-2">

              {SUPPORTED_LANGUAGES.map(
                (code) => (

                  <span
                    key={code}
                    className="rounded-full bg-white px-3 py-1 text-sm font-medium text-[#24352a] shadow-sm"
                  >
                    {
                      LANGUAGE_NAMES[
                        code
                      ]
                    }
                  </span>

                )
              )}

            </div>

            <p className="mt-3 text-xs text-slate-500">
              Current language:{" "}
              {
                LANGUAGE_NAMES[
                  language
                ] || "English"
              }
            </p>

          </div>

        </div>

      </div>
    </Layout>
  );
}