# Estrazione voti da recensioni YouTube di racchette da padel

Questo documento descrive passo-passo come estrarre i voti dalle recensioni di racchette da padel sul canale YouTube di Fabio Ferro ("Fabio Ferro" / @FabioFerro82). Le istruzioni sono scritte per essere eseguite da un LLM con capacita limitate, quindi ogni passo e esplicito e non lascia spazio a interpretazioni.

---

## Contesto

Il canale pubblica recensioni di racchette da padel. Nella seconda meta di ogni video, il recensore assegna voti numerici a categorie fisse. I voti sono detti ad alta voce in italiano, e sono disponibili tramite la trascrizione automatica dei sottotitoli (ASR). La trascrizione ASR contiene errori, specialmente su numeri e mezzi voti, e va interpretata con cautela.

---

## STEP 1: Ricavare il videoId dall'URL

Data una URL YouTube, estrarre il videoId:

| Formato URL | Esempio | videoId |
|---|---|---|
| `youtube.com/watch?v=XXXX` | `https://www.youtube.com/watch?v=m0Sm5uZPiH0` | `m0Sm5uZPiH0` |
| `youtu.be/XXXX` | `https://youtu.be/m0Sm5uZPiH0` | `m0Sm5uZPiH0` |

Se l'URL contiene altri parametri dopo `&`, ignorarli e prendere solo il valore di `v=`.

---

## STEP 2: Scaricare la trascrizione

Usare `youtube-transcript-api` in Python:

```bash
python -m pip install youtube-transcript-api
```

```python
from youtube_transcript_api import YouTubeTranscriptApi

video_id = "VIDEO_ID_QUI"

ytt = YouTubeTranscriptApi()

# Provare prima in italiano
try:
    transcript = ytt.fetch(video_id, languages=["it"])
except Exception:
    # Fallback: qualsiasi lingua disponibile
    transcript = ytt.fetch(video_id)
```

Ogni elemento `item` nella transcript ha:
- `item.start` → timestamp in secondi (float)
- `item.duration` → durata del segmento in secondi (float)
- `item.text` → testo del segmento

Salvare l'intera transcript. Si avra una lista di righe come:

```text
1075.08 4.84 che merita questa Evo Force Bright Star.
1077.92 3.92 Come concorrenti, ragazzi e un po'
1079.92 4.76 complicato, vi spiego il perche.
...
1196.16 5.36 voti. Sweet spot, qui le do un pieno. Lo
1199.04 6.36 sweet spot e grande ed e rassicurante.
1201.52 6.44 Uscita di palla, le do un pienissima, ma
1205.40 4.24 e molto presente da un ritmo meglio
...
1222.12 4.28 Potenza, devo dire che la racchetta mi aspettavo
1224.88 3.16 avesse meno potenza, le posso dare un 7
1226.40 3.52 piu, ma e una racchetta, secondo me, che
```

**Nota importante**: la transcript ASR contiene errori. Esempi tipici:

| Detto realmente | Trascritto come | Tipo di errore |
|---|---|---|
| sette e mezzo | `7 e me` o `7 e mez` | mezzi voti troncati |
| pieno (10) | `un pieno` | voto espresso in parole |
| pienissima (10+) | `un pienissima` | voto espresso in parole |
| otto meno | `8 meno` | voto con qualifica |
| nove e mezzo | `9 e mezzo` | corretto |
| sei e mezzo | `6 e mez` | troncamento |

---

## STEP 3: Identificare la sezione dei voti

Cercare nella transcript il punto in cui iniziano i voti. Cercare le parole chiave:

- `voti` (es: "andiamo verso i voti", "e adesso vediamo i voti")
- `voto` (es: "partiamo con il voto per...")
- `sweet spot` o `punto dolce` (primo voto tipico)

Una volta trovato il timestamp di inizio voti, estrarre dalla transcript una finestra che va dal timestamp trovato fino a circa **300 secondi dopo** (5 minuti). I voti vengono assegnati uno dopo l'altro, di solito completi entro 3-4 minuti.

Se la parola "voti" non viene trovata, cercare la prima occorrenza di una delle categorie di voto (es: "sweet spot", "punto dolce").

---

## STEP 4: Riconoscere le categorie di voto

Il recensore assegna voti a queste **categorie fisse** (non tutte potrebbero essere presenti in ogni video):

| Categoria | Parole chiave nella transcript |
|---|---|
| Sweet spot / Punto dolce | `sweet spot`, `punto dolce` |
| Uscita di palla | `uscita di palla`, `uscita palla` |
| Potenza | `potenza` |
| Feeling | `feeling`, `tattile`, `tatt` |
| Controllo | `controllo` |
| Spin | `spin` |
| Maneggevolezza | `maneggevolezza`, `maneggevole` |
| Gioco dal fondo | `gioco dal fondo`, `dal fondo`, `dal fondo e` |
| Gioco al volo / Volo | `gioco al volo`, `al volo`, `vole` |

**Importante**: l'ordine dei voti nel video e tipicamente:

1. Sweet spot / Punto dolce
2. Uscita di palla
3. Potenza
4. Feeling
5. Controllo
6. Spin
7. Maneggevolezza
8. Gioco dal fondo
9. Gioco al volo

