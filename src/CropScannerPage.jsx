import React, { useEffect, useRef, useState } from "react";

import {
  Camera,
  Upload,
  Leaf,
  CheckCircle2,
  Eye,
  Loader2,
  Save,
  Volume2,
  ScanSearch,
  AlertCircle,
} from "lucide-react";

import Layout from "./Layout.jsx";

import {
  loadDiseaseModel,
  detectDisease,
} from "./services/diseasedetection.js";

import { getDiseaseExplanation } from "./services/gemini.js";
import { supabase } from "./lib/supabase";
import { queueTableWrite } from "./sync/queueAction";
import { useLanguage } from "./context/LanguageContext";
import { translateTexts } from "./services/translation";

const TIPS = [
  "Take photo in natural daylight",
  "Focus on the affected leaf clearly",
  "Include both healthy and diseased parts",
  "Avoid blurry or dark photos",
  "Capture a single leaf close-up",
];

const SEVERITY_THEME = {
  Mild: "bg-yellow-100 text-yellow-800",
  Moderate: "bg-orange-100 text-orange-700",
  Severe: "bg-red-100 text-red-700",
};

const UI_TEXT = [
  "Crop Scanner",
  "AI Crop Health Scanner",
  "Upload or Capture Leaf Photo",
  "JPG, PNG, WEBP · Max 10MB",
  "Choose Photo",
  "Take Photo",
  "Camera Preview",
  "Capture Photo",
  "Cancel",
  "Camera permission was denied. Please allow camera access or use Upload Photo.",
  "Camera access is not supported in this browser.",
  "Unable to access the camera.",
  "Camera preview is not available.",
  "Camera is still starting. Please wait a moment and try again.",
  "Unable to capture the camera image.",
  "Unable to create the captured image.",
  "Tips for Best Results",
  ...TIPS,
  "Analyze Leaf",
  "Analyzing...",
  "Loading disease model...",
  "No photo uploaded yet",
  "Upload a leaf photo to get instant disease analysis",
  "Detection Result",
  "Confidence:",
  "Save Scan",
  "AI Explanation",
  "Read explanation aloud",
  "Recent Scans",
  "No saved scans yet.",
  "Crop",
  "Please choose an image smaller than 10MB.",
  "Please choose a JPG, PNG, or WEBP image.",
  "Unable to analyze this image.",
  "Unable to load the selected image.",
  "Unable to save disease scan.",
  "There is no confident disease result to save.",
  "Please log in first.",
  "Disease scan saved — syncing now.",
  "Saved offline — will sync automatically once you're back online.",
  "Unable to confidently identify this disease. Please upload a clearer leaf photo.",
  "AI explanation unavailable offline. Connect to the internet to get treatment and prevention guidance.",
  "The disease was detected, but the detailed AI explanation is currently unavailable.",
  "Disease detection model is still loading. Please wait.",
];

const SPEECH_LANGUAGES = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  gu: "gu-IN",
  pa: "pa-IN",
  or: "or-IN",
};

function parseConfidenceFromNotes(notes) {
  const match = /\(([\d.]+)% confidence\)/.exec(notes || "");
  return match ? Number(match[1]) : null;
}

