from youtube_transcript_api import YouTubeTranscriptApi
import json, re

VIDEO_ID = "m0Sm5uZPiH0"
KEYWORDS = [
    "voti", "voto", "sweet spot", "punto dolce", "uscita di palla",
    "potenza", "spin", "maneggevolezza", "feeling", "controllo",
    "gioco dal fondo", "gioco al volo", "conclusioni"
]

ytt = YouTubeTranscriptApi()
transcript = ytt.fetch(VIDEO_ID, languages=["it"])

items = list(transcript)
print(f"Transcript scaricata: {len(items)} segmenti\n")

# Stampa tutta la transcript con timestamp
for item in items:
    start = item.start
    duration = item.duration
    text = item.text
    mins = int(start // 60)
    secs = int(start % 60)
    print(f"{mins:02d}:{secs:02d} {text}")

print("\n" + "="*60)
print("RICERCA SEZIONI RILEVANTI")
print("="*60 + "\n")

# Cerca segmenti che contengono parole chiave
for i, item in enumerate(items):
    text_lower = item.text.lower()
    if any(kw in text_lower for kw in KEYWORDS):
        start = item.start
        mins = int(start // 60)
        secs = int(start % 60)
        # Stampa anche i 2 segmenti prima e dopo per contesto
        context_start = max(0, i-2)
        context_end = min(len(items), i+3)
        print(f"--- Match around {mins:02d}:{secs:02d} ---")
        for j in range(context_start, context_end):
            s = items[j].start
            m = int(s // 60)
            sec = int(s % 60)
            marker = ">>> " if j == i else "    "
            print(f"{marker}{m:02d}:{sec:02d} {items[j].text}")
        print()
