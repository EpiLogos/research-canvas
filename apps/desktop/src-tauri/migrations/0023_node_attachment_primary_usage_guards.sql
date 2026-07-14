-- `node_attachment` is the primary record, but its kind and primary role
-- still have to remain compatible with every durable usage relation. Without
-- this guard a direct update can turn a selected image cover into a file
-- while leaving the presentation row and cover usage behind.
CREATE TRIGGER IF NOT EXISTS node_attachment_primary_kind_usage_update_guard
BEFORE UPDATE OF kind, role ON node_attachment
WHEN EXISTS (
    SELECT 1
    FROM node_attachment_usage AS usage
    WHERE usage.attachment_id = NEW.id
      AND (
          (NEW.kind = 'image' AND usage.role = 'file')
          OR (NEW.kind = 'file' AND usage.role IN ('inline', 'cover'))
      )
)
BEGIN
    SELECT RAISE(ABORT, 'attachment kind and durable usage role are incompatible');
END;
