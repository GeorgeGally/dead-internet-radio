#!/usr/bin/env python3
"""Create a DJ mix from generated tracks with cross-fades and voice overlays.

Usage:
    python3 djmix.py output/midnight-20260614-120000
    python3 djmix.py output/midnight-20260614-120000 --crossfade 6 --offset 2

Requirements: ffmpeg, mutagen (pip install mutagen[mp3])
"""
import argparse
import json
import random
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from mutagen.mp3 import MP3
    from mutagen import File as MutaFile
except ImportError:
    print("pip install mutagen", file=sys.stderr)
    sys.exit(1)

DJ_VO_RE = re.compile(r"-DJ-voice-")
MIXES_DIR = Path("mixes")
STATION_IDS_DIR = Path("station-ids")


class ShowMeta:
    """Reads track metadata from prompt JSONs in a show directory."""

    def __init__(self, input_dir: Path | str):
        self.input_dir = Path(input_dir)
        self._artists: dict[int, str] = {}
        self._titles: dict[int, str] = {}
        self._slot: str | None = None

        prompts_dir = self.input_dir / "prompts"
        for f in sorted(prompts_dir.glob("*.prompt.json")):
            try:
                data = json.loads(f.read_text())
                nn = data.get("track")
                payload = data.get("payload", {})
                if nn is not None and nn > 0:
                    self._artists[nn] = payload.get("artist", "")
                    self._titles[nn] = payload.get("title", "")
                if nn == 0 and not self._slot:
                    self._slot = data.get("slot")
                if nn == 1 and not self._slot:
                    self._slot = data.get("slot")
            except (json.JSONDecodeError, KeyError):
                pass

    def unique_artists(self) -> list[str]:
        seen: list[str] = []
        for a in dict(sorted(self._artists.items())).values():
            if a and a not in seen:
                seen.append(a)
        return seen

    def cues(self, mix_start: dict[int, float],
             music: dict[int, Path]) -> list[dict]:
        """Build cue points for the mix: timestamp + track info."""
        result = []
        for nn in sorted(music.keys()):
            start = mix_start.get(nn, 0)
            result.append({
                "time": round(start, 1),
                "title": self._titles.get(nn, ""),
                "artist": self._artists.get(nn, ""),
            })
        return result

    def mix_name(self) -> str:
        parts = []
        ua = self.unique_artists()
        if ua:
            parts.append(" / ".join(ua))
        if self._slot:
            parts.append(self._slot)
        return " — ".join(parts) if parts else "Dead Internet Radio — Untitled Broadcast"

    def output_filename(self, ext: str = ".mp3") -> str:
        safe = re.sub(r"[^a-zA-Z0-9]+", "-", self.mix_name()).strip("-")
        return safe.lower() + ext


def _parse_track(filename: str) -> tuple:
    m = re.match(r"^(\d+)-(.+)-dead-internet-radio\.mp3$", filename)
    if m:
        return int(m.group(1)), m.group(2)

    m = re.match(r"^dead-internet-radio-track-(\d+)-(.+)\.mp3$", filename)
    if m:
        return int(m.group(1)), m.group(2)

    return None, None


def get_duration(path: Path) -> float:
    try:
        return MP3(str(path)).info.length
    except Exception:
        pass
    try:
        from mutagen import File as MutaFile
        info = MutaFile(str(path))
        if info and info.info:
            return info.info.length
    except Exception:
        pass
    return 3.0


