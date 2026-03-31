CREATE VIRTUAL TABLE IF NOT EXISTS search_documents USING fts5(
    document_key UNINDEXED,
    scope_project_id UNINDEXED,
    project_id UNINDEXED,
    project_display_name UNINDEXED,
    project_slug UNINDEXED,
    canvas_id UNINDEXED,
    entity_type UNINDEXED,
    entity_id UNINDEXED,
    title,
    summary,
    body,
    source_path,
    relative_path,
    content_kind UNINDEXED,
    indexed_at UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);
