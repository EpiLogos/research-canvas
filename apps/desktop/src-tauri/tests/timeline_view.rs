use research_canvas_desktop_lib::{
    commands::timeline::{
        load_timeline_view_at_path, timeline_workspace_identity, LoadTimelineViewRequest,
    },
    db::connection::Database,
};
use serde_json::json;
use tempfile::tempdir;

#[test]
fn workspace_timeline_joins_authoritative_documents_layout_and_diagnostics() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("timeline.sqlite");
    let db = Database::open(&path).unwrap();
    db.connection().execute_batch(
        "INSERT INTO graph_node_metadata(graph_node_id,entity_type,title,content_origin,content_revision,historicity,temporal_role,is_temporal,valid_from,valid_to,temporal_precision,schema_version,sync_state)
         VALUES ('dated','Event','Dated event','user_authored',2,'historical','occurred_at',1,'1945-05-08','1945-05-08','day',1,'pending'),
                ('broken','Claim','Broken anchor','imported',0,NULL,NULL,1,'not-a-date',NULL,'year',1,'pending'),
                ('atemporal','Dynamic','Pattern','seed',0,NULL,NULL,0,NULL,NULL,NULL,1,'synced');
         INSERT INTO node_document(graph_node_id,body,summary,updated_at,content_origin,content_revision)
         VALUES ('dated','authoritative body','pithy face','2026-07-12T00:00:00Z','user_authored',2),
                ('broken','broken body','broken face','2026-07-12T00:00:00Z','imported',0);
         INSERT INTO timeline_layout(graph_node_id,lane,offset_y,width,height,style_json,layout_revision)
         VALUES ('dated','events',17,320,144,'{\"colour\":\"ochre\"}',3);",
    ).unwrap();
    drop(db);

    let workspace_id = timeline_workspace_identity(&path).unwrap();
    let view = load_timeline_view_at_path(
        &path,
        LoadTimelineViewRequest {
            workspace_id: workspace_id.clone(),
            filters: Default::default(),
        },
    )
    .unwrap();

    assert_eq!(view.workspace_id, workspace_id);
    assert_eq!(view.nodes.len(), 1);
    assert_eq!(view.nodes[0].node.body, "authoritative body");
    assert_eq!(view.nodes[0].node.summary, "pithy face");
    assert_eq!(view.nodes[0].anchor.precision.as_str(), "day");
    assert_eq!(
        view.nodes[0].layout_override.as_ref().unwrap().lane,
        "events"
    );
    assert_eq!(
        view.nodes[0].layout_override.as_ref().unwrap().style,
        json!({"colour":"ochre"})
    );
    assert_eq!(view.lanes[0].id, "events");
    assert_eq!(view.diagnostics.len(), 1);
    assert_eq!(view.diagnostics[0].graph_node_id, "broken");
    let wire = serde_json::to_value(&view).unwrap();
    assert_eq!(wire["nodes"][0]["anchor"]["precision"], "day");
    assert_eq!(wire["nodes"][0]["layoutOverride"]["offsetY"], 17.0);
    assert_eq!(wire["lanes"][0], json!({"id":"events"}));
    assert_eq!(wire["diagnostics"][0]["code"], "invalid_temporal_anchor");
}

