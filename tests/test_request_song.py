import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import generate


class TempoKeyTest(unittest.TestCase):
    def test_strips_tempo_and_key_from_the_caption(self):
        cases = {
            "EBM techno, 126 BPM in E minor, with a stiff bass.": "EBM techno, with a stiff bass.",
            "Electroclash, 128 BPM in F# minor. Degraded 808 kick.": "Electroclash. Degraded 808 kick.",
            "Cosmic disco at 110 bpm. A deep bass in the key of D minor, slow.": "Cosmic disco. A deep bass, slow.",
            "Detroit techno, 125-130 BPM. A rounded kick.": "Detroit techno. A rounded kick.",
            "Goth EBM in Eb minor. A cold voice.": "Goth EBM. A cold voice.",
            "Italo, 120 BPM, A minor. Cowbell.": "Italo. Cowbell.",
        }
        for caption, expected in cases.items():
            self.assertEqual(generate.strip_tempo_key(caption), expected)

    def test_leaves_other_words_alone(self):
        caption = "Darkwave. A minor-key pad, Bb major chords, a 909 kick."
        self.assertEqual(generate.strip_tempo_key(caption), caption)

    def test_ace_step_gets_tempo_and_key_only_as_settings(self):
        sent = {}

        class Reply:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def read(self):
                return json.dumps({"data": {"task_id": "t1"}}).encode()

        def fake_urlopen(req, timeout=None):
            sent.update(json.loads(req.data))
            return Reply()

        song = {"caption": "EBM techno, 126 BPM in E minor. A stiff bass.", "bpm": 118, "keyscale": "D minor", "duration": 200}
        with patch.object(generate.urllib.request, "urlopen", side_effect=fake_urlopen):
            generate.call_ace_step(song)
        self.assertNotIn("126", sent["prompt"])
        self.assertNotIn("E minor", sent["prompt"])
        self.assertTrue(sent["prompt"].startswith("EBM techno. A stiff bass."))
        self.assertEqual((sent["bpm"], sent["key_scale"]), (118, "D minor"))


class RequestSongTest(unittest.TestCase):
    REQUEST = {"requester": "Berlin_4", "artist": "satellite temple", "title": "i love your space suit",
               "note": "dark slow disco", "seed_caption": None,
               "recent_sounds": ["Electroclash, 128 BPM, F# minor", "Electroclash, 130 BPM, C minor"]}

    def test_the_producer_writes_from_the_band_and_title_not_the_request_line(self):
        ask = generate.request_producer_input(self.REQUEST)
        self.assertNotIn("Time slot", ask)
        self.assertIn('"i love your space suit"', ask)
        self.assertIn('"satellite temple" suggests', ask)
        self.assertIn("The listener said: dark slow disco", ask)

    def test_the_songwriter_hears_the_name_and_steers_off_the_last_requests(self):
        block = generate.request_block(self.REQUEST)
        self.assertIn("what the band name and the title suggest", block)
        self.assertIn("Electroclash, 128 BPM, F# minor; Electroclash, 130 BPM, C minor", block)
        self.assertIn("a tempo at least 8 BPM from each", block)
        self.assertNotIn("home families", block)
        self.assertNotIn("genre rules win", block)

    def test_a_request_gets_its_own_idea_and_caption(self):
        producer = json.dumps({"show_name": "Suit Seal", "brief": "A pressurised dance hall on a cargo ship, 1984.",
                               "tracks": ["A 1984 Osaka dance hall, a Juno bass, a woman counting the airlock seals."]})
        song = json.dumps({"title": "x", "artist": "y", "caption": "Italo disco, 116 BPM in G minor. A Juno bass.",
                           "lyrics": "[Instrumental]", "bpm": 116, "keyscale": "G minor", "duration": 200})
        calls = []

        def fake_llm(system, user):
            calls.append(user)
            return producer if len(calls) == 1 else "A request." if len(calls) == 2 else song

        with tempfile.TemporaryDirectory() as tmp, patch.object(generate, "OUTPUT_DIR", Path(tmp)), \
                patch.object(generate, "OPENROUTER_API_KEY", "x"), patch.object(generate, "call_llm", side_effect=fake_llm):
            spec = Path(tmp) / "request.json"
            spec.write_text(json.dumps(self.REQUEST))
            with patch("sys.argv", ["generate.py", "request line", "--dry-run", "--delay", "0", "--request-json", str(spec)]):
                generate.main()
            log = json.loads(next(Path(tmp).glob("*/prompts/01-*.prompt.json")).read_text())
        self.assertNotIn("Time slot", calls[0])
        self.assertIn("This track's idea, from the producer: A 1984 Osaka dance hall", calls[2])
        self.assertIn("Tempo and key go only in bpm and keyscale", calls[2])
        self.assertEqual(log["payload"]["idea"], "A 1984 Osaka dance hall, a Juno bass, a woman counting the airlock seals.")
        self.assertEqual((log["payload"]["title"], log["payload"]["artist"]), ("i love your space suit", "satellite temple"))


class NameClashTest(unittest.TestCase):
    def test_title_and_artist_share_no_content_word(self):
        self.assertEqual(generate.shared_name_words("Refusal Unit", "Glass Refusal"), ["refusal"])
        self.assertEqual(generate.shared_name_words("Signals", "Dead Signal"), ["signal"])
        self.assertEqual(generate.shared_name_words("The Night of Glass", "Of the Mess"), [])

    def test_a_clash_is_asked_again_and_the_artist_stays(self):
        songs = [{"title": "Refusal Unit", "artist": "Glass Refusal", "caption": "EBM."},
                 {"title": "Wire Kiss", "artist": "Neon Hex", "caption": "Italo."}]
        asks = []

        def fake_llm(system, user):
            asks.append(user)
            return json.dumps({"title": "Pressure Seal", "artist": "Someone Else", "caption": "EBM."})

        with patch.object(generate, "call_llm", side_effect=fake_llm):
            generate.retitle_clashes(songs, "Compose.")
        self.assertEqual(len(asks), 1)
        self.assertIn('share refusal', asks[0])
        self.assertEqual((songs[0]["title"], songs[0]["artist"]), ("Pressure Seal", "Glass Refusal"))
        self.assertEqual(songs[1]["title"], "Wire Kiss")

    def test_the_songwriter_is_told(self):
        self.assertIn("share no word", generate.NAME_LINE)


if __name__ == "__main__":
    unittest.main()
