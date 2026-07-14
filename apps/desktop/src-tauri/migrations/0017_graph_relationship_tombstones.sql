-- A physical local delete cannot suppress a stale remote edge after an
-- offline session. Keep the relationship's canonical contract as a durable
-- tombstone until its canonical remote deletion has been observed/retried.
ALTER TABLE graph_relationship
    ADD COLUMN is_tombstone INTEGER NOT NULL DEFAULT 0
    CHECK (is_tombstone IN (0, 1));

CREATE INDEX idx_graph_relationship_tombstone
    ON graph_relationship(is_tombstone, sync_state, relationship_revision);
