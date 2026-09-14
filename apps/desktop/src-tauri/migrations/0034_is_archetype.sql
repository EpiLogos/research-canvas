ALTER TABLE graph_node_metadata ADD COLUMN is_archetype INTEGER NOT NULL DEFAULT 0 CHECK (is_archetype IN (0, 1));
