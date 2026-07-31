import { Settings2, Volume2, VolumeX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { useInterviewVoice } from "@/features/mock-interview/voice/useInterviewVoice";
import { cn } from "@/lib/utils";

/**
 * Sustained-silence window before an auto-send fires. Deliberately generous:
 * a shorter window (the original 3s) submits while the candidate is still
 * gathering their next sentence, which is exactly the moment a real answer
 * pauses. Only reachable when the user opts in.
 */
const AUTO_SEND_SILENCE_SECONDS = 6;

// ── VoiceSettingsPopover (Module 7C) ──
//
// Voice on/off, which system voice to use, and speaking rate — all persisted
// to localStorage (see voice/prefs.ts), never the database: these are
// per-device browser settings, not account settings.

export function VoiceSettingsPopover({ voice }: { voice: ReturnType<typeof useInterviewVoice> }) {
  if (!voice.capabilities.synthesis) return null;
  const muted = !voice.prefs.voiceEnabled;

  return (
    <div className="flex items-center gap-1.5">
      {/* Mute is a one-click control in the main bar, not something to hunt for
          inside a popover — it's the setting a candidate reaches for mid-
          interview (a shared room, headphones off), and it needs to be
          instantly reversible. */}
      <button
        onClick={() => voice.setPrefs({ voiceEnabled: muted })}
        aria-pressed={muted}
        aria-label={muted ? "Unmute interviewer voice" : "Mute interviewer voice"}
        title={muted ? "Interviewer voice is muted" : "Mute interviewer voice"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
          muted
            ? "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"
            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
        )}
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        {muted ? "Muted" : "Sound"}
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label="Voice settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 border-black/10 bg-white text-[oklch(0.2_0.02_265)]"
          align="start"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Interviewer voice</span>
              <Switch
                checked={voice.prefs.voiceEnabled}
                onCheckedChange={(checked) => voice.setPrefs({ voiceEnabled: checked })}
              />
            </div>

            {voice.voices.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[oklch(0.45_0.02_265)]">
                  Voice
                </label>
                <select
                  value={voice.prefs.voiceURI ?? ""}
                  onChange={(e) => voice.setPrefs({ voiceURI: e.target.value || null })}
                  className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm"
                >
                  <option value="">System default</option>
                  {voice.voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-[oklch(0.45_0.02_265)]">
                <span>Speaking rate</span>
                <span>{voice.prefs.rate.toFixed(1)}x</span>
              </label>
              <input
                type="range"
                min={0.75}
                max={1.5}
                step={0.05}
                value={voice.prefs.rate}
                onChange={(e) => voice.setPrefs({ rate: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            {voice.capabilities.recognition && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  Auto-send after {AUTO_SEND_SILENCE_SECONDS}s of silence
                  <span className="mt-0.5 block text-xs text-[oklch(0.55_0.02_265)]">
                    Off by default, so a pause to think never sends a half-finished answer.
                  </span>
                </span>
                <Switch
                  checked={voice.prefs.autoSendAfterSilenceSeconds != null}
                  onCheckedChange={(checked) =>
                    voice.setPrefs({
                      autoSendAfterSilenceSeconds: checked ? AUTO_SEND_SILENCE_SECONDS : null,
                    })
                  }
                />
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
