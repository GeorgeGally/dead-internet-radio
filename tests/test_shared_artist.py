import unittest
from unittest.mock import patch

import generate


def song(artist, caption, sound=None):
    s = {"title": f"{artist} song", "artist": artist, "caption": caption}
    if sound:
        s["sound"] = sound
    return s


class SharedArtistTest(unittest.TestCase):
    def test_shared_tracks_are_never_back_to_back(self):
        for count, size in ((3, 0), (4, 2), (5, 2), (8, 3), (10, 3)):
            for _ in range(50):
                picks = generate.shared_artist_tracks(count)
                self.assertEqual(len(picks), size)
                self.assertTrue(all(1 <= n <= count for n in picks))
                self.assertTrue(all(b - a > 1 for a, b in zip(picks, picks[1:])))

    def test_one_act_gets_one_name_sound_and_seed(self):
        sound = "A soft 808 kick, a distorted sixteenth bass, a cold baritone through a cheap mic."
        songs = [
            song("Grey Relay", "EBM, 122 BPM in A minor.", sound),
            song("Other", "EBM, 124 BPM in D minor."),
            song("grey relay.", "EBM, 120 BPM in C minor."),
        ]
        with patch.object(generate.random, "randint", return_value=77):
            out = generate.share_artists(songs, [1, 3])
        self.assertEqual(out[2]["artist"], "Grey Relay")
        self.assertTrue(out[0]["caption"].endswith(sound))
        self.assertTrue(out[2]["caption"].endswith(sound))
        self.assertEqual(out[0]["caption"].count(sound), 1)
        self.assertNotIn(sound, out[1]["caption"])
        self.assertEqual(out[0]["seed"], 77)
        self.assertEqual(out[2]["seed"], 77)
        self.assertNotIn("seed", out[1])
        self.assertFalse(any("sound" in s for s in out))

    def test_every_caption_gets_register_and_mix_lines(self):
        caption = generate.station_caption("EBM, 122 BPM in A minor.")
        self.assertIn(generate.REGISTER_LINE, caption)
        self.assertIn(generate.MIX_LINE, caption)
        self.assertEqual(generate.station_caption(caption), caption)


if __name__ == "__main__":
    unittest.main()
