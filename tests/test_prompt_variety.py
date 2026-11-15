import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import generate


def write_log(root: Path, show: str, n: int, payload: dict, age: float = 0):
    prompts = root / show / "prompts"
    prompts.mkdir(parents=True, exist_ok=True)
    log = prompts / f"{n:02d}-song.prompt.json"
    log.write_text(json.dumps({"payload": payload}))
    stamp = time.time() - age
    os.utime(log, (stamp, stamp))


class PromptVarietyTest(unittest.TestCase):
    def test_phrases_skip_filler_and_tempo(self):
        found = generate.phrases("Electroclash, 130 BPM in C minor. A clap on two and four, pushed through an overloaded preamp.")
        self.assertIn("through an overloaded preamp", found)
        self.assertNotIn("clap on two and", found)
        self.assertFalse(any("bpm" in p for p in found))

    def test_worn_phrases_come_from_recent_shows_only(self):
        lore = "A dry kick pushed through an overloaded preamp until the concrete answers back."
        with tempfile.TemporaryDirectory() as tmp, patch.object(generate, "OUTPUT_DIR", Path(tmp)):
            root = Path(tmp)
            write_log(root, "old-show", 1, {"bpm": 120, "caption": "Recorded on a melted wax cylinder in a lighthouse."}, age=1000)
            write_log(root, "old-show", 2, {"bpm": 120, "caption": "Recorded on a melted wax cylinder in a lighthouse."}, age=1000)
            for show in ("a", "b"):
                write_log(root, show, 1, {"bpm": 130, "caption": lore, "signal_path": "60Hz mains hum on a dead relay"})
            worn = generate.worn_phrases(shows=2)
        self.assertTrue(any("overloaded preamp" in p for p in worn))
        self.assertFalse(any("wax cylinder" in p for p in worn))
        # One sentence is listed once, not as every run of four words in it.
        self.assertLess(len(worn), len(generate.phrases(lore)))

    def test_shared_phrases_exempt_only_the_shared_artist(self):
        sound = "A Korg drum machine and a bass guitar played with a coin."
        songs = [{"caption": f"EBM. {sound}"}, {"caption": "Italo. A cowbell."}, {"caption": f"EBM again. {sound}"}]
        self.assertEqual(generate.shared_phrases(songs, [1, 3]), [])
        self.assertTrue(generate.shared_phrases(songs, []))

    def test_track_ideas_pad_and_trim(self):
        self.assertEqual(generate.track_ideas({"tracks": ["one", {"idea": "two"}, None]}, 4), ["one", "two", "", ""])
        self.assertEqual(generate.track_ideas({"tracks": ["one", "two", "three"]}, 2), ["one", "two"])
        self.assertEqual(generate.track_ideas({"brief": "no ideas"}, 2), ["", ""])

    def test_each_idea_reaches_the_dj_and_stays_on_its_song(self):
        producer = json.dumps({"show_name": "Freight Lift", "brief": "A long brief about a harbour at night, nobody left.",
                               "tracks": ["A 1983 rehearsal room, a borrowed Juno.", "An orbital laundromat, a coin-played bass."]})
        songs = json.dumps([{"title": f"T{n}", "artist": f"A{n}", "caption": f"EBM, 120 BPM. Song {n}.", "lyrics": "[Instrumental]",
                             "bpm": 120, "keyscale": "A minor", "duration": 200} for n in (1, 2)])
        calls = []

        def fake_llm(system, user):
            calls.append(user)
            return producer if len(calls) == 1 else "Dead Internet Radio." if len(calls) == 2 else songs

        with tempfile.TemporaryDirectory() as tmp, patch.object(generate, "OUTPUT_DIR", Path(tmp)), \
                patch.object(generate, "OPENROUTER_API_KEY", "x"), patch.object(generate, "call_llm", side_effect=fake_llm), \
                patch.object(generate, "shared_artist_tracks", return_value=[]), \
                patch("sys.argv", ["generate.py", "dock", "--dry-run", "--tracks", "2", "--delay", "0"]):
            generate.main()
            logs = sorted(Path(tmp).glob("*/prompts/0[1-9]-*.prompt.json"))
            payloads = [json.loads(p.read_text())["payload"] for p in logs]
        self.assertIn("Write 2 track ideas", calls[0])
        self.assertIn("1. A 1983 rehearsal room, a borrowed Juno.", calls[2])
        self.assertIn("2. An orbital laundromat, a coin-played bass.", calls[2])
        self.assertEqual([p["idea"] for p in payloads],
                         ["A 1983 rehearsal room, a borrowed Juno.", "An orbital laundromat, a coin-played bass."])

    def test_missing_terms_checks_asks_not_easing(self):
        notes = "super dark darkwave, sparse bass driver, robo techno, 132bpm"
        song = {"caption": "Robo techno, 132 BPM in C minor. A super dark kick. A sparse bass driver.", "bpm": 132}
        self.assertEqual(generate.missing_terms(notes, song), ["darkwave"])
        self.assertEqual(generate.missing_terms("needs more cowbell, punchier, faster, weirder", {"caption": "Dark disco, 140 BPM."}), ["cowbell"])
        self.assertEqual(generate.missing_terms("darkwave with no hats", {"caption": "Techno, 120 BPM."}), ["darkwave"])
        self.assertEqual(generate.missing_terms("pop, dub", {"caption": "Popping dubstep."}), ["pop", "dub"])
        self.assertEqual(generate.missing_terms("132bpm", {"caption": "Techno.", "bpm": 132.0}), [])
        self.assertEqual(generate.missing_terms("132bpm", {"caption": "Techno.", "bpm": "132 BPM"}), [])
        self.assertEqual(generate.missing_terms("a bit too cheesy, too slow, make in 124bpm", {"caption": "Dark disco.", "bpm": 120}), ["124 BPM"])

    def test_revise_song_follows_the_notes_and_replaces_old_sound_fields(self):
        old = {"caption": "Darkwave, 98 BPM. Recorded to 4-track tape in a concrete basement.", "bpm": 98, "keyscale": "C minor",
               "duration": 217, "signal_path": "Shortwave bounce, preamp overload", "lyrics": "[Instrumental]"}
        first = {"caption": "Robo techno, 132 BPM. A super dark sparse bass driver.", "bpm": 132, "signal_path": "Desk to DAT"}
        second = {**first, "caption": "Darkwave robo techno, 132 BPM. A super dark sparse bass driver."}
        replies = iter([json.dumps(first), json.dumps(second)])
        with patch.object(generate, "call_llm", side_effect=lambda system, message: next(replies)) as llm:
            song, _ = generate.revise_song(old, "jumpers", "fatties", "super dark darkwave, sparse bass driver, robo techno, 132bpm")
        self.assertEqual(llm.call_count, 2)
        self.assertIn("left out: darkwave", llm.call_args_list[1].args[1])
        self.assertTrue(song["caption"].startswith("Darkwave robo techno"))
        self.assertEqual(song["signal_path"], "Desk to DAT")
        self.assertEqual(song["frequency_band"], "")


if __name__ == "__main__":
    unittest.main()
