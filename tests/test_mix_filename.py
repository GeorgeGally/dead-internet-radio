import json
import tempfile
import unittest
from pathlib import Path

import djmix

# The artists of the 20-track "deep disco psytrance" show whose mix could not be
# written on 2026-11-23: its name ran past what a file name holds.
ARTISTS = [
    "Container Nine", "Ferrous Breath", "Kalt Sequencer", "Slurred Departure",
    "Warm Air Congregation", "Cistern Report", "Dome Cartographer", "Porcelain Lung",
    "Garage Hawker", "Sine Operator", "Megaphone Deacon", "Roof Sonar",
    "Flicker Vendor", "Terse Accent", "Wasp Nest Voltage", "Glinting Watch",
    "Vault Swell", "Below Ground Unit", "Below Ground Unit", "Container Nine",
]


def show(artists, slot="deep disco psytrance "):
    root = Path(tempfile.mkdtemp())
    prompts = root / "prompts"
    prompts.mkdir()
    for n, artist in enumerate(artists, 1):
        (prompts / f"{n:02d}.prompt.json").write_text(json.dumps(
            {"track": n, "slot": slot, "payload": {"artist": artist, "title": "Song"}}))
    return djmix.ShowMeta(root)


class MixFilenameTest(unittest.TestCase):
    def test_a_short_show_keeps_every_artist(self):
        meta = show(["Grey Relay", "Vault Swell"], slot="post punk")
        self.assertEqual(meta.output_filename(), "grey-relay-vault-swell-post-punk.mp3")

    def test_a_long_show_fits_a_file_name_with_its_cues(self):
        meta = show(ARTISTS)
        name = meta.output_filename()
        cues = Path(name).with_suffix(".cues.json").name
        self.assertLessEqual(len(cues.encode()), 255)
        self.assertTrue(name.startswith("container-nine-ferrous-breath-"))
        self.assertTrue(name.endswith("-deep-disco-psytrance.mp3"))
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / name).write_bytes(b"")
            (Path(d) / cues).write_text("[]")

    def test_one_very_long_artist_is_cut(self):
        meta = show(["Glinting Watch " * 30])
        self.assertLessEqual(len(meta.output_filename()), djmix.MAX_STEM + len(".mp3"))


if __name__ == "__main__":
    unittest.main()
