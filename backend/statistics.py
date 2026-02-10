"""Statistical computation for brand research results.

Computes frequency metrics, rank statistics, and confidence intervals
from structured AI responses across multiple iterations.
"""

import math
import logging
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


# ---- Confidence Intervals ----

def wilson_confidence_interval(successes: int, total: int, z: float = 1.96) -> Tuple[float, float]:
    """Wilson score interval for proportions — better than normal approx for small n and extreme p.

    Args:
        successes: Number of successes (e.g., times brand was mentioned)
        total: Total number of trials (e.g., total iterations)
        z: Z-score for confidence level (1.96 = 95% CI)

    Returns:
        (lower, upper) bounds of the confidence interval
    """
    if total == 0:
        return (0.0, 0.0)

    p = successes / total
    denominator = 1 + z**2 / total
    centre = p + z**2 / (2 * total)
    spread = z * math.sqrt((p * (1 - p) + z**2 / (4 * total)) / total)

    lower = (centre - spread) / denominator
    upper = (centre + spread) / denominator
    return (max(0.0, lower), min(1.0, upper))


def mean_confidence_interval(values: List[float], z: float = 1.96) -> Tuple[float, float, float]:
    """Confidence interval for a mean using t-distribution approximation.

    Args:
        values: List of observed values
        z: Z-score for confidence level

    Returns:
        (mean, ci_low, ci_high)
    """
    if not values:
        return (0.0, 0.0, 0.0)

    n = len(values)
    mean = sum(values) / n

    if n == 1:
        return (mean, mean, mean)

    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    std_error = math.sqrt(variance / n)

    ci_low = mean - z * std_error
    ci_high = mean + z * std_error

    return (mean, ci_low, ci_high)


# ---- Sentiment mapping ----

SENTIMENT_SCORES = {
    "positive": 1.0,
    "neutral": 0.0,
    "negative": -1.0,
}


def sentiment_to_score(sentiment: str) -> float:
    """Convert sentiment string to numeric score."""
    return SENTIMENT_SCORES.get(sentiment.lower().strip(), 0.0)


# ---- Core statistics computation ----

