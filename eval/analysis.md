# Empirical evaluation of the V2 verification layer

Source CSVs:
- with verifier: `results-with-verifier-2026-05-11T07-55-55-073Z.csv`
- without verifier: `results-no-verifier-2026-05-11T08-25-20-934Z.csv`

## Overall comparison

| Metric                                         | Without verifier   | With verifier   | Δ (paired mean)   |
|:-----------------------------------------------|:-------------------|:----------------|:------------------|
| Mean hallucination rate                        | 11.36%             | 3.23%           | -8.13%            |
| Mean verified / total ratio                    | 88.64%             | 96.77%          | 108.13%           |
| Mean latency                                   | 17276 ms           | 19198 ms        | 1922 ms           |
| Median latency                                 | 17276 ms           | 19198 ms        | 1922 ms           |
| Mean cost per query                            | $0.003041          | $0.003963       | $0.000922         |
| Mean tool calls per query                      | 2.04               | 2.24            | 0.20              |
| % queries that triggered retry (verifier-only) | —                  | 16.33%          | —                 |
| % queries fully grounded (halluc=0, ≥1 claim)  | 72.73%             | 90.32%          | —                 |
| Total queries analysed (paired)                | 49                 | 49              | —                 |


## By query type

| type        |   n | halluc (off)   | halluc (on)   |   Δ halluc (p.p.) | lat off (ms)   | lat on (ms)   |   Δ lat (ms) | retried %   |
|:------------|----:|:---------------|:--------------|------------------:|:---------------|:--------------|-------------:|:------------|
| causal      |   5 | 0.00%          | 6.67%         |              6.67 | 13814 ms       | 19412 ms      |        +5598 | 20.00%      |
| educational |   8 | 23.33%         | 15.62%        |             -7.71 | 12470 ms       | 15074 ms      |        +2604 | 50.00%      |
| mutation    |   5 | 0.00%          | 0.00%         |              0    | 20182 ms       | 11547 ms      |        -8635 | 0.00%       |
| numeric     |  29 | 12.76%         | 0.00%         |            -12.76 | 19696 ms       | 22747 ms      |        +3051 | 10.34%      |
| sanity      |   2 | 0.00%          | 0.00%         |              0    | 2817 ms        | 2834 ms       |          +18 | 0.00%       |


## Routing (which agent handled each query type)

| type_w      |   analyst |   forecaster |   guardrail-blocked |   planner |
|:------------|----------:|-------------:|--------------------:|----------:|
| causal      |         4 |            0 |                   0 |         1 |
| educational |         7 |            0 |                   0 |         1 |
| mutation    |         0 |            0 |                   0 |         5 |
| numeric     |        26 |            2 |                   0 |         1 |
| sanity      |         1 |            0 |                   1 |         0 |


## Tool usage

| tool                    |   With verifier |   Without verifier |
|:------------------------|----------------:|-------------------:|
| get_transactions        |              36 |                 33 |
| calculate               |              22 |                 17 |
| get_categories          |              11 |                  9 |
| get_budgets             |               9 |                  8 |
| lookup_education        |               7 |                  7 |
| explain_spending_change |               6 |                  5 |
| get_fx_rate             |               4 |                  5 |
| get_goals               |               4 |                  5 |
| get_cashflow_summary    |               3 |                  3 |
| get_subscriptions       |               3 |                  4 |
| adjust_budget_line      |               1 |                  1 |
| create_budget           |               1 |                  1 |
| create_goal             |               1 |                  1 |
| add_budget_line         |               1 |                  1 |
| get_cashflow            |               1 |                  0 |


## Statistical significance (paired test on `hallucinationRate`)

- Paired sample n = **19** numeric queries with claims
- Paired t-test: t = 2.470, p = 0.02372
- Wilcoxon signed-rank: W = 45.500, p = 0.03846




## Effect size and confidence intervals (hallucination rate)
- Mean Δ = -11.38% (paired diff, with − without)
- 95% CI (bootstrap, n_boot=1000): [-21.96%, -2.48%]
- Cohen's d (paired) = -0.39 (small effect)
- n = 35 paired observations



## Overhead: latency
- Mean Δ = +1922ms (paired diff, with − without)
- 95% CI (bootstrap, n_boot=1000): [-2934ms, +7317ms]
- Cohen's d (paired) = 0.10 (negligible effect)
- n = 49 paired observations



## Overhead: cost per query
- Mean Δ = +0.000922 USD (paired diff, with − without)
- 95% CI (bootstrap, n_boot=1000): [+0.000134 USD, +0.001808 USD]
- Cohen's d (paired) = 0.29 (small effect)
- n = 49 paired observations



## Charts

- `chart-halluc-by-type.png` — bar chart of hallucination rate per query type

- `chart-latency-box.png` — latency distribution per mode

- `chart-cost-box.png` — cost distribution per mode

- `chart-retry-impact.png` — how often the retry rescued the answer


## Reading guide for the thesis defence

1. **Δ hallucination rate** in the overall table is the headline number. Negative Δ → verifier improved factuality.
2. **Δ latency** is the price you pay. Discuss the trade-off explicitly.
3. **% queries that triggered retry** tells you how often V2 actually fires. If small (~5–15%), the verifier is conservative and the overhead is amortised across all queries; if large, costs go up but so does the safety net.
4. **By-type table** — V2 should help most on `numeric` and `mutation` queries (where bad numbers cause real harm) and have near-zero effect on `educational` (no numeric claims) and `sanity` (out-of-scope queries the system refuses).
5. **Statistical significance** — if p < 0.05 you have a defensible result. Report both the parametric (t-test) and non-parametric (Wilcoxon) tests; Wilcoxon is robust to the non-normal distribution of hallucination rates.
