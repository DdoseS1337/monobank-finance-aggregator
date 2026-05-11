"""
Empirical analysis of the V2 verification layer.

Reads the two CSV outputs of `npm run eval:verifier` (one with verifier on,
one with it off) and produces a comparison report — markdown tables for the
thesis "Експериментальні результати" section plus PNG charts.

Usage:
    python analyze.py
        # auto-picks the latest results-with-verifier-*.csv and
        # results-no-verifier-*.csv from this folder

    python analyze.py --with results-with-verifier-X.csv \
                      --without results-no-verifier-Y.csv

Requires: pandas, matplotlib, tabulate; scipy is optional (paired t-test).
    pip install pandas matplotlib tabulate scipy
"""
from __future__ import annotations

import argparse
import glob
import math
import os
from dataclasses import dataclass
from typing import Optional

import pandas as pd
import matplotlib.pyplot as plt

try:
    from scipy import stats  # type: ignore
    HAVE_SCIPY = True
except ImportError:
    HAVE_SCIPY = False

HERE = os.path.dirname(os.path.abspath(__file__))


@dataclass
class Pair:
    with_verifier: pd.DataFrame
    without_verifier: pd.DataFrame
    merged: pd.DataFrame  # joined on id, suffixes _w/_o


def latest(pattern: str) -> Optional[str]:
    matches = sorted(glob.glob(os.path.join(HERE, pattern)))
    return matches[-1] if matches else None


def load_pair(with_path: str, without_path: str) -> Pair:
    w = pd.read_csv(with_path)
    o = pd.read_csv(without_path)
    # Drop errored rows so we compare apples to apples.
    w_ok = w[w["errorMessage"].isna() | (w["errorMessage"] == "")]
    o_ok = o[o["errorMessage"].isna() | (o["errorMessage"] == "")]
    common_ids = set(w_ok["id"]).intersection(o_ok["id"])
    w_ok = w_ok[w_ok["id"].isin(common_ids)].set_index("id")
    o_ok = o_ok[o_ok["id"].isin(common_ids)].set_index("id")
    merged = w_ok.join(o_ok, how="inner", lsuffix="_w", rsuffix="_o")
    return Pair(with_verifier=w_ok, without_verifier=o_ok, merged=merged)


def fmt_pct(x: float) -> str:
    return f"{x*100:.2f}%"


def fmt_money(x: float) -> str:
    return f"${x:.6f}"


def fmt_ms(x: float) -> str:
    return f"{x:.0f} ms"


# ─────────────────────── Metrics ───────────────────────────────


def overall_table(pair: Pair) -> pd.DataFrame:
    m = pair.merged
    n = len(m)
    rows = []

    def stat(label, col_w, col_o, fmt):
        a = m[col_w].astype(float)
        b = m[col_o].astype(float)
        d = a - b
        rows.append(
            {
                "Metric": label,
                "Without verifier": fmt(b.mean()),
                "With verifier": fmt(a.mean()),
                "Δ (paired mean)": fmt(d.mean()),
            }
        )

    stat("Mean hallucination rate", "hallucinationRate_w", "hallucinationRate_o", fmt_pct)
    stat("Mean verified / total ratio",
         # 1 - halluc, but only for rows with claims
         "hallucinationRate_w", "hallucinationRate_o",
         lambda x: fmt_pct(1 - x))
    stat("Mean latency", "latencyMs_w", "latencyMs_o", fmt_ms)
    stat("Median latency", "latencyMs_w", "latencyMs_o", fmt_ms)
    stat("Mean cost per query", "costUsd_w", "costUsd_o", fmt_money)
    stat("Mean tool calls per query", "toolCallCount_w", "toolCallCount_o", lambda x: f"{x:.2f}")
    # Special: only WITH-verifier has retried column meaningful
    rows.append(
        {
            "Metric": "% queries that triggered retry (verifier-only)",
            "Without verifier": "—",
            "With verifier": fmt_pct(m["retried_w"].fillna(False).astype(bool).mean()),
            "Δ (paired mean)": "—",
        }
    )
    rows.append(
        {
            "Metric": "% queries fully grounded (halluc=0, ≥1 claim)",
            "Without verifier": fmt_pct(
                (
                    (m["verifTotal_o"] > 0) & (m["hallucinationRate_o"] == 0)
                ).sum()
                / max(1, (m["verifTotal_o"] > 0).sum())
            ),
            "With verifier": fmt_pct(
                (
                    (m["verifTotal_w"] > 0) & (m["hallucinationRate_w"] == 0)
                ).sum()
                / max(1, (m["verifTotal_w"] > 0).sum())
            ),
            "Δ (paired mean)": "—",
        }
    )
    rows.append(
        {
            "Metric": "Total queries analysed (paired)",
            "Without verifier": str(n),
            "With verifier": str(n),
            "Δ (paired mean)": "—",
        }
    )
    return pd.DataFrame(rows)


