#!/Users/radarboy3000/Documents/dead-internet-radio/kokoro/.venv/bin/python3
import argparse
import random
import soundfile as sf
import numpy as np
import sys
from pathlib import Path

from kokoro import KPipeline
from kokoro.model import KModel

VOICES = [
    "bm_daniel",
    "bm_fable",
    "bm_george",
    "bm_lewis",
]


def apply_lofi(audio: np.ndarray, sr: int, intensity: float = 0.3) -> np.ndarray:
    # Low-pass filter for radio/transmission character
    if intensity > 0.2:
        window = int(max(1, sr * 0.001 * intensity))
        kernel = np.ones(window) / window
        audio = np.convolve(audio, kernel, mode="same")

    audio = np.clip(audio, -0.85, 0.85)

    return audio


def apply_vocoder(audio: np.ndarray, sr: int, mix: float = 0.08) -> np.ndarray:
    """Ring-modulator vocoder for robotic voice character. Applied ~15% of the time."""
    if random.random() > 0.15:
        return audio

    carrier_freq = random.uniform(55, 95)
    t = np.arange(len(audio)) / sr
    carrier = (
        np.sin(2 * np.pi * carrier_freq * t) * 0.5
        + np.sin(2 * np.pi * carrier_freq * 2 * t) * 0.25
        + np.sin(2 * np.pi * carrier_freq * 3 * t) * 0.125
    )
    carrier = carrier / np.max(np.abs(carrier))

    modulated = audio * carrier

    # Gentle low-pass to tame ring modulation harshness
    window = int(sr * 0.0015)
    kernel = np.ones(window) / window
    modulated = np.convolve(modulated, kernel, mode="same")

    # Blend with a high-emphasis copy to keep consonants intelligible
    emphasis = np.zeros_like(audio)
    emphasis[1:] = audio[1:] - 0.9 * audio[:-1]  # simple pre-emphasis

    wet = modulated * 0.6 + emphasis * 0.4
    max_wet = np.max(np.abs(wet))
    if max_wet > 0:
        wet = wet / max_wet * 0.95

    return audio * (1 - mix) + wet * mix


def apply_delay(audio: np.ndarray, sr: int, delay_ms: float = 400, feedback: float = 0.3, mix: float = 0.4) -> np.ndarray:
    """Simple delay/echo effect."""
    delay_samples = int(sr * delay_ms / 1000)
    if delay_samples < 1:
        return audio
    wet = np.zeros_like(audio)
    wet[delay_samples:] = audio[:-delay_samples]
    if feedback > 0:
        for i in range(1, 6):
            tap = delay_samples * (i + 1)
            if tap >= len(audio):
                break
            wet[tap:] += audio[:-tap] * (feedback ** i)
    max_wet = np.max(np.abs(wet))
    if max_wet > 0:
        wet = wet / max_wet * 0.95
    return audio * (1 - mix) + wet * mix


def apply_reverb(audio: np.ndarray, sr: int, mix: float = 0.75, decay: float = 0.65) -> np.ndarray:
    """Simple Schroeder-style reverb using comb-like delays."""
    delays_ms = [29.7, 37.1, 41.3, 43.7]
    wet = np.zeros_like(audio)
    for delay_ms in delays_ms:
        delay = int(sr * delay_ms / 1000)
        tap = np.zeros_like(audio)
        tap[delay:] = audio[:-delay]
        wet += tap * decay
    wet /= len(delays_ms)
    return audio * (1 - mix) + wet * mix


def generate_announcement(text: str, voice: str, speed: float, intensity: float, out_path: Path, reverb_mix: float = 0.75, reverb_decay: float = 0.65, delay_ms: float = 70, delay_feedback: float = 0.15, delay_mix: float = 0.18, vocoder_mix: float = 0.08):
    model = KModel(repo_id="hexgrad/Kokoro-82M").to("cpu").eval()
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", model=model)

    all_audio = []
    for r in pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
        if r.audio is not None:
            all_audio.append(r.audio.numpy())

    if not all_audio:
        print("No audio generated", file=sys.stderr)
        sys.exit(1)

    audio = np.concatenate(all_audio)

    audio = apply_lofi(audio, 24000, intensity)
    if vocoder_mix > 0:
        audio = apply_vocoder(audio, 24000, mix=vocoder_mix)
    if delay_ms > 0:
        audio = apply_delay(audio, 24000, delay_ms=delay_ms, feedback=delay_feedback, mix=delay_mix)
    audio = apply_reverb(audio, 24000, mix=reverb_mix, decay=reverb_decay)

    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.95

    sf.write(str(out_path), audio, 24000)
    print(f"  TTS: {out_path.name} ({len(audio)/24000:.1f}s, voice={voice})", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Generate lo-fi TTS announcement")
    parser.add_argument("--text", "-t", required=True)
    parser.add_argument("--output", "-o", required=True, type=Path)
    parser.add_argument("--voice", "-v", help="Kokoro voice (default: bm_george)")
    parser.add_argument("--speed", "-s", type=float, default=1.0)
    parser.add_argument("--intensity", "-i", type=float, default=0.3)
    parser.add_argument("--reverb", "-r", type=float, default=0.75, help="Reverb wet mix 0-1 (default: 0.75)")
    parser.add_argument("--reverb-decay", "-rd", type=float, default=0.65, help="Reverb decay 0-1 (default: 0.65)")
    parser.add_argument("--delay-ms", "-dm", type=float, default=70, help="Delay time in ms (default: 70, 0 = off)")
    parser.add_argument("--delay-feedback", "-df", type=float, default=0.15, help="Delay feedback/gain 0-1 (default: 0.15)")
    parser.add_argument("--delay-mix", "-dx", type=float, default=0.18, help="Delay wet mix 0-1 (default: 0.18)")
    parser.add_argument("--vocoder-mix", "-vm", type=float, default=0.08, help="Vocoder mix 0-1 (0 = off, default: 0.08)")
    args = parser.parse_args()

    voice = args.voice or "bm_george"
    generate_announcement(args.text, voice, args.speed, args.intensity, args.output, reverb_mix=args.reverb, reverb_decay=args.reverb_decay, delay_ms=args.delay_ms, delay_feedback=args.delay_feedback, delay_mix=args.delay_mix, vocoder_mix=args.vocoder_mix)


if __name__ == "__main__":
    main()
