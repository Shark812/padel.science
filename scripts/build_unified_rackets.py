#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
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
GENERIC_MODEL_TOKENS = {
    "pro",
    "elite",
    "lite",
    "light",
    "soft",
    "hard",
    "team",
    "woman",
    "junior",
    "comfort",
    "attack",
    "control",
    "power",
    "motion",
    "vibe",
    "plus",
    "one",
    "x",
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
    "paula",
    "josemaria",
    "victoria",
    "iglesias",
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
    "revolution",
    "smash",
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
    "premier",
    "tour",
    "final",
    "edge",
    "hrd",
    "revolution",
    "smash",
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
    "racketguide",
    "extreme-tennis",
]
IMAGE_SOURCE_PRIORITY = [
    "padelful",
    "racketguide",
    "padelreference",
    "pala-hack",
    "padelzoom",
    "extreme-tennis",
]
AUTO_MATCH_THRESHOLD = 0.8
REVIEW_MATCH_CONFIDENCE_THRESHOLD = 0.9
MISSING_MATCH_CANDIDATE_MIN = 0.55
SOURCE_FILES = {
    "padelreference": Path("data/padelreference-en-full/padelreference.csv"),
    "extreme-tennis": Path("data/extreme-tennis-en-full/extreme-tennis.csv"),
    "padelful": Path("data/padelful-en-full/padelful.csv"),
    "pala-hack": Path("data/pala-hack-en-full/pala-hack.csv"),
    "padelzoom": Path("data/padelzoom-es-full/padelzoom.csv"),
    "racketguide": Path("data/racketguide-it-en-full/racketguide.csv"),
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
    text = fix_text(value)
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
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


def is_year_token(token: str) -> bool:
    return bool(re.fullmatch(r"20[2-3][0-9]", token))


def is_version_token(token: str) -> bool:
    return token in {"0", "1", "2", "3", "4", "5", "6", "v30", "v31", "v32", "v33", "v34", "v35"}


def is_minor_series_token(token: str) -> bool:
    return token in {"0", "1", "2", "3", "4", "5", "6", "v30", "v31", "v32", "v33", "v34", "v35"}


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


def variant_tokens(tokens: set[str]) -> set[str]:
    return tokens & VARIANT_TOKENS


def critical_variant_tokens(tokens: set[str]) -> set[str]:
    return tokens & CRITICAL_VARIANT_TOKENS


def identity_tokens(record: SourceRecord) -> set[str]:
    tokens: set[str] = set()
    for token in record.tokens_no_players:
        if token in COMMON_TOKENS:
            continue
        if token in VARIANT_TOKENS:
            continue
        if token in GENERIC_MODEL_TOKENS:
            continue
        if token == record.brand:
            continue
        if is_year_token(token):
            continue
        if is_version_token(token):
            continue
        tokens.add(token)
    return tokens


def comparable_tokens(tokens: set[str]) -> set[str]:
    filtered: set[str] = set()
    for token in tokens:
        if is_version_token(token):
            continue
        filtered.add(token)
    return filtered


def merge_key_tokens(record: SourceRecord) -> tuple[str, ...]:
    tokens: list[str] = []
    for token in sorted(record.tokens_no_players):
        if token in COMMON_TOKENS:
            continue
        if token in COLOR_TOKENS:
            continue
        if token == record.brand:
            continue
        if is_minor_series_token(token) and record.year is not None:
            continue
        tokens.append(token)
    return tuple(tokens)


def aggressive_merge_key(cluster: Cluster) -> tuple[str, str, tuple[str, ...]]:
    canonical = choose_canonical_record(cluster)
    brand = canonical.brand or (cluster.brands.most_common(1)[0][0] if cluster.brands else "")
    year = str(canonical.year or (cluster.years.most_common(1)[0][0] if cluster.years else ""))
    return (brand, year, merge_key_tokens(canonical))


def signature_blind_name_key(name: str, brand: str, year: int | None) -> tuple[str, ...]:
    tokens: list[str] = []
    for token in tokenize(name, brand):
        if token in COMMON_TOKENS:
            continue
        if token in PLAYER_TOKENS:
            continue
        if token in COLOR_TOKENS:
            continue
        if token == brand:
            continue
        if year is not None and is_minor_series_token(token):
            continue
        tokens.append(token)
    return tuple(sorted(set(tokens)))


def jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def overlap(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / min(len(left), len(right))


def pair_similarity_details(left: SourceRecord, right: SourceRecord) -> dict[str, Any]:
    if left.brand and right.brand and left.brand != right.brand:
        return {
            "score": 0.0,
            "reason": "brand_mismatch",
            "score_before_penalties": 0.0,
            "shared_tokens": [],
            "left_only_tokens": sorted(left.tokens_no_players),
            "right_only_tokens": sorted(right.tokens_no_players),
            "left_variants": sorted(variant_tokens(left.tokens_no_players)),
            "right_variants": sorted(variant_tokens(right.tokens_no_players)),
            "left_critical": sorted(critical_variant_tokens(left.tokens_no_players)),
            "right_critical": sorted(critical_variant_tokens(right.tokens_no_players)),
            "penalties": ["brand_mismatch"],
        }
    if left.year is not None and right.year is not None and left.year != right.year:
        return {
            "score": 0.0,
            "reason": "year_mismatch",
            "score_before_penalties": 0.0,
            "shared_tokens": [],
            "left_only_tokens": sorted(left.tokens_no_players),
            "right_only_tokens": sorted(right.tokens_no_players),
            "left_variants": sorted(variant_tokens(left.tokens_no_players)),
            "right_variants": sorted(variant_tokens(right.tokens_no_players)),
            "left_critical": sorted(critical_variant_tokens(left.tokens_no_players)),
            "right_critical": sorted(critical_variant_tokens(right.tokens_no_players)),
            "penalties": ["year_mismatch"],
        }

    left_full = comparable_tokens(left.tokens)
    right_full = comparable_tokens(right.tokens)
    left_core = comparable_tokens(left.tokens_no_players)
    right_core = comparable_tokens(right.tokens_no_players)

    full_score = max(jaccard(left_full, right_full), overlap(left_full, right_full))
    core_score = max(
        jaccard(left_core, right_core),
        overlap(left_core, right_core),
    )
    score = max(full_score, core_score)
    score_before_penalties = score

    left_variants = variant_tokens(left.tokens_no_players)
    right_variants = variant_tokens(right.tokens_no_players)
    shared_variants = left_variants & right_variants
    left_critical = critical_variant_tokens(left.tokens_no_players)
    right_critical = critical_variant_tokens(right.tokens_no_players)
    left_identity = identity_tokens(left)
    right_identity = identity_tokens(right)
    shared_identity = left_identity & right_identity
    penalties: list[str] = []

    if left_identity and right_identity and not shared_identity:
        score *= 0.1
        penalties.append("identity_token_mismatch")
    elif left_identity and right_identity and len(shared_identity) == 1:
        if max(len(left_identity), len(right_identity)) >= 3:
            score *= 0.65
            penalties.append("weak_identity_overlap")

    if left_critical != right_critical:
        if left_critical and right_critical:
            score *= 0.12
            penalties.append("critical_variant_conflict")
        else:
            score *= 0.45
            penalties.append("critical_variant_missing")
    if left_variants != right_variants and not shared_variants:
        score *= 0.45
        penalties.append("variant_conflict")
    elif left_variants != right_variants:
        score *= 0.85
        penalties.append("variant_partial_mismatch")
    if ("junior" in left_variants) ^ ("junior" in right_variants):
        score *= 0.25
        penalties.append("junior_mismatch")
    if ("woman" in left_variants) ^ ("woman" in right_variants):
        score *= 0.55
        penalties.append("woman_mismatch")
    if left.slug and right.slug and left.slug == right.slug:
        score = 1.0

    return {
        "score": round(score, 3),
        "score_before_penalties": round(score_before_penalties, 3),
        "shared_tokens": sorted(left.tokens_no_players & right.tokens_no_players),
        "left_only_tokens": sorted(left.tokens_no_players - right.tokens_no_players),
        "right_only_tokens": sorted(right.tokens_no_players - left.tokens_no_players),
        "left_variants": sorted(left_variants),
        "right_variants": sorted(right_variants),
        "left_critical": sorted(left_critical),
        "right_critical": sorted(right_critical),
        "left_identity": sorted(left_identity),
        "right_identity": sorted(right_identity),
        "shared_identity": sorted(shared_identity),
        "penalties": penalties,
    }


def record_similarity(record: SourceRecord, cluster: Cluster) -> float:
    best = 0.0
    for other in cluster.by_source.values():
        score = float(pair_similarity_details(record, other)["score"])
        best = max(best, score)
    return best


def cluster_threshold(record: SourceRecord) -> float:
    if len(record.tokens_no_players) <= 3:
        return 1.0
    if len(record.tokens_no_players) <= 5:
        return 0.9
    return AUTO_MATCH_THRESHOLD


def load_source_records(source: str, path: Path) -> list[SourceRecord]:
    records: list[SourceRecord] = []
    if not path.exists():
        return records
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

    merged_aggressive: dict[tuple[str, str, tuple[str, ...]], Cluster] = {}
    ordered_aggressive: list[Cluster] = []

    for cluster in ordered:
        key = aggressive_merge_key(cluster)
        existing = merged_aggressive.get(key)

        if existing is None:
            merged_aggressive[key] = cluster
            ordered_aggressive.append(cluster)
            continue

        existing_canonical = choose_canonical_record(existing)
        cluster_canonical = choose_canonical_record(cluster)
        pair = pair_similarity_details(existing_canonical, cluster_canonical)
        if "critical_variant_conflict" in pair["penalties"]:
            ordered_aggressive.append(cluster)
            continue

        merge_cluster_records(existing, cluster)

    merged_signature_blind: dict[tuple[str, str, tuple[str, ...]], Cluster] = {}
    ordered_signature_blind: list[Cluster] = []

    for cluster in ordered_aggressive:
        canonical = choose_canonical_record(cluster)
        brand = canonical.brand or (cluster.brands.most_common(1)[0][0] if cluster.brands else "")
        year_value = canonical.year or (cluster.years.most_common(1)[0][0] if cluster.years else None)
        year = str(year_value or "")
        key = (brand, year, signature_blind_name_key(canonical.name, brand, year_value))
        existing = merged_signature_blind.get(key)

        if existing is None:
            merged_signature_blind[key] = cluster
            ordered_signature_blind.append(cluster)
            continue

        existing_canonical = choose_canonical_record(existing)
        pair = pair_similarity_details(existing_canonical, canonical)
        if any(
            penalty in pair["penalties"]
            for penalty in {"critical_variant_conflict", "variant_conflict", "identity_token_mismatch"}
        ):
            ordered_signature_blind.append(cluster)
            continue

        merge_cluster_records(existing, cluster)

    return ordered_signature_blind


def choose_canonical_record(cluster: Cluster) -> SourceRecord:
    for source in SOURCE_PRIORITY:
        if source in cluster.by_source:
            return cluster.by_source[source]
    return next(iter(cluster.by_source.values()))


def cluster_pair_details(cluster: Cluster) -> list[dict[str, Any]]:
    records = list(cluster.by_source.values())
    details: list[dict[str, Any]] = []
    for idx, left in enumerate(records):
        for right in records[idx + 1 :]:
            pair = pair_similarity_details(left, right)
            pair.update(
                {
                    "left_source": left.source,
                    "left_name": left.name,
                    "right_source": right.source,
                    "right_name": right.name,
                }
            )
            details.append(pair)
    return details


def cluster_match_confidence(cluster: Cluster) -> float:
    details = cluster_pair_details(cluster)
    if not details:
        return 1.0
    return round(min(float(detail["score"]) for detail in details), 3)


def cluster_review_reasons(cluster: Cluster) -> list[str]:
    reasons: list[str] = []
    if len(cluster.by_source) == 1:
        return reasons

    confidence = cluster_match_confidence(cluster)
    if confidence < REVIEW_MATCH_CONFIDENCE_THRESHOLD:
        reasons.append("low_match_confidence")

    pair_details = cluster_pair_details(cluster)
    if any("critical_variant_conflict" in detail["penalties"] for detail in pair_details):
        reasons.append("critical_variant_conflict")
    if any("variant_conflict" in detail["penalties"] for detail in pair_details):
        reasons.append("variant_conflict")
    return reasons


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


def build_missing_match_candidates(clusters: list[Cluster]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for cluster in clusters:
        if len(cluster.by_source) != 1:
            continue
        singleton = next(iter(cluster.by_source.values()))
        best_cluster: Cluster | None = None
        best_detail: dict[str, Any] | None = None
        best_target: SourceRecord | None = None

        for other_cluster in clusters:
            if other_cluster is cluster:
                continue
            for other_record in other_cluster.by_source.values():
                detail = pair_similarity_details(singleton, other_record)
                score = float(detail["score"])
                if score < MISSING_MATCH_CANDIDATE_MIN or score >= AUTO_MATCH_THRESHOLD:
                    continue
                if best_detail is None or score > float(best_detail["score"]):
                    best_cluster = other_cluster
                    best_detail = detail
                    best_target = other_record

        if best_cluster is None or best_detail is None or best_target is None:
            continue

        canonical = choose_canonical_record(best_cluster)
        candidates.append(
            {
                "review_type": "possible_missing_match",
                "source_portal": singleton.source,
                "source_name": singleton.name,
                "source_url": singleton.source_url,
                "source_brand": singleton.brand,
                "source_year": singleton.year or "",
                "candidate_canonical_name": canonical.name,
                "candidate_unified_id": f"racket-{best_cluster.id:05d}",
                "candidate_source_portal": best_target.source,
                "candidate_source_name": best_target.name,
                "candidate_source_url": best_target.source_url,
                "candidate_brand": best_target.brand,
                "candidate_year": best_target.year or "",
                "match_confidence": round(float(best_detail["score"]), 3),
                "score_before_penalties": best_detail["score_before_penalties"],
                "penalties_json": json.dumps(best_detail["penalties"], ensure_ascii=False),
                "shared_tokens_json": json.dumps(best_detail["shared_tokens"], ensure_ascii=False),
                "left_only_tokens_json": json.dumps(best_detail["left_only_tokens"], ensure_ascii=False),
                "right_only_tokens_json": json.dumps(best_detail["right_only_tokens"], ensure_ascii=False),
            }
        )

    candidates.sort(key=lambda row: (-float(row["match_confidence"]), row["source_name"]))
    return candidates


def source_name_columns(cluster: Cluster) -> dict[str, Any]:
    row: dict[str, Any] = {}
    for source in SOURCE_PRIORITY:
        source_record = cluster.by_source.get(source)
        safe_source = source.replace("-", "_")
        row[f"{safe_source}_name"] = source_record.name if source_record else ""
        row[f"{safe_source}_url"] = source_record.source_url if source_record else ""
    return row


def build_review_rows(clusters: list[Cluster]) -> list[dict[str, Any]]:
    review_rows: list[dict[str, Any]] = []
    for cluster in clusters:
        reasons = cluster_review_reasons(cluster)
        if not reasons:
            continue
        canonical = choose_canonical_record(cluster)
        pair_details = cluster_pair_details(cluster)
        row = {
            "unified_id": f"racket-{cluster.id:05d}",
            "canonical_name": canonical.name,
            "brand": canonical.brand or (cluster.brands.most_common(1)[0][0] if cluster.brands else ""),
            "year": canonical.year or (cluster.years.most_common(1)[0][0] if cluster.years else ""),
            "source_count": len(cluster.by_source),
            "source_portals": "|".join(sorted(cluster.by_source.keys(), key=SOURCE_PRIORITY.index)),
            "match_confidence": cluster_match_confidence(cluster),
            "review_reasons_json": json.dumps(reasons, ensure_ascii=False),
            "aliases_json": json.dumps(sorted(cluster.aliases), ensure_ascii=False),
            "pair_details_json": json.dumps(pair_details, ensure_ascii=False),
        }
        row.update(source_name_columns(cluster))
        review_rows.append(row)
    review_rows.sort(key=lambda row: (float(row["match_confidence"]), -int(row["source_count"]), row["canonical_name"]))
    return review_rows


def build_review_grid_rows(clusters: list[Cluster]) -> list[dict[str, Any]]:
    grid_rows: list[dict[str, Any]] = []
    for cluster in clusters:
        reasons = cluster_review_reasons(cluster)
        if not reasons:
            continue
        canonical = choose_canonical_record(cluster)
        row = {
            "unified_id": f"racket-{cluster.id:05d}",
            "canonical_name": canonical.name,
            "brand": canonical.brand or (cluster.brands.most_common(1)[0][0] if cluster.brands else ""),
            "year": canonical.year or (cluster.years.most_common(1)[0][0] if cluster.years else ""),
            "source_count": len(cluster.by_source),
            "match_confidence": cluster_match_confidence(cluster),
            "review_reasons": " | ".join(reasons),
        }
        row.update(source_name_columns(cluster))
        grid_rows.append(row)
    grid_rows.sort(key=lambda row: (float(row["match_confidence"]), -int(row["source_count"]), row["canonical_name"]))
    return grid_rows


def cluster_to_row(cluster: Cluster) -> dict[str, Any]:
    canonical = choose_canonical_record(cluster)
    sources = sorted(cluster.by_source.keys(), key=SOURCE_PRIORITY.index)
    source_count = len(sources)
    brand = canonical.brand or (cluster.brands.most_common(1)[0][0] if cluster.brands else "")
    if not brand:
        brand = infer_brand_from_text(canonical.name, canonical.slug)
    year = canonical.year or (cluster.years.most_common(1)[0][0] if cluster.years else "")
    all_source_records = list(cluster.by_source.values())
    match_confidence = cluster_match_confidence(cluster)
    review_reasons = cluster_review_reasons(cluster)

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
        "match_confidence": match_confidence,
        "needs_review": 1 if review_reasons else 0,
        "review_reasons_json": json.dumps(review_reasons, ensure_ascii=False),
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
    needs_review_count = sum(1 for row in rows if str(row.get("needs_review", "")) == "1")
    return {
        "unified_rackets": len(rows),
        "source_count_distribution": dict(sorted(source_distribution.items())),
        "reliability_distribution": dict(sorted(reliability_distribution.items())),
        "needs_review": needs_review_count,
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
    review_rows = build_review_rows(clusters)
    review_grid_rows = build_review_grid_rows(clusters)
    missing_match_rows = build_missing_match_candidates(clusters)

    write_csv(rows, outdir / "unified-rackets.csv")
    write_json(rows, outdir / "unified-rackets.json")
    write_csv(review_rows, outdir / "match-review.csv")
    write_json(review_rows, outdir / "match-review.json")
    write_csv(review_grid_rows, outdir / "match-review-grid.csv")
    write_json(review_grid_rows, outdir / "match-review-grid.json")
    write_csv(missing_match_rows, outdir / "possible-missing-matches.csv")
    write_json(missing_match_rows, outdir / "possible-missing-matches.json")
    summary = build_summary(rows)
    (outdir / "unified-rackets-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
