"use client";

import { useState, useEffect } from "react";
import {
  X,
  Key,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Info,
} from "lucide-react";
import {
  setupHuggingFaceToken,
  getDiarizationStatus,
  DiarizationStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface PyannoteSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  initialStatus: DiarizationStatus;
}

type Step = "terms" | "token" | "complete";

export default function PyannoteSetupWizard({
  isOpen,
  onClose,
  onComplete,
  initialStatus,
}: PyannoteSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>("terms");
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      // If token is already configured, start at complete
      if (initialStatus.hf_token_configured && initialStatus.pyannote_available) {
        setCurrentStep("complete");
      } else if (initialStatus.hf_token_configured) {
        // Token exists but pyannote not working - go to terms to re-verify
        setCurrentStep("terms");
      } else {
        setCurrentStep("terms");
      }
      setTokenError(null);
      setToken("");
      setTermsAccepted(false);
    }
  }, [isOpen, initialStatus]);

  const handleSaveToken = async () => {
    if (!token.trim()) {
      setTokenError("Please enter your token");
      return;
    }

    if (!token.startsWith("hf_")) {
      setTokenError("Invalid token. HuggingFace tokens start with 'hf_'");
      return;
    }

    setIsSavingToken(true);
    setTokenError(null);

    try {
      await setupHuggingFaceToken(token);

      // Verify it worked
      const status = await getDiarizationStatus();
      if (status.pyannote_available) {
        setCurrentStep("complete");
      } else if (status.pyannote_error) {
        setTokenError(status.pyannote_error);
      } else if (!status.hf_token_configured) {
        setTokenError("Token could not be saved. Please try again.");
      } else {
        // Token saved but still not available - likely terms not accepted
        setTokenError("Token saved but access denied. Make sure you accepted terms for all 4 repositories: speaker-diarization-3.1, segmentation-3.0, speaker-diarization-community-1, and embedding.");
      }
    } catch (err: any) {
      setTokenError(err.response?.data?.detail || err.message || "Failed to save token");
    } finally {
      setIsSavingToken(false);
    }
  };

  const handleComplete = () => {
    onComplete();
    onClose();
  };

  if (!isOpen) return null;

  // If pyannote is not installed, show unavailable message
  if (!initialStatus.pyannote_installed) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-card w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Info className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">
                Feature Not Available
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-400" />
            <h3 className="text-lg font-medium text-slate-100">
              AI Speaker Detection
            </h3>
            <p className="text-sm text-slate-400">
              Advanced speaker detection with Pyannote will be available in a future update.
            </p>
            <p className="text-sm text-slate-400">
              For now, basic clustering will be used to identify speakers.
            </p>
            <button onClick={onClose} className="btn btn-primary w-full mt-4">
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (initialStatus.pyannote_error) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-card w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">
                Pyannote Needs Local Setup
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 text-center">
            <p className="text-sm text-slate-400">
              The HuggingFace resources are accessible, but the local audio decoder is missing or broken.
            </p>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm select-text">
              <p className="font-medium">Details</p>
              <p className="opacity-80">{initialStatus.pyannote_error}</p>
            </div>
            <p className="text-xs text-slate-400">
              Some audio processing components may be missing. Try restarting the app or reinstalling dependencies.
            </p>
            <button onClick={onClose} className="btn btn-primary w-full mt-4">
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { id: "terms", label: "Accept Terms", done: currentStep === "token" || currentStep === "complete" },
    { id: "token", label: "Add Token", done: currentStep === "complete" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-primary/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                AI Speaker Detection Setup
              </h2>
              <p className="text-xs text-slate-400">
                Pyannote - More accurate speaker identification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress steps */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-center gap-2">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                step.done
                  ? "bg-accent-primary/10 text-accent-primary"
                  : currentStep === step.id
                    ? "bg-white/10 text-slate-100"
                    : "text-slate-400"
              )}>
                {step.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">
                    {i + 1}
                  </span>
                )}
                {step.label}
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-400 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Accept Terms */}
          {currentStep === "terms" && (
            <div className="space-y-4">
              <div className="text-center">
                <ExternalLink className="w-12 h-12 mx-auto text-slate-400 mb-3" />
                <h3 className="text-lg font-medium text-slate-100 mb-2">
                  Accept HuggingFace Terms
                </h3>
                <p className="text-sm text-slate-400">
                  Pyannote requires accepting terms for <strong>4 repositories</strong> on HuggingFace.
                  Click each button below and accept the terms.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    const url = "https://huggingface.co/pyannote/speaker-diarization-3.1";
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="btn btn-secondary w-full text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  1. speaker-diarization-3.1
                </button>
                <button
                  onClick={() => {
                    const url = "https://huggingface.co/pyannote/segmentation-3.0";
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="btn btn-secondary w-full text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  2. segmentation-3.0
                </button>
                <button
                  onClick={() => {
                    const url = "https://huggingface.co/pyannote/speaker-diarization-community-1";
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="btn btn-secondary w-full text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  3. speaker-diarization-community-1
                </button>
                <button
                  onClick={() => {
                    const url = "https://huggingface.co/pyannote/embedding";
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                    setTermsAccepted(true);
                  }}
                  className="btn btn-secondary w-full text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  4. embedding
                </button>
              </div>

              <div className="p-3 rounded-lg bg-white/5 text-sm text-slate-400">
                <p className="font-medium text-slate-100 mb-1">For each repository:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Log in to HuggingFace (create account if needed)</li>
                  <li>Click "Agree and access repository"</li>
                  <li>Repeat for all 4 repositories above</li>
                </ol>
              </div>

              <button
                onClick={() => setCurrentStep("token")}
                disabled={!termsAccepted}
                className={cn(
                  "btn w-full",
                  termsAccepted ? "btn-primary" : "btn-secondary opacity-50"
                )}
              >
                {termsAccepted ? "Continue" : "Accept all 4 terms first"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2: Token */}
          {currentStep === "token" && (
            <div className="space-y-4">
              <div className="text-center">
                <Key className="w-12 h-12 mx-auto text-slate-400 mb-3" />
                <h3 className="text-lg font-medium text-slate-100 mb-2">
                  Add Your HuggingFace Token
                </h3>
                <p className="text-sm text-slate-400">
                  Create an access token on HuggingFace and paste it below.
                </p>
              </div>

              <button
                onClick={() => {
                  const url = "https://huggingface.co/settings/tokens/new?tokenType=read";
                  if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(url);
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                className="btn btn-secondary w-full"
              >
                <ExternalLink className="w-4 h-4" />
                Create Token on HuggingFace
              </button>

              <div className="p-3 rounded-lg bg-white/5 text-sm text-slate-400">
                <p className="font-medium text-slate-100 mb-1">Instructions:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click the button above to open HuggingFace</li>
                  <li>Name your token (e.g., "Chatterbox")</li>
                  <li>Select "Read" permission</li>
                  <li>Click "Create token"</li>
                  <li>Copy the token (starts with hf_)</li>
                  <li>Paste it below</li>
                </ol>
              </div>

              <div className="space-y-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setTokenError(null);
                  }}
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="input w-full font-mono text-sm"
                />
                {tokenError && (
                  <p className="text-xs text-red-400">{tokenError}</p>
                )}
              </div>

              <button
                onClick={handleSaveToken}
                disabled={isSavingToken || !token.trim()}
                className="btn btn-primary w-full"
              >
                {isSavingToken ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save & Verify Token
                  </>
                )}
              </button>
            </div>
          )}

          {/* Complete */}
          {currentStep === "complete" && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-accent-primary/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-accent-primary" />
              </div>
              <h3 className="text-lg font-medium text-slate-100">
                Setup Complete!
              </h3>
              <p className="text-sm text-slate-400">
                AI speaker detection is now ready. Your transcriptions will
                have more accurate speaker identification.
              </p>
              <button onClick={handleComplete} className="btn btn-primary w-full">
                Start Using AI Detection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