def per_type_table(pair: Pair) -> pd.DataFrame:
    m = pair.merged
    out = []
    for tname, g in m.groupby("type_w"):
        out.append(
            {
                "type": tname,
                "n": len(g),
                "halluc (off)": fmt_pct(g["hallucinationRate_o"].mean()),
                "halluc (on)": fmt_pct(g["hallucinationRate_w"].mean()),
                "Δ halluc (p.p.)": f"{(g['hallucinationRate_w'].mean() - g['hallucinationRate_o'].mean())*100:+.2f}",
                "lat off (ms)": fmt_ms(g["latencyMs_o"].mean()),
                "lat on (ms)": fmt_ms(g["latencyMs_w"].mean()),
                "Δ lat (ms)": f"{g['latencyMs_w'].mean() - g['latencyMs_o'].mean():+.0f}",
                "retried %": fmt_pct(g["retried_w"].fillna(False).astype(bool).mean()),
            }
        )
    return pd.DataFrame(out).sort_values("type")


def paired_significance(pair: Pair) -> Optional[dict]:
    if not HAVE_SCIPY:
        return None
    m = pair.merged
    # Only on numeric rows that actually had numeric claims, otherwise the
    # diff is mechanically zero and inflates n.
    sub = m[(m["type_w"] == "numeric") & (m["verifTotal_o"] > 0)]
    if len(sub) < 5:
        return {
            "n": len(sub),
            "note": "Too few rows for a meaningful test (need ≥5).",
        }
    t = stats.ttest_rel(
        sub["hallucinationRate_o"], sub["hallucinationRate_w"]
    )
    w = stats.wilcoxon(sub["hallucinationRate_o"], sub["hallucinationRate_w"], zero_method="zsplit")
    return {
        "n": len(sub),
        "t_stat": float(t.statistic),
        "t_pvalue": float(t.pvalue),
        "wilcoxon_stat": float(w.statistic),
        "wilcoxon_pvalue": float(w.pvalue),
    }


def routing_table(pair: Pair) -> pd.DataFrame:
    m = pair.merged
    return pd.crosstab(m["type_w"], m["agent_w"]).reset_index()


def tool_usage_table(pair: Pair) -> pd.DataFrame:
    m = pair.merged
    rows = []
    for col, label in [("toolNames_w", "With verifier"), ("toolNames_o", "Without verifier")]:
        counts: dict[str, int] = {}
        for s in m[col].fillna(""):
            if not s:
                continue
            for name in str(s).split("|"):
                counts[name] = counts.get(name, 0) + 1
        for name, c in counts.items():
            rows.append({"mode": label, "tool": name, "count": c})
    return (
        pd.DataFrame(rows)
        .pivot(index="tool", columns="mode", values="count")
        .fillna(0)
        .astype(int)
        .sort_values("With verifier", ascending=False)
        .reset_index()
    )


