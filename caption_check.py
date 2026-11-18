"""Words that pull ACE-Step toward commercial EDM, caught before a render.

ACE-Step moves toward every word in its caption and lyric tags, even after
"no" or "never", so a caption that mentions stabs or trumpets gets them. The
DJ is asked again when its text carries one; what still carries one after the
retries is flagged in the prompt log instead of rendering silently.

The same words, bare, go to ACE-Step's LM as lm_negative_prompt, the one input
that pushes away from what it names.
"""
import re

# (pattern, the word reported). Plurals and the variants the DJ reaches for.
BANNED = [
    (r"stab(?:s|by|bing|bed)?", "stab"),
    (r"melod(?:y|ies|ic|ically|ious)", "melody"),
    (r"(?:synth|saw|trance)[\s-]+leads?|leads?[\s-]+(?:synth|line|melody|melodies)", "lead synth"),
    (r"trumpets?", "trumpet"),
    (r"brass(?:y|es)?", "brass"),
    (r"horns?(?:\s+sections?)?", "horns"),
    (r"orchestr(?:a|as|al)(?:\s+hits?)?", "orchestra"),
    (r"(?<!guitar )(?<!bass )strings|string\s+(?:sections?|hits?|swells?|stabs?)", "strings"),
    (r"super-?saws?", "supersaw"),
    (r"pads?", "pad"),
    (r"pluck(?:s|y|ed|ing)?", "pluck"),
    (r"uplift(?:ing)?", "uplifting"),
    (r"euphori(?:a|c)", "euphoric"),
    (r"anthem(?:s|ic)?", "anthem"),
    (r"drops?", "drop"),
    (r"build-?ups?", "build-up"),
    (r"risers?", "riser"),
    (r"festivals?", "festival"),
    (r"trance(?:y)?", "trance"),
    (r"synth-?wave", "synthwave"),
    (r"edm", "EDM"),
    (r"big[\s-]+room", "big room"),
    (r"side-?chain(?:ed|ing)?", "sidechain"),
    (r"soar(?:s|ing)?", "soaring"),
    (r"shimmer(?:s|ing|y)?", "shimmering"),
    (r"sparkl(?:e|es|ing|y)", "sparkling"),
    (r"cinematic", "cinematic"),
    (r"bright(?:er|est|ness)?", "bright"),
    (r"swell(?:s|ing)?", "swell"),
    (r"auto-?tuned?", "autotune"),
    (r"chorus(?:es)?", "chorus"),
    # Genre and energy words that pull toward commercial club records.
    (r"disco(?:s)?", "disco"),
    (r"italo", "italo"),
    (r"electroclash", "electroclash"),
    (r"danc(?:e|es|ing|eable)|dance-?floors?", "dance"),
    (r"bangers?", "banger"),
    (r"part(?:y|ies)", "party"),
    (r"peak[\s-]+time", "peak time"),
    (r"rav(?:e|es|er|ers|ey)", "rave"),
    # Negation names what it negates, and ACE-Step plays it.
    (r"no|not|never|without|free\s+of", "negation"),
]
BANNED_RE = [(re.compile(rf"\b(?:{p})\b", re.IGNORECASE), word) for p, word in BANNED]

# Words these genres need: goth and shoegaze guitars are chorused, shoegaze
# guitars swell and shimmer.
GENRE_EXCEPTIONS = {
    "chorus": re.compile(r"\b(?:goth\w*|shoegaze|darkwave|coldwave|post-punk)\b", re.IGNORECASE),
    "shimmering": re.compile(r"\bshoegaze\b", re.IGNORECASE),
    "swell": re.compile(r"\bshoegaze\b", re.IGNORECASE),
}

# The bare words sent to ACE-Step's LM as its negative prompt.
NEGATIVE_WORDS = (
    "trumpet", "brass", "horns", "orchestra hit", "stabs", "lead melody", "supersaw", "trance",
    "EDM", "big room", "euphoric", "uplifting", "festival", "piano", "strings", "pads", "plucks", "risers",
)

TAG_RE = re.compile(r"\[([^\]]*)\]")
LYRIC_TAGS = {"instrumental", "verse"}
CHECKED_FIELDS = ("caption", "sound")


def banned_in(text: str, allowed: str = "") -> list[str]:
    """The banned words in one text, each once. A word is let through when
    `allowed` (a listener's or the station's own notes) names it, or when the
    text names a genre that needs it."""
    found = []
    for rx, word in BANNED_RE:
        if word in found or not rx.search(text or ""):
            continue
        if allowed and rx.search(allowed):
            continue
        exception = GENRE_EXCEPTIONS.get(word)
        if exception and exception.search(text or ""):
            continue
        found.append(word)
    return found


def lyric_tags(lyrics: str) -> list[str]:
    """Section tags other than [Instrumental] and [Verse]: they make ACE-Step
    plan a song with sections, builds and returns."""
    return [f"[{t.strip()}]" for t in TAG_RE.findall(str(lyrics or "")) if t.strip().lower() not in LYRIC_TAGS]


def problems(song, allowed: str = "") -> dict:
    """{field: [words]} for one song; {} when it is clean."""
    if not isinstance(song, dict):
        return {}
    found = {}
    for field in CHECKED_FIELDS:
        words = banned_in(str(song.get(field) or ""), allowed)
        if words:
            found[field] = words
    tags = " ".join(TAG_RE.findall(str(song.get("lyrics") or "")))
    words = banned_in(tags, allowed)
    if words:
        found["lyrics"] = words
    return found


def count(found: dict) -> int:
    return sum(len(words) for words in found.values())


def correction(report: list[tuple[int, dict]], songs: list) -> str:
    """The note added to the DJ's message when its last answer used banned words."""
    lines = []
    for i, found in report:
        title = str(songs[i].get("title") or "") if isinstance(songs[i], dict) else ""
        words = sorted({w for ws in found.values() for w in ws})
        lines.append(f'- Track {i + 1} "{title}" ({", ".join(found)}): {", ".join(words)}')
    return (
        "\n\nREWRITE: ACE-Step moves toward every word it reads, even after \"no\" or \"never\", "
        "and these words turn a track into commercial club music:\n" + "\n".join(lines) +
        "\nWrite those tracks again without them or any variant, describing only what is there: "
        "the drums, the bass, one or two character sounds and the room. Keep every other track as it was. "
        "Output the full JSON again."
    )


def negative_prompt(caption: str) -> str:
    """The negative words for one track, without any its caption asks for."""
    return ", ".join(w for w in NEGATIVE_WORDS
                     if not re.search(rf"\b{re.escape(w)}\b", caption or "", re.IGNORECASE))