Ma l'ordine puo variare. Sempre verificare dal contesto quale categoria si sta votando.

---

## STEP 5: Estrarre il valore numerico del voto

Per ogni categoria, il recensore esprime il voto in uno di questi modi:

### 5.1 Voto numerico diretto

| Detto | Trascrizione tipica | Valore |
|---|---|---|
| "le do un 7 e mezzo" | `7 e me` o `7 e mez` o `7.5` | **7.5** |
| "le do un 7 piu" | `7+` o `7 piu` | **"7+"** |
| "mi fermo al 6 e mezzo" | `6 e mez` o `6 e me` | **6.5** |
| "le do un 8" | `8` | **8** |
| "un sette pieno" | `sette pieno` o `7 pieno` | **7** |

### 5.2 Voto in parole

| Espressione | Significato | Valore da assegnare |
|---|---|---|
| "le do un pieno" | Voto massimo, pieno | **10** |
| "le do un pienissima" | Voto ancora piu alto | **10** |
| "un pieno" | Pieno | **10** |
| "una pienissima" | Pienissima | **10** |

Quando il recensore dice "le do un pieno" o "pienissima" per una categoria, assegnare il valore `10` e aggiungere una nota che indica che il voto era espresso in parole, non numeri.

### 5.3 Voto con qualifica

| Espressione | Significato | Valore |
|---|---|---|
| "8 meno" | Pochi sotto l'8 | **"8-"** |
| "7 piu" | Pochi sopra il 7 | **"7+"** |
| "8 e mezzo" | 8.5 | **8.5** |

### 5.4 Errore comune della trascrizione ASR

La trascrizione ASR tronca spesso i segmenti. Esempi:

- `"le do un per la maneggevolezza"` → il numero prima di "per" e stato tagliato. Cercare il segmento precedente per il numero.
- `"7 e me ci sta"` → significa "7 e mezzo ci sta" → **7.5**
- `"8 e mez"` → **8.5**
- `"7 e me per quanto riguarda lo spin"` → **7.5** per lo spin
- `"le posso dare un 7"` → **7** o **7+** se il segmento successivo dice "piu"

**Regola**: se un numero sembra troncato o incompleto, guardare il segmento successivo per completarlo. Se non e ricostruibile, non inventare: riportare il valore parziale e una confidence piu bassa.

---

## STEP 6: Costruire l'output strutturato

Per ogni video, produrre un JSON con questa struttura esatta:

```json
{
  "videoId": "m0Sm5uZPiH0",
  "url": "https://www.youtube.com/watch?v=m0Sm5uZPiH0",
  "title": "Pallap EVOFORCE BRIGHT STAR - Meglio di Power Star e Velocity Star?",
  "channel": "Fabio Ferro",
  "language": "it",
  "isAutoGenerated": true,
  "ratings": {
    "sweet_spot": 10,
    "uscita_di_palla": 10,
    "potenza": "7+",
    "feeling": 7.5,
    "controllo": 7.5,
    "spin": 7.5,
    "maneggevolezza": 9,
    "gioco_dal_fondo": 8.5,
    "gioco_al_volo": 7.5
  },
  "evidence": [
    {
      "category": "sweet_spot",
      "timestamp_seconds": 1196.16,
      "timestamp_hhmmss": "19:56",
      "original_text": "voti. Sweet spot, qui le do un pieno. Lo sweet spot e grande ed e rassicurante.",
      "note": "voto espresso in parole: 'pieno' = 10"
    },
    {
      "category": "potenza",
      "timestamp_seconds": 1222.12,
      "timestamp_hhmmss": "20:22",
      "original_text": "le posso dare un 7 piu, ma e una racchetta che gioca molto piu di uscita di palla",
      "note": ""
    },
    {
      "category": "maneggevolezza",
      "timestamp_seconds": 1295.76,
      "timestamp_hhmmss": "21:35",
      "original_text": "le do un per la maneggevolezza",
      "note": "numero troncato dalla ASR, probabilmente 9 dato il contesto molto positivo"
    }
  ],
  "confidence": 0.82,
  "confidence_details": {
    "categories_found": 9,
    "categories_expected": 9,
    "ratings_with_numeric_value": 8,
    "ratings_with_word_value": 1,
    "ratings_with_truncated_asr": 1
  },
  "extraction_date": "2026-05-04"
}
```

### Regole per il campo `confidence`

Il confidence score complessivo (da 0 a 1) va calcolato cosi:

| Fattore | Impatto |
|---|---|
| Tutte le 9 categorie trovate | +0.3 |
| Voti numerici chiari (no troncamenti) | +0.1 per ogni voto chiaro |
| Voti espressi in parole ("pieno") | +0.05 per ogni voto in parole |
| Troncamenti ASR ricostruibili dal contesto | +0.05 per ogni voto ricostruito |
| Troncamenti ASR NON ricostruibili | +0.0 |
| Trascrizione in italiano | +0.1 |
| Trascrizione in altra lingua | +0.05 |

Se confidence < 0.5, segnare il record per revisione manuale.

