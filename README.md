# Edge search data

Written by the Edge search workflow (`.github/workflows/edge.yml` on main). Public market data only.

- `data/YYYY-MM-DD.jsonl.gz`: every settled 15-minute crypto market that closed that day (UTC), with both sides' quotes and
  Claude's pick's chart readings at minutes 2 to 12. Format in `research/edge/pull.mjs`.
- `edges/latest.json`: the newest search. Dashboards read this to raise new-edge alerts.
- `edges/report.md`: the same, for reading here.
- `edges/history.jsonl`: one line a run.

The search picks candidates on the first 60 of the last 90 days and judges them on the last 30 only. See `research/edge/search.py`.
