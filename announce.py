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


def apply_vocoder(audio: np.ndarray, sr: int, mix: float = 0.4) -> np.ndarray:
    """Ring-modulator vocoder for robotic voice character."""
    carrier_freq = 75.0
    t = np.arange(len(audio)) / sr
    carrier = np.sin(2 * np.pi * carrier_freq * t)

    modulated = audio * carrier

    # Gentle low-pass to tame ring modulation harshness
    window = int(sr * 0.0015)
    kernel = np.ones(window) / window
    modulated = np.convolve(modulated, kernel, mode="same")

    # Blend with a high-emphasis copy to keep consonants intelligible
    emphasis = np.zeros_like(audio)
    emphasis[1:] = audio[1:] - 0.9 * audio[:-1]  # simple pre-emphasis

    wet = modulated * 0.65 + emphasis * 0.35
    max_wet = np.max(np.abs(wet))
    if max_wet > 0:
        wet = wet / max_wet * 0.95

    return audio * (1 - mix) + wet * mix


def apply_reverb(audio: np.ndarray, sr: int, mix: float = 0.25, decay: float = 0.4) -> np.ndarray:
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


def generate_announcement(text: str, voice: str, speed: float, intensity: float, out_path: Path):
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
    audio = apply_vocoder(audio, 24000)
    audio = apply_reverb(audio, 24000)

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
    args = parser.parse_args()

    voice = args.voice or "bm_george"
    generate_announcement(args.text, voice, args.speed, args.intensity, args.output)


if __name__ == "__main__":
    main()
