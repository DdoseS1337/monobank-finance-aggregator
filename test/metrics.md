# Результати benchmark

- Питань: 20
- Повторів: 2
- Модель: `gpt-4o-mini`
- Embeddings: `text-embedding-3-small` (setup $0.0000)

| Метрика | tool-use | RAG | text-to-SQL |
|---|---|---|---|
| Accuracy (%) | 95.0% | 40.0% | 70.0% |
| Completeness (F1) | 0.85 | 0.305 | 0.522 |
| Latency p50 (s) | 4.66 | 5.06 | 3.86 |
| Latency p95 (s) | 11.39 | 21.91 | 7.46 |
| Cost / 100 запитів ($) | 0.048 | 0.05 | 0.021 |
| Total cost ($) | 0.0191 | 0.0199 | 0.0085 |
| N calls | 40 | 40 | 40 |
