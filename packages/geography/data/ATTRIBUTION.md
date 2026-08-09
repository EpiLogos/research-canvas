# Gazetteer subset attribution

The bundled sample index (`gazetteer.sample.ndjson`) is a small offline subset
of real historical-geography records for development and verification. It is
**not** the production dataset — the production bundle manifest will carry the
same attribution requirement for every shipped dataset (vision §3.10).

| Source | License | Notes |
|---|---|---|
| [Pleiades](https://pleiades.stoa.org/) | CC BY 4.0 | Versioned dumps at `isawny/pleiades.datasets`; 41,480 places (v4.1, 2025-05-28). IDs used: 520998, 521070, 79577, 79301, 678106, 678090, 893951, 422665, 540705. |
| [Wikidata](https://www.wikidata.org/) | CC0 | Time-bounded identity backbone. IDs used: Q913 (İstanbul), Q84 (London), Q3591492. |
| [GeoNames](https://www.geonames.org/) | CC BY 4.0 | Modern baseline. ID used: 2643743 (London). |

Coordinates in this subset are flagged `exact` only where the source's
precision supports a point; otherwise `approximate`. Places known only as a
region or not located carry no point at all.
