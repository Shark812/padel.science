#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from statistics import mean
from typing import Any


RATING_FIELDS = [
    "overall_rating",
    "power",
    "control",
    "comfort",
    "spin",
    "forgiveness",
    "maneuverability",
    "low_speed",
    "rebound",
    "sweet_spot",
    "ball_output",
    "effect",
    "tolerance",
    "total",
]

COMMON_TOKENS = {
    "padel",
    "pala",
    "palas",
    "racket",
    "rackets",
    "analysis",
    "analisis",
    "review",
    "best",
    "price",
    "mejor",
    "precio",
    "puntuacion",
    "total",
}
PLAYER_TOKENS = {
    "ale",
    "galan",
    "paquito",
    "navarro",
    "juan",
    "tello",
    "agustin",
    "tapia",
    "martita",
    "ortega",
    "lebron",
    "delfi",
    "brea",
    "bea",
    "gonzalez",
    "momo",
    "gonzalez",
    "franco",
    "stupackzuk",
    "stupa",
    "yanguas",
    "mike",
    "garrido",
    "javi",
    "osoro",
    "aranzazu",
    "martin",
    "di",
    "nenno",
    "salazar",
    "gemma",
    "triay",
    "campagnolo",
    "lucas",
    "sanz",
    "coki",
    "nieto",
    "ruiz",
    "alex",
    "edu",
    "alonso",
    "claudia",
    "fernandez",
    "miguel",
    "lamperti",
    "coello",
}
COLOR_TOKENS = {
    "black",
    "blue",
    "navy",
    "night",
    "orange",
    "green",
    "grey",
    "gray",
    "red",
    "white",
    "yellow",
    "pink",
    "purple",
    "gold",
    "silver",
    "lime",
    "brown",
    "beige",
}
VARIANT_TOKENS = {
    "control",
    "carbon",
    "light",
    "team",
    "junior",
    "woman",
    "hybrid",
    "comfort",
    "soft",
    "hard",
    "cloud",
    "premier",
    "edge",
    "pro",
    "elite",
    "motion",
    "vibe",
    "attack",
    "power",
    "limited",
    "plus",
    "hrd",
    "ls",
    "lt",
    "tour",
    "master",
    "reserve",
    "legend",
    "superlight",
    "air",
    "go",
    "one",
    "x",
}
CRITICAL_VARIANT_TOKENS = {
    "control",
    "carbon",
    "light",
    "team",
    "junior",
    "woman",
    "hybrid",
    "comfort",
    "soft",
    "hard",
    "cloud",
    "edge",
    "hrd",
    "superlight",
    "motion",
    "vibe",
    "geo",
    "attack",
    "elite",
    "go",
    "ls",
    "lt",
}
SOURCE_PRIORITY = [
    "padelful",
    "pala-hack",
    "padelzoom",
    "padelreference",
    "extreme-tennis",
]
IMAGE_SOURCE_PRIORITY = [
    "padelful",
    "padelreference",
    "pala-hack",
    "padelzoom",
    "extreme-tennis",
]
SOURCE_FILES = {
    "padelreference": Path("data/padelreference-en-full/padelreference.csv"),
    "extreme-tennis": Path("data/extreme-tennis-en-full/extreme-tennis.csv"),
    "padelful": Path("data/padelful-en-full/padelful.csv"),
    "pala-hack": Path("data/pala-hack-en-full/pala-hack.csv"),
    "padelzoom": Path("data/padelzoom-es-full/padelzoom.csv"),
}
MANUAL_EQUIVALENCES_PATH = Path("data/manual-equivalences.json")


def fix_text(value: str | None) -> str:
    if value is None:
        return ""
    text = value.strip()
    if not text:
        return ""
    try:
        repaired = text.encode("latin1").decode("utf-8")
        if repaired.count("�") <= text.count("�"):
            text = repaired
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    replacements = {
        "LÃ¡grima": "Lagrima",
        "GalÃ¡n": "Galan",
    }
    for wrong, right in replacements.items():
        text = text.replace(wrong, right)
    return text