---

## STEP 7: Gestire i casi speciali

### 7.1 Video senza voti

Se nella transcript non si trovano le parole chiave dei voti dopo Scarerzio ripetuto, il video potrebbe non contenere voti. In questo caso, produrre:

```json
{
  "videoId": "...",
  "url": "...",
  "ratings_found": false,
  "reason": "nessuna sezione voti trovata nella transcript",
  "confidence": 0
}
```

### 7.2 Video con voti parziali

Se solo alcune categorie vengono votate, riempire solo quelle trovate e lasciare le altre come `null`:

```json
{
  "ratings": {
    "sweet_spot": 7.5,
    "uscita_di_palla": 8,
    "potenza": null,
    "feeling": null,
    "controllo": null,
    "spin": null,
    "maneggevolezza": null,
    "gioco_dal_fondo": null,
    "gioco_al_volo": null
  }
}
```

### 7.3 Voti per categoria e domanda "per chi?"

Il recensore a volte specifica per che tipo di giocatore e la racchetta. Se presente, aggiungere un campo `target_player`:

```json
{
  "target_player": "intermedio e intermedio avanzato"
}
```

### 7.4 Confronti con altre racchette

Se il recensore confronta la racchetta con altre, aggiungere un campo `competitors_mentioned`:

```json
{
  "competitors_mentioned": [
    {"name": "Babolat Counter Veron", "context": "la Bright Star e avanti per feeling, potenza e controllo"},
    {"name": "Sane Potential", "context": "stessa forma ibrida"},
    {"name": "ST5 Elite", "context": "concorrente simile per prezzo e concetto"}
  ]
}
```

---

## STEP 8: Elaborare una lista di video

Quando si ha una lista di URL (come in `review_urls.txt` o `glm-review-urls.txt`), ripetere gli step 1-7 per ciascun video. Per ogni video:

1. Estrarre il videoId
2. Scaricare la transcript Italiana (fallback: qualsiasi lingua)
3. Cercare la sezione voti
4. Estrarre i voti
5. Produrre il JSON
6. Salvare ogni JSON in un file separato o aggiungerlo a un array

### 8.1 Gestire gli errori

Se un video non ha transcript disponibili, registrare l'errore e passare al successivo:

```json
{
  "videoId": "...",
  "url": "...",
  "error": "transcript_not_available",
  "confidence": 0
}
```

Se la transcript e in una lingua diversa dall'italiano, procedere comunque ma abbassare la confidenza e segnalare la lingua trovata.

---

## STEP 9: Validazione dell'output

Dopo aver estratto i voti, verificare questi controlli:

1. **Range voti**: ogni voto numerico deve essere tra 1 e 10. Se fuori range, c'e un errore di estrazione.
2. **Categorie obbligatorie**: almeno 5 delle 9 categorie devono avere un voto non-null.
3. **Coerenza**: se `sweet_spot` riceve un voto molto basso (< 5) ma `uscita_di_palla` riceve un voto molto alto (> 9), verificare che non ci sia stata confusione tra categorie.
4. **Troncamenti ASR**: se nella evidence appare testo come "le do un per", verificare che il campo `note` spieghi il troncamento.
5. **Voti in parole**: se nella evidence appare "pieno" o "pienissima", verificare che il voto sia 10 e che `note` lo specifichi.

Se uno di questi controlli fallisce, stampare un warning e abbassare la confidence di 0.1.

---

## Riepilogo rapido

```text
Per ogni URL in glm-review-urls.txt:
  1. Estrarre videoId
  2. Scaricare transcript con youtube-transcript-api (lingua: it)
  3. Cercare sezione voti (parole chiave: "voti", "sweet spot", "punto dolce")
  4. Per ogni categoria (sweet spot, uscita di palla, potenza, feeling, controllo, spin, maneggevolezza, gioco dal fondo, gioco al volo):
     a. Trovare il punto nella transcript dove viene votata
     b. Estrarre il valore numerico o interpretare leespressione ("pieno" = 10)
     c. Gestire errori ASR (troncamenti, mezzi voti)
     d. Registrare timestamp, testo originale e note
  5. Calcolare confidence
  6. Validare (range, numero categorie, coerenza)
  7. Produrre JSON strutturato
  8. Passare al video successivo
```

---

## Limiti noti

- La trascrizione ASR tronca spesso i numeri: "7 e me" per "7 e mezzo", "le do un per" con numero mancante.
- Alcuni video non hanno sottotitoli disponibili.
- Il recensore puo usare espressioni qualitative ("pieno", "pienissima") al posto di numeri.
- L'ordine delle categorie puo variare tra un video e l'altro.
- I voti sono soggettivi e riferiti all'opinione del recensore, non dati oggettivi.
- YouTube puo cambiare il formato degli endpoint senza preavviso.

## Fallback utili

Quando la transcript non basta:

- OCR sui frame del video, utile se i voti appaiono a schermo come grafici o tabelle;
- Speech-to-text sull'audio, se legalmente e tecnicamente consentito;
- Lettura di commenti fissati, capitoli nella descrizione, link esterni;
- Revisione manuale per video ad alto valore o confidence basso.