# ─────────────────────── Charts ────────────────────────────────


def chart_hallucination_by_type(pair: Pair, out_path: str) -> None:
    df = per_type_table(pair).copy()
    df["off"] = df["halluc (off)"].str.rstrip("%").astype(float)
    df["on"] = df["halluc (on)"].str.rstrip("%").astype(float)
    x = range(len(df))
    width = 0.38
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.bar([i - width / 2 for i in x], df["off"], width, label="without verifier", color="#cf6679")
    ax.bar([i + width / 2 for i in x], df["on"], width, label="with verifier", color="#5cb85c")
    ax.set_xticks(list(x))
    ax.set_xticklabels(df["type"])
    ax.set_ylabel("Hallucination rate, %")
    ax.set_title("Hallucination rate by query type (lower is better)")
    ax.legend()
    for i, (a, b) in enumerate(zip(df["off"], df["on"])):
        ax.text(i - width / 2, a + 0.5, f"{a:.1f}%", ha="center", fontsize=8)
        ax.text(i + width / 2, b + 0.5, f"{b:.1f}%", ha="center", fontsize=8)
    plt.tight_layout()
    plt.savefig(out_path, dpi=140)
    plt.close()


def chart_latency_box(pair: Pair, out_path: str) -> None:
    m = pair.merged
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.boxplot(
        [m["latencyMs_o"], m["latencyMs_w"]],
        labels=["without verifier", "with verifier"],
        showfliers=True,
    )
    ax.set_ylabel("Latency, ms")
    ax.set_title("Per-query latency distribution")
    plt.tight_layout()
    plt.savefig(out_path, dpi=140)
    plt.close()


def chart_cost_box(pair: Pair, out_path: str) -> None:
    m = pair.merged
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.boxplot(
        [m["costUsd_o"], m["costUsd_w"]],
        labels=["without verifier", "with verifier"],
        showfliers=True,
    )
    ax.set_ylabel("Cost per query, USD")
    ax.set_title("Per-query cost distribution")
    plt.tight_layout()
    plt.savefig(out_path, dpi=140)
    plt.close()


def chart_retry_impact(pair: Pair, out_path: str) -> None:
    m = pair.merged
    sub = m[m["verifTotal_w"] > 0].copy()
    retried = sub["retried_w"].fillna(False).astype(bool)
    fig, ax = plt.subplots(figsize=(6, 4))
    labels = ["Final halluc = 0", "Final halluc > 0"]
    retried_counts = [
        ((retried) & (sub["hallucinationRate_w"] == 0)).sum(),
        ((retried) & (sub["hallucinationRate_w"] > 0)).sum(),
    ]
    not_retried_counts = [
        ((~retried) & (sub["hallucinationRate_w"] == 0)).sum(),
        ((~retried) & (sub["hallucinationRate_w"] > 0)).sum(),
    ]
    x = [0, 1]
    width = 0.38
    ax.bar([i - width / 2 for i in x], not_retried_counts, width, label="no retry needed", color="#5cb85c")
    ax.bar([i + width / 2 for i in x], retried_counts, width, label="after retry", color="#f0ad4e")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Number of queries")
    ax.set_title("Effect of the verification retry loop (verifier-on)")
    ax.legend()
    plt.tight_layout()
    plt.savefig(out_path, dpi=140)
    plt.close()


# ─────────────────────── Main report ───────────────────────────