def slugify_text(value: str) -> str:
    text = fix_text(value).lower()
    text = re.sub(r"\b([1-9])\.(\d)\b", r" v\1\2 ", text)
    text = text.replace("+", " plus ")
    text = text.replace("&", " and ")
    text = text.replace("ctrl", " control ")
    text = text.replace("ctr", " control ")
    text = text.replace("pwr", " power ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text


def normalize_name(value: str) -> str:
    text = fix_text(value)
    text = re.sub(r"^Padel racket\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+Padel Racket$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+Racket$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+-\s+An[áa]lisis.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+-\s+Analysis.*$", "", text, flags=re.IGNORECASE)
    return text.strip()


def infer_brand_from_text(name: str, slug: str) -> str:
    for candidate in (name, slug):
        normalized = slugify_text(candidate)
        if not normalized:
            continue
        token = normalized.split("-", 1)[0]
        if token and token not in COMMON_TOKENS:
            return token
    return ""


def normalize_token(token: str) -> list[str]:
    if re.fullmatch(r"\d{4,}", token) and not re.fullmatch(r"20[2-3][0-9]", token):
        return []
    if re.fullmatch(r"2[2-9]", token):
        return [f"20{token}"]
    if token in {"31", "32", "33", "34", "35"}:
        return [token[0], token[1]]
    if token.isdigit():
        token = str(int(token))
    token_map = {
        "hrd": "hrd",
        "plus": "plus",
        "ltd": "limited",
        "jr": "junior",
        "w": "woman",
        "mkiii": "mk3",
        "mkii": "mk2",
        "ii": "2",
        "iii": "3",
        "iv": "4",
        "v": "5",
        "vi": "6",
        "ctr": "control",
        "ctrl": "control",
        "ctrt": "control",
        "pwr": "power",
        "tf": "tourfinal",
        "tour": "tour",
        "final": "final",
        "hyb": "hybrid",
        "premierpadel": "premier",
        "premier": "premier",
        "cloud": "cloud",
        "comfort": "comfort",
        "navy": "blue",
        "grey": "gray",
    }
    token = token_map.get(token, token)
    if token == "tourfinal":
        return ["tour", "final"]
    return [token]


def extract_year(tokens: list[str]) -> int | None:
    short_year: int | None = None
    for token in tokens:
        if re.fullmatch(r"20[2-3][0-9]", token):
            return int(token)
        if re.fullmatch(r"2[2-9]", token):
            short_year = 2000 + int(token)
    return short_year


def tokenize(*values: str) -> list[str]:
    joined = " ".join(slugify_text(value).replace("-", " ") for value in values if value)
    raw_tokens = [token for token in joined.split() if token]
    tokens: list[str] = []
    for token in raw_tokens:
        tokens.extend(normalize_token(token))
    return tokens


def token_set(tokens: list[str], drop_players: bool = False) -> set[str]:
    filtered = set()
    for token in tokens:
        if token in COMMON_TOKENS:
            continue
        if drop_players and token in PLAYER_TOKENS:
            continue
        if drop_players and token in COLOR_TOKENS:
            continue
        filtered.add(token)
    return filtered


def parse_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    text = fix_text(value).replace(",", ".").strip()
    try:
        return float(text)
    except ValueError:
        return None


def get_normalized_rating_value(record: SourceRecord, field: str) -> float | None:
    source = record.source
    raw_field = field
    if source == "extreme-tennis" and field == "overall_rating":
        raw_field = "score"

    if field == "sweet_spot":
        if source == "padelreference":
            raw_field = "tolerance"
        elif source == "extreme-tennis":
            raw_field = "forgiveness"

    if source == "padelreference" and field == "overall_rating":
        component_fields = [
            "power",
            "comfort",
            "effect",
            "control",
            "maneuverability",
            "tolerance",
        ]
        component_values = [parse_float(record.record.get(component)) for component in component_fields]
        component_values = [value for value in component_values if value is not None]
        if not component_values:
            return None
        return round(mean(component_values), 3)

    value = parse_float(record.record.get(raw_field))
    if value is None:
        return None

    if source == "extreme-tennis":
        if raw_field in {
            "score",
            "power",
            "control",
            "comfort",
            "spin",
            "forgiveness",
            "maneuverability",
            "low_speed",
        }:
            return round(value / 10.0, 3)
    return value


def parse_json_array(value: str | None) -> list[str]:
    if value in (None, ""):
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    return []


def load_manual_equivalences(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    normalized: dict[str, str] = {}
    for raw_key, raw_value in payload.items():
        key = slugify_text(str(raw_key))
        value = slugify_text(str(raw_value))
        if key and value:
            normalized[key] = value
    return normalized


def filled_score(record: dict[str, Any]) -> int:
    return sum(1 for field in RATING_FIELDS if record.get(field) not in (None, ""))


@dataclass
class SourceRecord:
    source: str
    source_url: str
    slug: str
    name: str
    brand: str
    year: int | None
    tokens: set[str]
    tokens_no_players: set[str]
    record: dict[str, Any]


@dataclass
class Cluster:
    id: int
    records: list[SourceRecord] = field(default_factory=list)
    by_source: dict[str, SourceRecord] = field(default_factory=dict)
    aliases: set[str] = field(default_factory=set)
    source_urls: dict[str, str] = field(default_factory=dict)
    brands: Counter = field(default_factory=Counter)
    years: Counter = field(default_factory=Counter)

    def add(self, source_record: SourceRecord) -> None:
        self.records.append(source_record)
        self.aliases.add(source_record.name)
        self.source_urls[source_record.source] = source_record.source_url
        if source_record.brand:
            self.brands[source_record.brand] += 1
        if source_record.year is not None:
            self.years[source_record.year] += 1

        current = self.by_source.get(source_record.source)
        if current is None or is_better_record(source_record, current):
            self.by_source[source_record.source] = source_record


def is_better_record(candidate: SourceRecord, current: SourceRecord) -> bool:
    candidate_score = filled_score(candidate.record)
    current_score = filled_score(current.record)
    if candidate_score != current_score:
        return candidate_score > current_score
    return len(candidate.name) > len(current.name)


def jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def overlap(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / min(len(left), len(right))


def record_similarity(record: SourceRecord, cluster: Cluster) -> float:
    best = 0.0
    for other in cluster.by_source.values():
        if record.brand and other.brand and record.brand != other.brand:
            continue
        if record.year is not None and other.year is not None and record.year != other.year:
            continue
        full_score = max(jaccard(record.tokens, other.tokens), overlap(record.tokens, other.tokens))
        core_score = max(
            jaccard(record.tokens_no_players, other.tokens_no_players),
            overlap(record.tokens_no_players, other.tokens_no_players),
        )
        score = max(full_score, core_score)
        left_variants = record.tokens_no_players & VARIANT_TOKENS
        right_variants = other.tokens_no_players & VARIANT_TOKENS
        shared_variants = left_variants & right_variants
        left_critical = record.tokens_no_players & CRITICAL_VARIANT_TOKENS
        right_critical = other.tokens_no_players & CRITICAL_VARIANT_TOKENS
        if left_critical != right_critical:
            if left_critical and right_critical:
                score *= 0.12
            else:
                score *= 0.45
        if left_variants != right_variants and not shared_variants:
            score *= 0.45
        elif left_variants != right_variants:
            score *= 0.85
        if ("junior" in left_variants) ^ ("junior" in right_variants):
            score *= 0.25
        if ("woman" in left_variants) ^ ("woman" in right_variants):
            score *= 0.55
        if record.slug and other.slug and record.slug == other.slug:
            score = 1.0
        best = max(best, score)
    return best


def cluster_threshold(record: SourceRecord) -> float:
    if len(record.tokens_no_players) <= 3:
        return 1.0
    if len(record.tokens_no_players) <= 5:
        return 0.9
    return 0.8


def load_source_records(source: str, path: Path) -> list[SourceRecord]:
    records: list[SourceRecord] = []
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if source == "padelreference" and row.get("is_product_page") not in {"True", "true", "1"}:
                continue

            name = normalize_name(row.get("name", ""))
            if not name:
                continue

            brand = fix_text(row.get("brand") or row.get("brand_from_spec") or "")
            slug = fix_text(row.get("slug", ""))
            source_url = fix_text(row.get("source_url", ""))
            all_tokens = tokenize(name, slug, brand)
            rec = SourceRecord(
                source=source,
                source_url=source_url,
                slug=slugify_text(slug),
                name=name,
                brand=slugify_text(brand),
                year=extract_year(all_tokens),
                tokens=token_set(all_tokens, drop_players=False),
                tokens_no_players=token_set(all_tokens, drop_players=True),
                record={key: fix_text(value) for key, value in row.items()},
            )
            records.append(rec)
    return records


def apply_manual_equivalences(
    records: list[SourceRecord],
    equivalences: dict[str, str],
) -> None:
    if not equivalences:
        return

    records_by_canonical: dict[str, list[SourceRecord]] = {}
    for record in records:
        canonical_key = slugify_text(normalize_name(record.name))
        records_by_canonical.setdefault(canonical_key, []).append(record)

    for record in records:
        current_key = slugify_text(normalize_name(record.name))
        target_key = equivalences.get(current_key)
        if not target_key:
            continue
        targets = records_by_canonical.get(target_key, [])
        if not targets:
            continue
        target = targets[0]
        record.name = target.name
        record.slug = target.slug
        record.tokens = set(target.tokens)
        record.tokens_no_players = set(target.tokens_no_players)
        record.year = target.year
        record.brand = target.brand


def build_clusters(all_records: list[SourceRecord]) -> list[Cluster]:
    clusters: list[Cluster] = []
    cluster_id = 1
    for record in all_records:
        best_cluster: Cluster | None = None
        best_score = 0.0
        for cluster in clusters:
            score = record_similarity(record, cluster)
            if score > best_score:
                best_score = score
                best_cluster = cluster
        if (
            best_cluster is not None
            and record.source not in best_cluster.by_source
            and best_score >= cluster_threshold(record)
        ):
            best_cluster.add(record)
            continue
        cluster = Cluster(id=cluster_id)
        cluster_id += 1
        cluster.add(record)
        clusters.append(cluster)
    return clusters


def merge_cluster_records(target: Cluster, source: Cluster) -> None:
    for record in source.records:
        target.add(record)


def dedupe_equivalent_clusters(clusters: list[Cluster]) -> list[Cluster]:
    merged: dict[tuple[str, str, str], Cluster] = {}
    ordered: list[Cluster] = []

    for cluster in clusters:
        canonical = choose_canonical_record(cluster)
        brand = canonical.brand or (cluster.brands.most_common(1)[0][0] if cluster.brands else "")
        year = str(canonical.year or (cluster.years.most_common(1)[0][0] if cluster.years else ""))
        canonical_key = slugify_text(normalize_name(canonical.name))
        key = (brand, year, canonical_key)

        existing = merged.get(key)

        if existing is None:
            merged[key] = cluster
            ordered.append(cluster)
            continue

        merge_cluster_records(existing, cluster)

    return ordered


def choose_canonical_record(cluster: Cluster) -> SourceRecord:
    for source in SOURCE_PRIORITY:
        if source in cluster.by_source:
            return cluster.by_source[source]
    return next(iter(cluster.by_source.values()))


def average_numeric(records: list[SourceRecord], field: str) -> float | None:
    values = [get_normalized_rating_value(record, field) for record in records]
    values = [value for value in values if value is not None]
    if not values:
        return None
    return round(mean(values), 3)


def most_common_value(records: list[SourceRecord], field: str) -> str:
    values = [fix_text(record.record.get(field, "")) for record in records]
    values = [value for value in values if value]
    if not values:
        return ""
    return Counter(values).most_common(1)[0][0]


def get_source_image_url(source_record: SourceRecord) -> str:
    image_url = fix_text(source_record.record.get("image_url", ""))
    if image_url:
        return image_url

    if source_record.source == "padelreference":
        image_urls = parse_json_array(source_record.record.get("image_urls"))
        if image_urls:
            return image_urls[0]
    return ""


def cluster_to_row(cluster: Cluster) -> dict[str, Any]:
    canonical = choose_canonical_record(cluster)
    sources = sorted(cluster.by_source.keys(), key=SOURCE_PRIORITY.index)
    source_count = len(sources)
    brand = canonical.brand or (cluster.brands.most_common(1)[0][0] if cluster.brands else "")
    if not brand:
        brand = infer_brand_from_text(canonical.name, canonical.slug)
    year = canonical.year or (cluster.years.most_common(1)[0][0] if cluster.years else "")
    all_source_records = list(cluster.by_source.values())

    image_source_recommended = next(
        (source for source in IMAGE_SOURCE_PRIORITY if source in sources),
        sources[0],
    )
    image_url = ""
    image_source_portal = ""
    for source in IMAGE_SOURCE_PRIORITY:
        source_record = cluster.by_source.get(source)
        if not source_record:
            continue
        source_image_url = get_source_image_url(source_record)
        if source_image_url:
            image_url = source_image_url
            image_source_portal = source
            break

    row: dict[str, Any] = {
        "unified_id": f"racket-{cluster.id:05d}",
        "canonical_name": canonical.name,
        "brand": brand,
        "year": year,
        "source_count": source_count,
        "reliability_score": min(5, source_count),
        "source_portals": "|".join(sources),
        "source_urls_json": json.dumps(cluster.source_urls, ensure_ascii=False),
        "aliases_json": json.dumps(sorted(cluster.aliases), ensure_ascii=False),
        "slug_canonical": canonical.slug,
        "shape": most_common_value(all_source_records, "shape")
        or most_common_value(all_source_records, "shape_es"),
        "balance": most_common_value(all_source_records, "balance"),
        "surface": most_common_value(all_source_records, "surface"),
        "level": most_common_value(all_source_records, "level"),
        "feel": most_common_value(all_source_records, "feel")
        or most_common_value(all_source_records, "feel_es"),
        "weight_raw": most_common_value(all_source_records, "weight_raw"),
        "core_material": most_common_value(all_source_records, "core_material")
        or most_common_value(all_source_records, "core"),
        "face_material": most_common_value(all_source_records, "face_material"),
        "frame_material": most_common_value(all_source_records, "frame_material"),
        "image_source_recommended": image_source_recommended,
        "image_url": image_url,
        "image_source_portal": image_source_portal,
    }

    for field in RATING_FIELDS:
        avg_value = average_numeric(all_source_records, field)
        row[f"{field}_avg"] = avg_value

    for source in SOURCE_PRIORITY:
        source_record = cluster.by_source.get(source)
        row[f"has_{source}"] = 1 if source_record else 0
        row[f"{source}_url"] = source_record.source_url if source_record else ""
        row[f"{source}_name"] = source_record.name if source_record else ""

    return row


def write_csv(records: list[dict[str, Any]], destination: Path) -> None:
    if not records:
        destination.write_text("", encoding="utf-8")
        return
    fieldnames: list[str] = []
    seen: set[str] = set()
    for record in records:
        for key in record.keys():
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)
    with destination.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)


def write_json(records: list[dict[str, Any]], destination: Path) -> None:
    destination.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def build_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    source_distribution = Counter(int(row["source_count"]) for row in rows)
    reliability_distribution = Counter(int(row["reliability_score"]) for row in rows)
    return {
        "unified_rackets": len(rows),
        "source_count_distribution": dict(sorted(source_distribution.items())),
        "reliability_distribution": dict(sorted(reliability_distribution.items())),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Merge all scraped racket sources into one unified dataset."
    )
    parser.add_argument(
        "--outdir",
        default="data/unified-rackets",
        help="Output directory for unified exports.",
    )
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    all_records: list[SourceRecord] = []
    for source in SOURCE_PRIORITY:
        path = SOURCE_FILES[source]
        all_records.extend(load_source_records(source, path))

    apply_manual_equivalences(
        all_records,
        load_manual_equivalences(Path(args.outdir).resolve().parent / "manual-equivalences.json")
        or load_manual_equivalences(MANUAL_EQUIVALENCES_PATH),
    )

    clusters = build_clusters(all_records)
    clusters = dedupe_equivalent_clusters(clusters)
    rows = [cluster_to_row(cluster) for cluster in clusters]
    rows.sort(key=lambda row: (-int(row["source_count"]), row["canonical_name"]))

    write_csv(rows, outdir / "unified-rackets.csv")
    write_json(rows, outdir / "unified-rackets.json")
    summary = build_summary(rows)
    (outdir / "unified-rackets-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
