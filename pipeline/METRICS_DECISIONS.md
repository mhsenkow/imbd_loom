# Metrics decisions (metrics_version 2)

Locked for the accuracy pass (`DATA_METRICS_ACCURACY_ACTIONS.md`):

| Decision | Choice |
|---|---|
| `degree` | Neighbor count (graph degree) |
| `strength` | Σ incident edge `weight` (former mislabeled `degree`) |
| Top-N / default UI sort·color·size | **strength** (honest hub signal) |
| Edge weight | Unchanged: `ROUND(Σ ln(votes+1))` |
| Canonical prominence | `Σ ln(votes+1) / max(billing, 1)` |
| Legacy prominence | Kept as `prominence_raw` (raw votes / billing) |
| Frontend shim | `nodeStrength(n) = n.strength ?? n.degree` until rebuild |

See [METRICS.md](METRICS.md) for the full field dictionary.
