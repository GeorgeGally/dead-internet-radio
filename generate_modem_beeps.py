#!/usr/bin/env python3
"""Generate modem beep/blip sounds and append them to a WAV file."""
import sys
import numpy as np
import soundfile as sf
from pathlib import Path


def generate_modem(sr=24000, pause=0.6):
    """Generate ~2.5s of modem blips and beeps with a pause before."""
    beeps = []

    # 1. Three rising dial tones
    for f in [350, 440, 480]:
        dur = 0.08
        t = np.linspace(0, dur, int(sr * dur), False)
        tone = np.sin(2 * np.pi * f * t) * 0.25
        beeps.append(tone)
        beeps.append(np.zeros(int(sr * 0.06)))

    # 2. DTMF-style tone pairs (short stabs)
    pairs = [(697, 1209), (770, 1336), (852, 1477), (941, 1633),
             (697, 1477), (770, 1633)]
    for f1, f2 in pairs:
        dur = 0.07
        t = np.linspace(0, dur, int(sr * dur), False)
        tone = (np.sin(2 * np.pi * f1 * t) + np.sin(2 * np.pi * f2 * t)) * 0.2
        beeps.append(tone)
        beeps.append(np.zeros(int(sr * 0.05)))

    # 3. Carrier warble (short sweep)
    dur = 0.3
    t = np.linspace(0, dur, int(sr * dur), False)
    sweep = np.sin(2 * np.pi * (800 + 400 * t / dur) * t) * 0.15
    beeps.append(sweep)
    beeps.append(np.zeros(int(sr * 0.15)))

    # 4. Final confirmation beep
    dur = 0.15
    t = np.linspace(0, dur, int(sr * dur), False)
    fin = np.sin(2 * np.pi * 440 * t) * 0.2
    beeps.append(fin)

    result = np.concatenate(beeps)
    # Normalize
    peak = np.max(np.abs(result))
    if peak > 0:
        result = result / peak * 0.25
    return result


def main():
    voice_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else voice_path

    voice, sr = sf.read(str(voice_path))

    # Ensure mono
    if voice.ndim > 1:
        voice = voice.mean(axis=1)

    pause_samples = int(sr * 0.6)
    modem = generate_modem(sr)

    combined = np.concatenate([voice, np.zeros(pause_samples), modem])

    peak = np.max(np.abs(combined))
    if peak > 0:
        combined = combined / peak * 0.95

    sf.write(str(out_path), combined, sr)
    print(f"  Modem appended: {out_path.name} ({len(combined)/sr:.1f}s)")


if __name__ == "__main__":
    main()
