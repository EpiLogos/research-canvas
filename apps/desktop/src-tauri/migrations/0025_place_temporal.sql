-- Temporal Place projection (vision §3.14, locked by ticket #9): the full
-- typed payload (names with time bounds, coordinate precision, hierarchy,
-- external gazetteer refs, passage-level provenance) stored as a validated
-- JSON document on the local metadata projection. Neo4j carries the same
-- payload as a string property named `place`.
ALTER TABLE graph_node_metadata
  ADD COLUMN place_json TEXT
  CHECK (place_json IS NULL OR json_valid(place_json));