def crossfade_chain(tracks: list[Path], output: Path, duration: float):
    """Iteratively cross-fade a list of tracks into a single mix."""
    if len(tracks) == 1:
        shutil.copy2(tracks[0], output)
        return

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        current = tracks[0]

        for i, track in enumerate(tracks[1:], 1):
            next_out = tmp / f"step_{i:03d}.mp3"
            cmd = [
                "ffmpeg", "-y",
                "-i", str(current),
                "-i", str(track),
                "-filter_complex", f"acrossfade=d={duration}:c1=tri:c2=tri",
                "-c:a", "libmp3lame", "-q:a", "2",
                str(next_out),
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            current = next_out

        shutil.copy2(current, output)


def overlay_voices(mix_path: Path, voices: list[tuple[float, Path]],
                   output_path: Path, voice_gain: float,
                   reverb_decay: float = 0):
    """Overlay voices onto a mix at absolute timestamps using a single ffmpeg pass."""
    if not voices:
        shutil.copy2(mix_path, output_path)
        return

    voices = sorted(voices, key=lambda x: x[0])

    inputs = ["ffmpeg", "-y", "-i", str(mix_path)]
    filters = []
    mix_labels = ["[0]"]
    mix_weights = ["1"]

    for i, (start_sec, vpath) in enumerate(voices):
        inputs.extend(["-i", str(vpath)])
        delay_ms = int(start_sec * 1000)
        tag = i + 1
        chain = f"adelay={delay_ms}|{delay_ms}"
        if reverb_decay > 0:
            chain += f",aecho=1:1:20|40:{reverb_decay * 0.3}|{reverb_decay * 0.15}"
        filters.append(f"[{tag}]{chain}[v{tag}]")
        mix_labels.append(f"[v{tag}]")
        mix_weights.append(str(voice_gain))

    num = len(mix_labels)
    if filters:
        mix_filter = ";".join(filters) + ";"
    else:
        mix_filter = ""
    mix_filter += "".join(mix_labels) + f"amix=inputs={num}:duration=first:weights={' '.join(mix_weights)}"

    cmd = inputs + [
        "-filter_complex", mix_filter,
        "-c:a", "libmp3lame", "-q:a", "2",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def write_id3(path: Path, title: str, artist: str | None = None):
    try:
        audio = MutaFile(str(path), easy=True)
        if audio is None:
            return
        audio["title"] = title
        if artist:
            audio["artist"] = artist
        audio.save()
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(
        description="Mix Dead Internet Radio tracks into a DJ set"
    )
    parser.add_argument(
        "directory",
        help="Directory containing numbered track MP3s",
    )
    parser.add_argument(
        "--output", "-o",
        default="",
        help="Output path (default: mixes/<show-name>/<mix-name>.mp3)",
    )
    parser.add_argument(
        "--title",
        default="",
        help="Mix title (default: derived from artists and slot)",
    )
    parser.add_argument(
        "--crossfade", "-c",
        type=float,
        default=10,
        help="Cross-fade duration in seconds (default: 10)",
    )
    parser.add_argument(
        "--offset",
        type=float,
        default=0.5,
        help="Seconds into the track to start DJ voice (default: 0.5)",
    )
    parser.add_argument(
        "--voice-gain",
        type=float,
        default=1.3,
        help="Voice volume multiplier when mixed over music (default: 1.3)",
    )
    parser.add_argument(
        "--voice-reverb",
        type=float,
        default=0.3,
        help="Subtle reverb decay on voice (0=off, 0.3=subtle room, default: 0.3)",
    )
    parser.add_argument(
        "--station-id-gain",
        type=float,
        default=0.6,
        help="Station ID volume during mix (default: 0.6)",
    )
    parser.add_argument(
        "--no-opening",
        action="store_true",
        help="Skip track 00 (DJ opening) — mix music tracks only",
    )
    parser.add_argument(
        "--opening-offset",
        type=float,
        default=4,
        help="Seconds of DJ intro before first track starts fading in (default: 4)",
    )
    args = parser.parse_args()

    input_dir = Path(args.directory).resolve()
    if not input_dir.is_dir():
        print(f"Not a directory: {input_dir}", file=sys.stderr)
        sys.exit(1)

    # Find all tracks (music and voice files share nn, so store separately)
    opening_path = None
    music = {}
    voices = {}

    for f in sorted(input_dir.glob("*.mp3")):
        nn, _ = _parse_track(f.name)
        if nn is None:
            continue
        if nn == 0:
            opening_path = f
        elif DJ_VO_RE.search(f.name):
            voices[nn] = f
        else:
            music[nn] = f

    if len(music) < 1:
        print("No music tracks found in directory", file=sys.stderr)
        sys.exit(1)

    # Load show metadata
    meta = ShowMeta(input_dir)
    mix_title = args.title or meta.mix_name()
    default_out = str(MIXES_DIR / meta.output_filename())
    output_path = Path(args.output or default_out)

    track_nums = sorted(music.keys())
    print(f"Directory: {input_dir}")
    print(f"Mix: {mix_title}")
    print(f"Output: {output_path}")
    print(f"Music tracks: {len(track_nums)} ({', '.join(f'{n:02d}' for n in track_nums)})")
    print(f"DJ voiceovers: {len(voices)}")
    if opening_path and not args.no_opening:
        print(f"DJ opening: {opening_path.name}")
    print(f"Cross-fade: {args.crossfade}s")
    print(f"Voice offset: {args.offset}s into track")
    if args.voice_reverb > 0:
        print(f"Voice reverb: {args.voice_reverb}")
    if opening_path and not args.no_opening:
        print(f"Opening offset: {args.opening_offset}s (music starts during DJ intro)")
    print()

    # Calculate durations
    dur = {}
    if opening_path and not args.no_opening:
        dur[0] = get_duration(opening_path)
    for n in track_nums:
        dur[n] = get_duration(music[n])

    # Calculate track start times in the final mix timeline
    # Opening is overlaid at position 0 (no cross-fade with music)
    # First track starts at opening_offset (or 0 if no opening)
    mix_start = {}
    cf = args.crossfade
    opening_offset = args.opening_offset if (opening_path and not args.no_opening) else 0.0
    t = opening_offset

    mix_start[track_nums[0]] = t
    t += dur[track_nums[0]]
    remaining = track_nums[1:]

    for n in remaining:
        mix_start[n] = t - cf
        t += dur[n] - cf

    mix_duration = t

    # Phase 1: Build music-only cross-faded mix (no voices, no opening)
    print("Phase 1: Cross-fading tracks...")
    with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)

            if len(track_nums) == 1:
                music_mix = music[track_nums[0]]
            else:
                music_mix = tmp / "music_mix.mp3"
                crossfade_chain([music[n] for n in track_nums], music_mix, cf)

            # Pad start of music mix so music enters at opening_offset
            if opening_offset > 0:
                padded = tmp / "padded_music.mp3"
                delay_ms = int(opening_offset * 1000)
                subprocess.run([
                    "ffmpeg", "-y", "-i", str(music_mix),
                    "-af", f"adelay={delay_ms}|{delay_ms}",
                    "-c:a", "libmp3lame", "-q:a", "2",
                    str(padded),
                ], check=True, capture_output=True)
                music_mix = padded

            # Phase 2: Overlay DJ voices on the padded music mix
            print("Phase 2: Overlaying DJ voices...")
            voice_placements = []

            if opening_path and not args.no_opening:
                voice_placements.append((0.0, opening_path))
                print(f"  Opening at 0.0s (music starts at {opening_offset:.0f}s)")

            for vn in sorted(voices.keys()):
                if vn in mix_start:
                    start = mix_start[vn] + args.offset
                    voice_placements.append((start, voices[vn]))
                    print(f"  Voice track {vn:02d} at {start:.1f}s")

            output_path.parent.mkdir(parents=True, exist_ok=True)
            if voice_placements:
                with_voices = tmp / "with_voices.mp3"
                overlay_voices(music_mix, voice_placements, with_voices,
                               args.voice_gain, args.voice_reverb)
            else:
                with_voices = music_mix

            # Phase 3: Overlay station IDs over the mix at lower gain
            print("Phase 3: Overlaying station IDs...")
            id_placements = []
            if STATION_IDS_DIR.is_dir():
                id_wavs = sorted(STATION_IDS_DIR.glob("*.wav"))
                id_wavs = [f for f in id_wavs if f.stem.startswith("id-") or f.stem.startswith("jingle-")]
                if id_wavs and mix_duration > 60:
                    num_ids = min(random.randint(1, 3), len(id_wavs))
                    chosen = random.sample(id_wavs, num_ids)
                    for wav in chosen:
                        id_dur = get_duration(wav)
                        latest_start = max(mix_duration - id_dur - 10, mix_duration * 0.15)
                        if latest_start <= mix_duration * 0.15:
                            continue
                        start = random.uniform(mix_duration * 0.15, latest_start)
                        id_placements.append((start, wav))
                        print(f"  Station ID at {start:.1f}s: {wav.name}")

            if id_placements:
                overlay_voices(with_voices, id_placements, output_path,
                               args.station_id_gain, args.voice_reverb)
            else:
                shutil.copy2(with_voices, output_path)

            write_id3(output_path, mix_title)

            # Write cues JSON alongside the mix
            cues_path = output_path.with_suffix(".cues.json")
            cues_data = meta.cues(mix_start, music)
            cues_path.write_text(json.dumps(cues_data, indent=2))
            print(f"  Cues: {cues_path.name} ({len(cues_data)} tracks)")

    final_dur = get_duration(output_path)
    mins = int(final_dur // 60)
    secs = int(final_dur % 60)
    print(f"\nDone! {output_path} ({mins}m {secs}s)")


if __name__ == "__main__":
    main()
