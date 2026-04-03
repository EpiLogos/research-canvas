-- Add sequencing fields to edges
ALTER TABLE canvas_edges ADD COLUMN sequencing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE canvas_edges ADD COLUMN sequence_priority INTEGER NOT NULL DEFAULT 0;

-- Add sequence fields to nodes
ALTER TABLE canvas_nodes ADD COLUMN sequence_caption TEXT;
ALTER TABLE canvas_nodes ADD COLUMN sequence_viewport_json TEXT;

-- Drop old sequence tables (steps first due to FK)
DROP TABLE IF EXISTS sequence_steps;
DROP TABLE IF EXISTS sequences;

-- Drop old indexes
DROP INDEX IF EXISTS idx_sequences_canvas_id;
DROP INDEX IF EXISTS idx_sequence_steps_sequence_position;