#[test]
fn temporal_grammar_workspace_identity_and_filters_are_strict() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("grammar.sqlite");
    let db = Database::open(&path).unwrap();
    let cases = [
        ("bce", "-0043", None, Some("year"), true),
        ("month", "1945-05", None, Some("month"), true),
        ("leap", "2000-02-29", None, Some("day"), true),
        ("datetime", "2024-01-02T03:04:05Z", None, Some("day"), true),
        (
            "offset_crossing",
            "2024-01-01T00:30:00+01:00",
            Some("2023-12-31T23:45:00Z"),
            Some("day"),
            true,
        ),
        (
            "submillisecond",
            "2024-01-01T00:00:00.0009Z",
            Some("2024-01-01T00:00:00.0001Z"),
            Some("day"),
            true,
        ),
        ("nonleap", "2023-02-29", None, Some("day"), false),
        ("suffix", "1945-05-08garbage", None, Some("day"), false),
        ("plus", "+1945", None, Some("year"), false),
        ("overlong", "1000000", None, Some("year"), false),
        ("whitespace", " 1945 ", None, Some("year"), false),
        ("inverted", "1946", Some("1945"), Some("year"), false),
        ("missing_precision", "1945", None, None, false),
    ];
    for (id, from, to, precision, _) in cases {
        db.connection().execute(
            "INSERT INTO graph_node_metadata(graph_node_id,entity_type,title,content_origin,content_revision,historicity,temporal_role,is_temporal,valid_from,valid_to,temporal_precision,schema_version,sync_state)
             VALUES (?1,'Event',?1,'seed',0,'historical','occurred_at',1,?2,?3,?4,1,'synced')",
            rusqlite::params![id, from, to, precision],
        ).unwrap();
        db.connection().execute(
            "INSERT INTO node_document(graph_node_id,body,summary,updated_at,content_origin,content_revision) VALUES (?1,'body','face','2026-07-12T00:00:00Z','seed',0)",
            [id],
        ).unwrap();
    }
    drop(db);
    let workspace_id = timeline_workspace_identity(&path).unwrap();
    let view = load_timeline_view_at_path(
        &path,
        LoadTimelineViewRequest {
            workspace_id: workspace_id.clone(),
            filters: Default::default(),
        },
    )
    .unwrap();
    assert_eq!(
        view.nodes
            .iter()
            .map(|row| row.node.graph_node_id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "bce",
            "datetime",
            "leap",
            "month",
            "offset_crossing",
            "submillisecond"
        ]
    );
    assert_eq!(view.diagnostics.len(), 7);

    let filtered: LoadTimelineViewRequest = serde_json::from_value(json!({
        "workspaceId": workspace_id,
        "filters": {
            "entityTypes": { "include": ["Event"], "exclude": ["Claim"] },
            "historicities": { "include": ["historical"] },
            "temporalRoles": { "include": ["occurred_at"] }
        }
    }))
    .unwrap();
    assert_eq!(
        load_timeline_view_at_path(&path, filtered)
            .unwrap()
            .nodes
            .len(),
        6
    );
    let excluded: LoadTimelineViewRequest = serde_json::from_value(json!({
        "workspaceId": workspace_id,
        "filters": { "entityTypes": { "exclude": ["Event"] } }
    }))
    .unwrap();
    assert!(load_timeline_view_at_path(&path, excluded)
        .unwrap()
        .nodes
        .is_empty());
    assert!(load_timeline_view_at_path(
        &path,
        LoadTimelineViewRequest {
            workspace_id: "wrong".into(),
            filters: Default::default()
        }
    )
    .unwrap_err()
    .contains("does not match"));
    assert!(load_timeline_view_at_path(
        &path,
        LoadTimelineViewRequest {
            workspace_id: "".into(),
            filters: Default::default()
        }
    )
    .unwrap_err()
    .contains("must not be empty"));
}

#[test]
fn request_contract_rejects_canvas_membership_scope() {
    let error = serde_json::from_value::<LoadTimelineViewRequest>(json!({
        "workspaceId": "workspace-a",
        "canvasId": "must-not-scope-timeline"
    }))
    .expect_err("canvasId must not be accepted at this boundary");
    assert!(error.to_string().contains("unknown field"));
    assert!(serde_json::from_value::<LoadTimelineViewRequest>(json!({
        "workspaceId": "workspace-a", "databasePath": "/tmp/injection.sqlite"
    }))
    .is_err());
}

#[test]
fn request_filters_deserialize_as_controlled_contract_values() {
    let request: LoadTimelineViewRequest = serde_json::from_value(json!({
        "workspaceId": "workspace-a",
        "filters": {
            "entityTypes": { "include": ["Event"] },
            "historicities": { "include": ["historical"] },
            "temporalRoles": { "include": ["occurred_at"] }
        }
    }))
    .unwrap();
    assert_eq!(request.filters.entity_types.include[0].as_str(), "Event");
    assert_eq!(
        request.filters.historicities.include[0].as_str(),
        "historical"
    );
    assert_eq!(
        request.filters.temporal_roles.include[0].as_str(),
        "occurred_at"
    );
    assert!(serde_json::from_value::<LoadTimelineViewRequest>(json!({
        "workspaceId": "workspace-a",
        "filters": { "historicities": { "include": ["myth_in_time"] } }
    }))
    .is_err());
}