def compute_brand_statistics(
    responses: List[Dict],
    brands: List[str],
    total_iterations: int,
    personas: Optional[List[Dict]] = None,
) -> Dict[str, Dict]:
    """Compute frequency, rank, and confidence metrics from structured responses.

    Args:
        responses: List of response dicts, each containing 'structured_data', 'response_type',
                   'iteration', 'persona_id', 'model_name'
        brands: List of tracked brand names
        total_iterations: Total iterations per question (for CI calculation)
        personas: Optional persona dicts for affinity calculation

    Returns:
        Dict mapping brand name -> statistical metrics
    """
    # Normalize brand names for case-insensitive matching
    brand_lower_map = {b.lower(): b for b in brands}
    brand_stats = {b: _empty_brand_stats() for b in brands}

    for resp in responses:
        structured = resp.get("structured_data")
        if not structured:
            continue

        response_type = resp.get("response_type", "recall")
        persona_id = resp.get("persona_id", "")

        if response_type in ("recall", "preference"):
            # Both types have a list of brands with ranks
            items = structured.get("recommendations", []) or structured.get("rankings", [])
            _process_ranked_items(items, brand_stats, brand_lower_map, persona_id)

        elif response_type == "forced_choice":
            chosen = structured.get("chosen_brand", "")
            confidence = structured.get("confidence", 0.5)
            chosen_lower = chosen.lower().strip()
            if chosen_lower in brand_lower_map:
                canonical = brand_lower_map[chosen_lower]
                brand_stats[canonical]["mention_count"] += 1
                brand_stats[canonical]["recommendation_count"] += 1
                brand_stats[canonical]["first_mention_count"] += 1
                brand_stats[canonical]["ranks"].append(1)
                brand_stats[canonical]["strength_scores"].append(5)  # Forced choice = strongest
                brand_stats[canonical]["sentiments"].append(confidence)  # Use confidence as proxy
                if persona_id:
                    brand_stats[canonical]["persona_mentions"].setdefault(persona_id, 0)
                    brand_stats[canonical]["persona_mentions"][persona_id] += 1

    # Compute final metrics with CIs
    total_all_mentions = sum(s["mention_count"] for s in brand_stats.values())
    results = {}

    for brand, stats in brand_stats.items():
        n = total_iterations if total_iterations > 0 else 1

        # Mention frequency + CI
        mf = stats["mention_count"] / n if n > 0 else 0.0
        mf_ci = wilson_confidence_interval(stats["mention_count"], n)

        # Top-3 rate + CI
        top3_count = sum(1 for r in stats["ranks"] if r <= 3)
        top3_rate = top3_count / n if n > 0 else 0.0
        top3_ci = wilson_confidence_interval(top3_count, n)

        # First mention rate + CI
        fm_rate = stats["first_mention_count"] / n if n > 0 else 0.0
        fm_ci = wilson_confidence_interval(stats["first_mention_count"], n)

        # Recommendation rate + CI
        rec_rate = stats["recommendation_count"] / n if n > 0 else 0.0

        # Average rank + CI (only when mentioned)
        avg_rank, rank_ci_low, rank_ci_high = mean_confidence_interval(stats["ranks"])

        # Average sentiment + CI
        avg_sent, sent_ci_low, sent_ci_high = mean_confidence_interval(stats["sentiments"])

        # Recommendation strength (position-based, 0-5 scale)
        # For iterations where brand was NOT mentioned, score is 0
        strength_all = stats["strength_scores"] + [RANK_STRENGTH_ABSENT] * (n - stats["mention_count"])
        avg_strength, strength_ci_low, strength_ci_high = mean_confidence_interval(strength_all)

        # Share of voice
        sov = stats["mention_count"] / total_all_mentions if total_all_mentions > 0 else 0.0

        # Persona affinity: mentions by persona / total persona iterations
        persona_affinity = {}
        if personas:
            for p in personas:
                pid = p.get("id", "")
                p_mentions = stats["persona_mentions"].get(pid, 0)
                persona_affinity[pid] = p_mentions / n if n > 0 else 0.0

        results[brand] = {
            "brand": brand,
            "mention_frequency": round(mf, 4),
            "mention_frequency_ci_low": round(mf_ci[0], 4),
            "mention_frequency_ci_high": round(mf_ci[1], 4),
            "avg_rank": round(avg_rank, 2),
            "avg_rank_ci_low": round(rank_ci_low, 2),
            "avg_rank_ci_high": round(rank_ci_high, 2),
            "top3_rate": round(top3_rate, 4),
            "top3_rate_ci_low": round(top3_ci[0], 4),
            "top3_rate_ci_high": round(top3_ci[1], 4),
            "first_mention_rate": round(fm_rate, 4),
            "recommendation_rate": round(rec_rate, 4),
            "avg_sentiment_score": round(avg_sent, 4),
            "sentiment_ci_low": round(sent_ci_low, 4),
            "sentiment_ci_high": round(sent_ci_high, 4),
            "recommendation_strength": round(avg_strength, 2),
            "recommendation_strength_ci_low": round(strength_ci_low, 2),
            "recommendation_strength_ci_high": round(strength_ci_high, 2),
            "total_iterations": n,
            "total_mentions": stats["mention_count"],
            "share_of_voice": round(sov, 4),
            "recommendation_count": stats["recommendation_count"],
            "first_mention_count": stats["first_mention_count"],
            "persona_affinity": persona_affinity,
        }

    return results


RANK_STRENGTH_SCORES = {1: 5, 2: 4, 3: 3}
RANK_STRENGTH_MENTIONED = 2  # mentioned but outside top 3
RANK_STRENGTH_ABSENT = 0     # not mentioned at all


def rank_to_strength(rank: int) -> int:
    """Convert a rank position to a recommendation strength score (0-5)."""
    return RANK_STRENGTH_SCORES.get(rank, RANK_STRENGTH_MENTIONED)


def _empty_brand_stats() -> Dict:
    return {
        "mention_count": 0,
        "recommendation_count": 0,
        "first_mention_count": 0,
        "ranks": [],
        "sentiments": [],
        "strength_scores": [],
        "persona_mentions": {},
    }


# ---- Change Detection ----

def two_proportion_z_test(
    p1: float, n1: int,
    p2: float, n2: int,
) -> Tuple[float, float]:
    """Two-proportion z-test for comparing rates between two runs.

    Args:
        p1: Proportion in run A (e.g., mention_frequency)
        n1: Sample size in run A (total_iterations)
        p2: Proportion in run B
        n2: Sample size in run B

    Returns:
        (z_score, p_value) — two-tailed p-value
    """
    if n1 == 0 or n2 == 0:
        return (0.0, 1.0)

    # Pooled proportion
    x1 = round(p1 * n1)
    x2 = round(p2 * n2)
    p_hat = (x1 + x2) / (n1 + n2)

    if p_hat == 0 or p_hat == 1:
        return (0.0, 1.0)

    se = math.sqrt(p_hat * (1 - p_hat) * (1 / n1 + 1 / n2))
    if se == 0:
        return (0.0, 1.0)

    z = (p1 - p2) / se

    # Two-tailed p-value using normal CDF approximation
    p_value = 2 * (1 - _normal_cdf(abs(z)))
    return (round(z, 4), round(p_value, 6))


