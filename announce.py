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
    if intensity > 0.2:
        window = int(max(1, sr * 0.001 * intensity))
        kernel = np.ones(window) / window
        audio = np.convolve(audio, kernel, mode="same")

    noise_level = intensity * 0.005
    noise = np.random.randn(len(audio)) * noise_level
    audio = audio + noise

    audio = np.clip(audio, -0.85, 0.85)

    return audio


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
