# Deterministic Opportunity Model 1.0.0

## Contract

An opportunity is a review flag, not a score, prediction, causal conclusion, or instruction to publish. Every record includes rule/version, group key, priority/category, page/query where applicable, observation, exact calculation, proposed action, success metric, limitation, source metric IDs, timestamps, and review status.

Statuses are `new`, `reviewed`, `approved`, `rejected`, `implemented`, `monitoring`, and `verified`. Status changes are persisted and audited. Re-importing evidence updates a deterministic opportunity while preserving its existing status and creation time.

## Release 1 rules

| Rule | Trigger |
| --- | --- |
| `SEARCH_HIGH_IMPRESSIONS_LOW_CTR` | impressions >= 100 and imported CTR < 3% |
| `SEARCH_STRONG_POSITION_LOW_CTR` | impressions >= 50, average position <= 5, CTR < 3% |
| `SEARCH_PAGE_TWO_DEMAND` | impressions >= 50 and 10 < average position <= 20 |
| `SEARCH_QUERY_MULTIPLE_PAGES` | same query/date/device/country on more than one page and total impressions >= 100 |
| `ENGAGEMENT_HIGH_TRAFFIC_WEAK_ENGAGEMENT` | sessions >= 100 and engagement rate < 40% |
| `ENGAGEMENT_HIGH_TRAFFIC_LOW_CONVERSION` | sessions >= 100 and conversions/sessions < 1% |
| `ENGAGEMENT_LOW_TRAFFIC_STRONG_CONVERSION` | 0 < sessions < 50 and conversions/sessions >= 5% |
| `CAMPAIGN_SPEND_WITHOUT_CONVERSION` | spend >= 100 source-currency units and conversions = 0 |
| `LEAD_VOLUME_LOW_QUALIFICATION` | leads >= 20 and qualified/leads < 25% |

Thresholds are explicit review heuristics. They are not optimization targets or universal benchmarks. Currency, attribution, consent, sampling, privacy thresholds, instrumentation, traffic mix, date comparability, and small denominators remain limitations.

`SEARCH_QUERY_MULTIPLE_PAGES` intentionally says “review”; multiple pages can serve distinct intent and do not prove cannibalization.

## Search evidence detail

Opening a Search Performance row displays:

1. the imported Search Console metrics;
2. an exact-URL match from the latest saved public-page run, if available;
3. query-term-related public competitor topics/questions and comparison gap IDs, if observed;
4. the deterministic opportunity, if a rule triggered;
5. the exact arithmetic/threshold;
6. the proposed review action;
7. a later comparable-import success metric;
8. combined analytics, evidence-date, and competitor limitations.

Missing page/run/competitor evidence remains empty and explicit. The detail view never invents analytics values or claims that a query caused a page outcome.