def render_md(pair: Pair, with_path: str, without_path: str) -> str:
    overall = overall_table(pair)
    per_type = per_type_table(pair)
    routing = routing_table(pair)
    tool_usage = tool_usage_table(pair)
    sig = paired_significance(pair)

    parts = []
    parts.append("# Empirical evaluation of the V2 verification layer\n")
    parts.append(
        f"Source CSVs:\n- with verifier: `{os.path.basename(with_path)}`\n"
        f"- without verifier: `{os.path.basename(without_path)}`\n"
    )
    parts.append("## Overall comparison\n")
    parts.append(overall.to_markdown(index=False))
    parts.append("\n\n## By query type\n")
    parts.append(per_type.to_markdown(index=False))
    parts.append("\n\n## Routing (which agent handled each query type)\n")
    parts.append(routing.to_markdown(index=False))
    parts.append("\n\n## Tool usage\n")
    parts.append(tool_usage.to_markdown(index=False))
    if sig is not None:
        parts.append("\n\n## Statistical significance (paired test on `hallucinationRate`)\n")
        if "note" in sig:
            parts.append(f"- {sig['note']}\n")
        else:
            parts.append(
                f"- Paired sample n = **{sig['n']}** numeric queries with claims\n"
                f"- Paired t-test: t = {sig['t_stat']:.3f}, p = {sig['t_pvalue']:.4g}\n"
                f"- Wilcoxon signed-rank: W = {sig['wilcoxon_stat']:.3f}, p = {sig['wilcoxon_pvalue']:.4g}\n"
            )
    parts.append("\n\n## Charts\n")
    parts.append("- `chart-halluc-by-type.png` — bar chart of hallucination rate per query type\n")
    parts.append("- `chart-latency-box.png` — latency distribution per mode\n")
    parts.append("- `chart-cost-box.png` — cost distribution per mode\n")
    parts.append("- `chart-retry-impact.png` — how often the retry rescued the answer\n")
    parts.append("\n## Reading guide for the thesis defence\n")
    parts.append(
        "1. **Δ hallucination rate** in the overall table is the headline number. "
        "Negative Δ → verifier improved factuality.\n"
        "2. **Δ latency** is the price you pay. Discuss the trade-off explicitly.\n"
        "3. **% queries that triggered retry** tells you how often V2 actually fires. "
        "If small (~5–15%), the verifier is conservative and the overhead is amortised "
        "across all queries; if large, costs go up but so does the safety net.\n"
        "4. **By-type table** — V2 should help most on `numeric` and `mutation` queries "
        "(where bad numbers cause real harm) and have near-zero effect on `educational` "
        "(no numeric claims) and `sanity` (out-of-scope queries the system refuses).\n"
        "5. **Statistical significance** — if p < 0.05 you have a defensible result. "
        "Report both the parametric (t-test) and non-parametric (Wilcoxon) tests; "
        "Wilcoxon is robust to the non-normal distribution of hallucination rates.\n"
    )
    return "\n".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--with", dest="with_path", help="Path to results-with-verifier-*.csv")
    ap.add_argument("--without", dest="without_path", help="Path to results-no-verifier-*.csv")
    args = ap.parse_args()

    with_path = args.with_path or latest("results-with-verifier-*.csv")
    without_path = args.without_path or latest("results-no-verifier-*.csv")
    if not with_path or not without_path:
        raise SystemExit(
            "Could not find both CSVs. Run the eval twice (once with verifier, once "
            "without) before running this analysis, or pass --with/--without."
        )

    pair = load_pair(with_path, without_path)
    if pair.merged.empty:
        raise SystemExit(
            "No paired queries with successful responses in both runs. Re-run eval "
            "(make sure backend is up for both runs)."
        )

    md = render_md(pair, with_path, without_path)
    md_path = os.path.join(HERE, "analysis.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)

    chart_hallucination_by_type(pair, os.path.join(HERE, "chart-halluc-by-type.png"))
    chart_latency_box(pair, os.path.join(HERE, "chart-latency-box.png"))
    chart_cost_box(pair, os.path.join(HERE, "chart-cost-box.png"))
    chart_retry_impact(pair, os.path.join(HERE, "chart-retry-impact.png"))

    print(f"OK. Wrote {md_path}")
    print(f"Charts in {HERE}/")
    print(f"\n--- preview ---\n{md[:1200]}…")


if __name__ == "__main__":
    main()
