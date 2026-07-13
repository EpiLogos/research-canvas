-- A normal timeline-card selection previously persisted an untouched fallback
-- layout. These records are mechanically identifiable: initial revision, no
-- offset, default dimensions, and no visual override. Remove only that exact
-- shape so genuine moves, resizes, and colour styling remain intact.
DELETE FROM timeline_layout
WHERE lane = 'events'
  AND offset_y = 0
  AND width = 240
  AND height = 72
  AND style_json = '{}'
  AND layout_revision = 0;
