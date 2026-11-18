import contextlib
import io
import json
import unittest
from unittest.mock import patch

import caption_check
import generate


def song(title, caption, lyrics="[Instrumental]", **extra):
    return {"title": title, "artist": "Act " + title, "caption": caption, "lyrics": lyrics, **extra}


class CaptionCheckTest(unittest.TestCase):
    def test_finds_club_words_and_their_variants(self):
        found = caption_check.banned_in("Stabby synth stabs, a melodic saw lead, brassy horns and an uplifting drop")
        for word in ("stab", "melody", "lead synth", "brass", "horns", "uplifting", "drop"):
            self.assertIn(word, found)
        self.assertEqual(caption_check.banned_in(
            "raw, hypnotic, dry, EBM, stiff sixteenth-note analog bass sequence, rounded kick, "
            "a voice reads coordinates. Taped in an empty building with lead-lined walls."), [])

    def test_guitar_strings_and_genre_chorus_pass(self):
        self.assertEqual(caption_check.banned_in("scraped guitar strings, dry snare"), [])
        self.assertIn("strings", caption_check.banned_in("a wall of strings"))
        self.assertIn("chorus", caption_check.banned_in("techno with a big chorus"))
        self.assertEqual(caption_check.banned_in("goth, a chorus pedal on a thin guitar"), [])
        self.assertEqual(caption_check.banned_in("shoegaze, chorus-drenched guitar"), [])

    def test_a_listeners_note_can_ask_for_a_word(self):
        self.assertEqual(caption_check.banned_in("dark disco groove, cowbell", "make it disco"), [])
        self.assertIn("disco", caption_check.banned_in("dark disco groove, cowbell"))

    def test_problems_cover_caption_sound_and_lyric_tags(self):
        found = caption_check.problems(song("A", "dry kick", "[Drop]\nSTATUS", sound="trumpet line"))
        self.assertEqual(found, {"sound": ["trumpet"], "lyrics": ["drop"]})
        self.assertEqual(caption_check.problems(song("B", "dry kick, deep bass")), {})

    def test_negative_prompt_leaves_out_what_the_caption_asks_for(self):
        full = caption_check.negative_prompt("dry kick, deep bass")
        self.assertIn("trumpet", full)
        self.assertNotIn(" no ", f" {full} ")
        self.assertNotIn("piano", caption_check.negative_prompt("a detuned piano in the corner"))


class LyricsTest(unittest.TestCase):
    def test_one_verse_drops_song_sections(self):
        self.assertEqual(generate.one_verse("[Intro]\n[Instrumental]\n[Verse]\nSTATUS RED\n[Bridge]\nREBOOT\n[Outro]\n[Instrumental]"),
                         "[Verse]\nSTATUS RED\nREBOOT")
        self.assertEqual(generate.one_verse("[Intro]\n[Instrumental]\n[Outro]\n[Instrumental]"), "[Instrumental]")
        self.assertEqual(generate.one_verse("SYSTEM: ONLINE\nready"), "SYSTEM: ONLINE\nready")

    def test_fallback_is_one_verse(self):
        lyrics = generate.fallback_verse("[Verse]\nREQUEST RECEIVED", "Sliced", "Gold")
        self.assertEqual(lyrics, "[Verse]\nREQUEST RECEIVED\nSliced\nGold")

    def test_instrumental_caption_keeps_one_verse_lyrics(self):
        out = generate.ensure_voice(song("A", "dry kick, deep bass", "[Intro]\n[Instrumental]\n[Outro]\n[Instrumental]"))
        self.assertEqual(out["lyrics"], "[Instrumental]")


class ComposeCheckedTest(unittest.TestCase):
    def run_compose(self, replies, parse=generate.extract_json_array):
        with patch.object(generate, "call_llm", side_effect=replies) as llm, \
             contextlib.redirect_stdout(io.StringIO()):
            return generate.compose_checked("brief", parse), llm

    def test_retries_only_the_dirty_track(self):
        first = [song("Clean", "dry kick, deep bass"), song("Dirty", "dry kick, synth stabs")]
        second = [song("Changed", "dry kick, wide bass"), song("Fixed", "dry kick, metal clanks")]
        songs, llm = self.run_compose([json.dumps(first), json.dumps(second)])
        self.assertEqual([s["title"] for s in songs], ["Clean", "Fixed"])
        self.assertEqual(llm.call_count, 2)
        self.assertIn("stab", llm.call_args.args[1])
        self.assertFalse(any("caption_flags" in s for s in songs))

    def test_flags_after_two_retries(self):
        dirty = json.dumps([song("Dirty", "trumpet over the kick")])
        songs, llm = self.run_compose([dirty, dirty, dirty])
        self.assertEqual(llm.call_count, 1 + generate.CAPTION_RETRIES)
        self.assertEqual(songs[0]["caption_flags"], ["trumpet"])

    def test_single_track_mode(self):
        out, llm = self.run_compose([json.dumps(song("A", "dry kick, deep bass"))], parse=generate.extract_json)
        self.assertEqual(out["title"], "A")
        self.assertEqual(llm.call_count, 1)


class AceStepBodyTest(unittest.TestCase):
    def test_body_sends_negative_and_keeps_caption_rewrite_off(self):
        class Reply(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        with patch.object(generate.urllib.request, "urlopen",
                          return_value=Reply(b'{"data": {"task_id": "t"}}')) as urlopen:
            generate.call_ace_step({"caption": "raw, dry, EBM, 124 BPM, E minor, rounded kick", "bpm": 124, "keyscale": "E minor"})
        body = json.loads(urlopen.call_args.args[0].data)
        self.assertFalse(body["use_cot_caption"])
        self.assertIn("trumpet", body["lm_negative_prompt"])
        self.assertNotIn("melody", body["prompt"])
        self.assertNotIn("124 BPM", body["prompt"])


if __name__ == "__main__":
    unittest.main()