def _normal_cdf(x: float) -> float:
    """Approximation of the standard normal CDF using the error function."""
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def compute_change_detection(
    stats_a: List[Dict],
    stats_b: List[Dict],
) -> List[Dict]:
    """Compare two runs' statistical results and flag significant changes.

    Args:
        stats_a: Statistical results from the earlier run (baseline)
        stats_b: Statistical results from the later run (comparison)

    Returns:
        List of change records per brand with z-tests on key proportions.
    """
    # Index by brand
    a_by_brand = {s["brand"]: s for s in stats_a}
    b_by_brand = {s["brand"]: s for s in stats_b}

    all_brands = sorted(set(list(a_by_brand.keys()) + list(b_by_brand.keys())))
    changes = []

    # Metrics that are proportions (0–1) suitable for z-test
    proportion_metrics = [
        ("mention_frequency", "Mention Rate"),
        ("top3_rate", "Top-3 Rate"),
        ("first_mention_rate", "First Mention Rate"),
        ("recommendation_rate", "Recommendation Rate"),
        ("share_of_voice", "Share of Voice"),
    ]

    for brand in all_brands:
        a = a_by_brand.get(brand)
        b = b_by_brand.get(brand)

        if not a or not b:
            continue

        n_a = a.get("total_iterations", 1)
        n_b = b.get("total_iterations", 1)

        brand_changes = {
            "brand": brand,
            "n_a": n_a,
            "n_b": n_b,
            "metrics": [],
        }

        for metric_key, metric_label in proportion_metrics:
            p_a = a.get(metric_key, 0.0)
            p_b = b.get(metric_key, 0.0)
            delta = p_b - p_a
            delta_pp = round(delta * 100, 1)  # percentage points

            z_score, p_value = two_proportion_z_test(p_a, n_a, p_b, n_b)
            significant = p_value < 0.05

            # Practical interpretation per methodology thresholds
            abs_pp = abs(delta_pp)
            if abs_pp < 3 and not significant:
                interpretation = "noise"
            elif abs_pp >= 10 and significant:
                interpretation = "major"
            elif significant:
                interpretation = "notable"
            else:
                interpretation = "noise"

            brand_changes["metrics"].append({
                "metric": metric_key,
                "label": metric_label,
                "value_a": round(p_a, 4),
                "value_b": round(p_b, 4),
                "delta_pp": delta_pp,
                "z_score": z_score,
                "p_value": p_value,
                "significant": significant,
                "interpretation": interpretation,
            })

        # Also compare recommendation_strength (continuous, not proportion)
        str_a = a.get("recommendation_strength", 0.0)
        str_b = b.get("recommendation_strength", 0.0)
        str_delta = round(str_b - str_a, 2)
        brand_changes["strength_a"] = str_a
        brand_changes["strength_b"] = str_b
        brand_changes["strength_delta"] = str_delta

        changes.append(brand_changes)

    return changes


def _process_ranked_items(
    items: List[Dict],
    brand_stats: Dict,
    brand_lower_map: Dict[str, str],
    persona_id: str,
):
    """Process a list of ranked brand items from a single response."""
    for item in items:
        brand_name = item.get("brand", "").strip()
        brand_lower = brand_name.lower()

        # Match against tracked brands (case-insensitive)
        canonical = brand_lower_map.get(brand_lower)
        if not canonical:
            # Try partial matching (e.g., "Apple iPhone" matches "Apple")
            for bl, bc in brand_lower_map.items():
                if bl in brand_lower or brand_lower in bl:
                    canonical = bc
                    break

        if not canonical:
            continue

        rank = item.get("rank", 99)
        sentiment_str = item.get("sentiment", "neutral")
        score = item.get("score")  # preference type has explicit score

        brand_stats[canonical]["mention_count"] += 1
        brand_stats[canonical]["ranks"].append(rank)
        brand_stats[canonical]["strength_scores"].append(rank_to_strength(rank))

        if score is not None:
            brand_stats[canonical]["sentiments"].append(score)
        else:
            brand_stats[canonical]["sentiments"].append(sentiment_to_score(sentiment_str))

        if rank <= 3:
            brand_stats[canonical]["recommendation_count"] += 1
        if rank == 1:
            brand_stats[canonical]["first_mention_count"] += 1

        if persona_id:
            brand_stats[canonical]["persona_mentions"].setdefault(persona_id, 0)
            brand_stats[canonical]["persona_mentions"][persona_id] += 1