export default function CropScannerPage() {
  // =========================================================
  // REFS
  // =========================================================

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);

  // Camera refs
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const { language } = useLanguage();

  // =========================================================
  // IMAGE / CAMERA STATE
  // =========================================================

  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // =========================================================
  // DISEASE STATE
  // =========================================================

  const [disease, setDisease] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [severity, setSeverity] = useState("Moderate");
  const [explanation, setExplanation] = useState("");

  // =========================================================
  // FARM DATA
  // =========================================================

  const [selectedCrop, setSelectedCrop] = useState("");
  const [farmId, setFarmId] = useState(null);
  const [recentScans, setRecentScans] = useState([]);

  // =========================================================
  // MODEL STATE
  // =========================================================

  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [modelError, setModelError] = useState("");

  // =========================================================
  // TRANSLATION
  // =========================================================

  const [translations, setTranslations] = useState(() => {
    const initial = {};

    UI_TEXT.forEach((text) => {
      initial[text] = text;
    });

    return initial;
  });

  const t = (text) => translations[text] || text;

  // =========================================================
  // TRANSLATION
  // =========================================================

  useEffect(() => {
    let cancelled = false;

    async function translatePage() {
      if (!language || language === "en") {
        const english = {};

        UI_TEXT.forEach((text) => {
          english[text] = text;
        });

        if (!cancelled) {
          setTranslations(english);
        }

        return;
      }

      try {
        const translated = await translateTexts(
          UI_TEXT,
          language,
          "en"
        );

        if (cancelled) return;

        const result = {};

        UI_TEXT.forEach((text, index) => {
          result[text] = translated[index] || text;
        });

        setTranslations(result);
      } catch (error) {
        console.error(
          "Crop Scanner translation failed:",
          error
        );
      }
    }

    translatePage();

    return () => {
      cancelled = true;
    };
  }, [language]);

  // =========================================================
  // LOAD DISEASE MODEL
  // =========================================================

  useEffect(() => {
    let cancelled = false;

    async function initializeDiseaseModel() {
      try {
        setModelLoading(true);
        setModelError("");

        await loadDiseaseModel();

        if (!cancelled) {
          setModelReady(true);
        }
      } catch (error) {
        console.error(
          "Disease model loading failed:",
          error
        );

        if (!cancelled) {
          setModelReady(false);

          setModelError(
            error?.message ||
              "Unable to load the disease detection model."
          );
        }
      } finally {
        if (!cancelled) {
          setModelLoading(false);
        }
      }
    }

    initializeDiseaseModel();

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================================================
  // LOAD FARM + CROP + RECENT SCANS
  // =========================================================

  useEffect(() => {
    let cancelled = false;

    async function loadFarmData() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user || cancelled) return;

        const {
          data: farm,
          error: farmError,
        } = await supabase
          .from("farms")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (farmError) throw farmError;

        if (farm && !cancelled) {
          setFarmId(farm.id);

          const {
            data: cropData,
            error: cropError,
          } = await supabase
            .from("crops")
            .select("name")
            .eq("farm_id", farm.id)
            .limit(1)
            .maybeSingle();

          if (cropError) throw cropError;

          if (cropData && !cancelled) {
            setSelectedCrop(cropData.name);
          }
        }

        // =====================================================
        // LOAD ACTUAL SAVED DISEASE SCANS
        // =====================================================

        const {
          data: scans,
          error: scansError,
        } = await supabase
          .from("disease_reports")
          .select(
            "id, crop_name, notes, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", {
            ascending: false,
          })
          .limit(5);

        if (scansError) throw scansError;

        if (!cancelled) {
          setRecentScans(scans || []);
        }
      } catch (error) {
        console.error(
          "Failed to load scanner data:",
          error
        );
      }
    }

    loadFarmData();

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================================================
  // FILE SELECTION
  // =========================================================

  function handleFileChange(e) {
    const file = e.target.files?.[0];

    if (!file) return;

    // Stop camera if it happens to be open.
    stopCamera();

    setMessage("");
    setModelError("");
    setCameraError("");

    if (file.size > 10 * 1024 * 1024) {
      setMessage(
        t(
          "Please choose an image smaller than 10MB."
        )
      );
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage(
        t(
          "Please choose a JPG, PNG, or WEBP image."
        )
      );
      return;
    }

    const url = URL.createObjectURL(file);

    setSelectedFile(file);
    setPreviewUrl(url);

    setDisease(null);
    setConfidence(null);
    setSeverity("Moderate");
    setExplanation("");
    setMessage("");
  }

  // =========================================================
  // START FRONT CAMERA
  // =========================================================

  async function startCamera() {
    try {
      setCameraError("");
      setMessage("");
      setCameraLoading(true);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is not supported in this browser."
        );
      }

      // Stop any existing camera stream first.
      if (cameraStreamRef.current) {
        cameraStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());

        cameraStreamRef.current = null;
      }

      /*
       * "user" requests the front/user-facing camera.
       *
       * On a laptop this normally means the built-in webcam.
       */
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: {
              ideal: 1280,
            },
            height: {
              ideal: 720,
            },
          },
          audio: false,
        });

      cameraStreamRef.current = stream;

      setCameraOpen(true);
    } catch (error) {
      console.error(
        "Failed to open camera:",
        error
      );

      if (error?.name === "NotAllowedError") {
        setCameraError(
          t(
            "Camera permission was denied. Please allow camera access or use Upload Photo."
          )
        );
      } else if (
        error?.name === "NotFoundError"
      ) {
        setCameraError(
          t(
            "Unable to access the camera."
          )
        );
      } else if (
        error?.name === "NotReadableError"
      ) {
        setCameraError(
          t(
            "Unable to access the camera."
          )
        );
      } else {
        setCameraError(
          t(
            error?.message ||
              "Unable to access the camera."
          )
        );
      }

      setCameraOpen(false);
    } finally {
      setCameraLoading(false);
    }
  }

  // =========================================================
  // CONNECT CAMERA STREAM TO VIDEO
  // =========================================================

  useEffect(() => {
    if (
      !cameraOpen ||
      !videoRef.current ||
      !cameraStreamRef.current
    ) {
      return;
    }

    const video = videoRef.current;
    const stream = cameraStreamRef.current;

    video.srcObject = stream;

    video
      .play()
      .catch((error) => {
        console.error(
          "Camera video playback failed:",
          error
        );
      });

    return () => {
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [cameraOpen]);

  // =========================================================
  // STOP CAMERA
  // =========================================================

  function stopCamera() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop();
        });

      cameraStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  }

  // =========================================================
  // CAPTURE PHOTO FROM CAMERA
  // =========================================================

  function capturePhoto() {
    const video = videoRef.current;

    if (!video) {
      setCameraError(
        t(
          "Camera preview is not available."
        )
      );

      return;
    }

    if (
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setCameraError(
        t(
          "Camera is still starting. Please wait a moment and try again."
        )
      );

      return;
    }

    const canvas =
      document.createElement("canvas");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setCameraError(
        t(
          "Unable to capture the camera image."
        )
      );

      return;
    }

    /*
     * Capture the current video frame.
     */
    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError(
            t(
              "Unable to create the captured image."
            )
          );

          return;
        }

        const file = new File(
          [blob],
          `crop-camera-${Date.now()}.jpg`,
          {
            type: "image/jpeg",
          }
        );

        if (
          file.size >
          10 * 1024 * 1024
        ) {
          setCameraError(
            t(
              "Please choose an image smaller than 10MB."
            )
          );

          return;
        }

        const url =
          URL.createObjectURL(file);

        // Make camera capture behave exactly like upload.
        setSelectedFile(file);
        setPreviewUrl(url);

        setDisease(null);
        setConfidence(null);
        setSeverity("Moderate");
        setExplanation("");
        setMessage("");
        setCameraError("");

        // Release camera after capture.
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  // =========================================================
  // CLEAN PREVIEW URL
  // =========================================================

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // =========================================================
  // CAMERA CLEANUP ON PAGE EXIT
  // =========================================================

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });

        cameraStreamRef.current = null;
      }
    };
  }, []);

  // =========================================================
  // ANALYZE IMAGE
  // =========================================================

  async function analyzeImage() {
    if (!selectedFile || !previewUrl) {
      setMessage(
        t("No photo uploaded yet")
      );

      return;
    }

    if (!modelReady) {
      setMessage(
        t(
          "Disease detection model is still loading. Please wait."
        )
      );

      return;
    }

    setAnalyzing(true);
    setMessage("");

    setDisease(null);
    setConfidence(null);
    setSeverity("Moderate");
    setExplanation("");

    try {
      const image = new Image();

      image.onload = async () => {
        try {
          imageRef.current = image;

          /*
           * This is unchanged.
           *
           * Whether the image came from:
           * - file upload
           * - camera capture
           *
           * detectDisease() receives an image element.
           */
          const detection =
            await detectDisease(image);

          if (!detection) {
            throw new Error(
              "Disease model returned no result."
            );
          }

          const diseaseName =
            detection.diseaseName ||
            detection.disease ||
            detection.label ||
            detection.name ||
            "Unknown";

          const numericConfidence =
            Number(detection.confidence);

          setDisease(diseaseName);

          setConfidence(
            Number.isFinite(
              numericConfidence
            )
              ? numericConfidence
              : null
          );

          setSeverity(
            detection.severity ||
              "Moderate"
          );

          if (
            diseaseName === "Unknown" ||
            diseaseName ===
              "Unknown disease"
          ) {
            setExplanation(
              t(
                "Unable to confidently identify this disease. Please upload a clearer leaf photo."
              )
            );

            return;
          }

          // ===================================================
          // GEMINI EXPLANATION
          // ===================================================

          try {
            const explanationText =
              await getDiseaseExplanation(
                diseaseName,
                selectedCrop,
                language
              );

            setExplanation(
              explanationText ||
                t(
                  "The disease was detected, but the detailed AI explanation is currently unavailable."
                )
            );
          } catch (error) {
            console.error(
              "Gemini explanation failed:",
              error
            );

            setExplanation(
              t(
                "AI explanation unavailable offline. Connect to the internet to get treatment and prevention guidance."
              )
            );
          }
        } catch (error) {
          console.error(
            "Disease detection failed:",
            error
          );

          setMessage(
            t(
              "Unable to analyze this image."
            )
          );
        } finally {
          setAnalyzing(false);
        }
      };

      image.onerror = () => {
        setAnalyzing(false);

        setMessage(
          t(
            "Unable to load the selected image."
          )
        );
      };

      image.src = previewUrl;
    } catch (error) {
      console.error(error);

      setAnalyzing(false);

      setMessage(
        t(
          "Unable to analyze this image."
        )
      );
    }
  }

  // =========================================================
  // SAVE DISEASE RESULT
  // =========================================================

  async function savePrediction() {
    try {
      setSaving(true);
      setMessage("");

      if (
        !disease ||
        disease === "Unknown"
      ) {
        setMessage(
          t(
            "There is no confident disease result to save."
          )
        );

        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setMessage(
          t("Please log in first.")
        );

        return;
      }

      const confidenceValue =
        Number.isFinite(Number(confidence))
          ? Number(confidence)
          : 0;

      const notes = `Detected: ${disease} (${confidenceValue}% confidence)`;

      const cropName =
        selectedCrop || "Unknown Crop";

      const recordId =
        await queueTableWrite({
          table: "disease_reports",
          operation: "insert",
          payload: {
            user_id: user.id,
            farm_id: farmId || null,
            crop_name: cropName,
            notes,
          },
        });

      setRecentScans((prev) =>
        [
          {
            id: recordId,
            crop_name: cropName,
            notes,
            created_at:
              new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 5)
      );

      setMessage(
        navigator.onLine
          ? t(
              "Disease scan saved — syncing now."
            )
          : t(
              "Saved offline — will sync automatically once you're back online."
            )
      );
    } catch (error) {
      console.error(
        "Failed to save disease report:",
        error
      );

      setMessage(
        t(
          "Unable to save disease scan."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================================================
  // SPEAK EXPLANATION
  // =========================================================

  function speakExplanation() {
    if (
      !("speechSynthesis" in window) ||
      !explanation
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    const speech =
      new SpeechSynthesisUtterance(
        explanation
      );

    speech.lang =
      SPEECH_LANGUAGES[language] ||
      "en-IN";

    window.speechSynthesis.speak(
      speech
    );
  }

  // =========================================================
  // RECENT SCAN CONFIDENCE
  // =========================================================

  const scanConfidence =
    parseConfidenceFromNotes;

  // =========================================================
  // UI
  // =========================================================

  return (
    <Layout title={t("Crop Scanner")}>
      <h2 className="font-serif text-2xl font-bold text-[#24352a]">
        {t("AI Crop Health Scanner")}
      </h2>

      {/* =====================================================
          DISCLAIMER
      ====================================================== */}

      <div className="mt-3 rounded-xl border border-[#e5dfd2] bg-[#f7f5ee] px-4 py-3 text-xs leading-5 text-slate-500">
        <span className="font-semibold text-[#59645c]">
          Disclaimer:
        </span>{" "}
        AI-generated disease assessments and
        recommendations are for informational
        purposes only. Please do not rely on
        them blindly; consult a qualified
        agricultural expert or relevant
        professional before taking major
        treatment or crop-management
        decisions.
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ===================================================
            LEFT COLUMN
        ==================================================== */}

        <div className="space-y-5">
          {/* =================================================
              UPLOAD / CAMERA
          ================================================== */}

          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#e8c9a0] bg-[#fbeee0] p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f3d9b8] text-[#b5651d]">
              <Camera size={26} />
            </div>

            <p className="text-lg font-bold text-[#24352a]">
              {t(
                "Upload or Capture Leaf Photo"
              )}
            </p>

            <p className="text-sm text-slate-500">
              {t(
                "JPG, PNG, WEBP · Max 10MB"
              )}
            </p>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Buttons */}
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              {/* CAMERA */}
              <button
                type="button"
                onClick={startCamera}
                disabled={
                  cameraLoading ||
                  cameraOpen
                }
                className="flex items-center justify-center gap-2 rounded-full bg-[#1f5b3d] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#173b27] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cameraLoading ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <Camera size={16} />
                )}

                {t("Take Photo")}
              </button>

              {/* UPLOAD */}
              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="flex items-center justify-center gap-2 rounded-full bg-[#f0a664] px-5 py-2.5 text-sm font-semibold text-[#4a2e10] shadow-sm hover:bg-[#e5924a]"
              >
                <Upload size={16} />

                {t("Choose Photo")}
              </button>
            </div>

            {/* CAMERA ERROR */}
            {cameraError && (
              <div className="mt-2 w-full rounded-xl bg-red-50 p-3 text-left text-xs text-red-700">
                {cameraError}
              </div>
            )}
          </div>

          {/* =================================================
              ERROR / MODEL STATUS
          ================================================== */}

          {(message || modelError) && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle
                size={18}
                className="mt-0.5 shrink-0"
              />

              <span>
                {message || modelError}
              </span>
            </div>
          )}

          {/* =================================================
              TIPS
          ================================================== */}

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#e5dfd2]">
            <p className="flex items-center gap-2 font-bold text-[#24352a]">
              <Eye size={16} />

              {t("Tips for Best Results")}
            </p>

            <ul className="mt-3 space-y-2.5">
              {TIPS.map((tip) => (
                <li
                  key={tip}
                  className="flex items-center gap-2 text-sm text-[#3d4d40]"
                >
                  <CheckCircle2
                    size={16}
                    className="shrink-0 text-green-600"
                  />

                  {t(tip)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ===================================================
            RIGHT COLUMN
        ==================================================== */}

        <div className="space-y-5">
          {/* =================================================
              CAMERA PREVIEW
          ================================================== */}

          {cameraOpen && (
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#e5dfd2]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-[#24352a]">
                  {t("Camera Preview")}
                </p>

                <Camera
                  size={18}
                  className="text-[#2f7357]"
                />
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#1f5b3d] px-5 py-3 text-sm font-bold text-white hover:bg-[#173b27]"
                >
                  <Camera size={17} />

                  {t("Capture Photo")}
                </button>

                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-full border border-[#e5dfd2] bg-white px-5 py-3 text-sm font-semibold text-[#24352a] hover:bg-[#f7f5ee]"
                >
                  {t("Cancel")}
                </button>
              </div>
            </div>
          )}

          {/* =================================================
              IMAGE / RESULT
          ================================================== */}

          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-[#e5dfd2]">
            {previewUrl ? (
              <>
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt="Uploaded leaf"
                  className="max-h-56 w-full rounded-xl object-contain"
                />

                <button
                  type="button"
                  onClick={analyzeImage}
                  disabled={
                    !modelReady ||
                    modelLoading ||
                    analyzing
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1f5b3d] px-5 py-3 text-sm font-bold text-white hover:bg-[#173b27] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {analyzing ? (
                    <>
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />

                      {t("Analyzing...")}
                    </>
                  ) : modelLoading ? (
                    <>
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />

                      {t(
                        "Loading disease model..."
                      )}
                    </>
                  ) : (
                    <>
                      <ScanSearch size={17} />

                      {t("Analyze Leaf")}
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f1e7] text-slate-400">
                  <Leaf size={22} />
                </div>

                <p className="font-bold text-[#24352a]">
                  {t(
                    "No photo uploaded yet"
                  )}
                </p>

                <p className="text-sm text-slate-500">
                  {t(
                    "Upload a leaf photo to get instant disease analysis"
                  )}
                </p>
              </>
            )}

            {modelLoading && (
              <p className="text-xs text-slate-500">
                {t(
                  "Loading disease model..."
                )}
              </p>
            )}

            {/* =================================================
                DETECTION RESULT
            ================================================== */}

            {disease && (
              <div className="mt-3 w-full rounded-2xl bg-[#f4f1e7] p-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {t("Detection Result")}
                    </p>

                    <p className="mt-1 text-lg font-bold text-[#24352a]">
                      {disease}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      SEVERITY_THEME[
                        severity
                      ] ||
                      SEVERITY_THEME.Moderate
                    }`}
                  >
                    {severity}
                  </span>
                </div>

                {confidence !== null && (
                  <p className="mt-1 text-sm text-slate-500">
                    {t("Confidence:")}{" "}
                    {Number(
                      confidence
                    ).toFixed(1)}
                    %
                  </p>
                )}

                {disease !== "Unknown" &&
                  disease !==
                    "Unknown disease" && (
                    <button
                      type="button"
                      onClick={
                        savePrediction
                      }
                      disabled={saving}
                      className="mt-3 flex items-center gap-2 rounded-full bg-[#2f7357] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {saving ? (
                        <Loader2
                          size={14}
                          className="animate-spin"
                        />
                      ) : (
                        <Save size={14} />
                      )}

                      {t("Save Scan")}
                    </button>
                  )}
              </div>
            )}

            {/* =================================================
                AI EXPLANATION
            ================================================== */}

            {explanation && (
              <div className="mt-2 w-full rounded-2xl bg-white p-4 text-left ring-1 ring-[#e5dfd2]">
                <div className="flex items-center gap-2">
                  <Leaf
                    size={16}
                    className="text-[#2f7357]"
                  />

                  <p className="font-bold text-[#24352a]">
                    {t("AI Explanation")}
                  </p>
                </div>

                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#3d4d40]">
                  {explanation}
                </p>

                <button
                  type="button"
                  className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#2f7357]"
                  onClick={
                    speakExplanation
                  }
                >
                  <Volume2 size={14} />

                  {t(
                    "Read explanation aloud"
                  )}
                </button>
              </div>
            )}

            {message && (
              <p className="text-xs font-medium text-[#2f7357]">
                {message}
              </p>
            )}
          </div>

          {/* =================================================
              RECENT SCANS
          ================================================== */}

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#e5dfd2]">
            <p className="font-bold text-[#24352a]">
              {t("Recent Scans")}
            </p>

            <div className="mt-3 space-y-1">
              {recentScans.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">
                  {t(
                    "No saved scans yet."
                  )}
                </p>
              ) : (
                recentScans.map((scan) => {
                  const confidenceValue =
                    scanConfidence(
                      scan.notes
                    );

                  return (
                    <div
                      key={scan.id}
                      className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-[#f7f5ee]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4f1e7] text-[#1f5b3d]">
                          <Leaf size={16} />
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-[#24352a]">
                            {scan.crop_name ||
                              t("Crop")}
                          </p>

                          <p className="text-xs text-slate-500">
                            {scan.created_at
                              ? new Date(
                                  scan.created_at
                                ).toLocaleDateString()
                              : "--"}
                          </p>
                        </div>
                      </div>

                      {confidenceValue !==
                        null && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            confidenceValue >=
                            80
                              ? SEVERITY_THEME.Mild
                              : confidenceValue >=
                                60
                              ? SEVERITY_THEME.Moderate
                              : SEVERITY_THEME.Severe
                          }`}
                        >
                          {confidenceValue}%
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}