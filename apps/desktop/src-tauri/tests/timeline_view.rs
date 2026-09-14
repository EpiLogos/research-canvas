use research_canvas_desktop_lib::{
    commands::timeline::{
        load_timeline_view_at_path, timeline_workspace_identity, upsert_timeline_layout_at_path,
        LoadTimelineViewRequest, TimelineLayoutMutationResult, TimelineYearRange,
        UpsertTimelineLayoutRequest,
    },
    db::connection::Database,
};
use serde_json::json;
use tempfile::tempdir;

#[test]
fn timeline_layout_command_round_trips_without_touching_canvas_layout() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("timeline-layout.sqlite");
    let db = Database::open(&path).unwrap();
    db.connection().execute("INSERT INTO graph_node_metadata(graph_node_id,entity_type,title,content_origin,content_revision,is_temporal,valid_from,temporal_precision,schema_version,sync_state) VALUES ('event-1','Event','Event','user_authored',1,1,'1900','year',1,'pending')", []).unwrap();
    db.connection().execute_batch(r##"INSERT INTO node_document(graph_node_id,body,summary,updated_at,content_origin,content_revision) VALUES ('event-1','body','face','2026-07-12T00:00:00Z','user_authored',1);
        INSERT INTO projects(id,display_name,slug,root_path) VALUES ('project-1','Project','project','/project');
        INSERT INTO canvases(id,project_id,name) VALUES ('canvas-1','project-1','Canvas');
        INSERT INTO node_layout(graph_node_id,canvas_id,position_x,position_y,width,height,style_json) VALUES ('event-1','canvas-1',11.25,-22.5,444,155,'{"bgColour":"#111","__canvasNode":{"type":"note","title":"Canvas face","content":"x","tags":[]}}');"##).unwrap();
    let canvas_before: (String, String, f64, f64, f64, f64, String, String, String) = db.connection().query_row(
        "SELECT graph_node_id,canvas_id,position_x,position_y,width,height,style_json,created_at,updated_at FROM node_layout WHERE graph_node_id='event-1' AND canvas_id='canvas-1'", [],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?,row.get(7)?,row.get(8)?))).unwrap();
    drop(db);
    let result = upsert_timeline_layout_at_path(
        &path,
        UpsertTimelineLayoutRequest {
            workspace_id: timeline_workspace_identity(&path).unwrap(),
            graph_node_id: "event-1".into(),
            lane: "events".into(),
            offset_y: 34.0,
            width: 312.0,
            height: 118.0,
            style: json!({"dotColour":"#123456"}),
            expected_revision: None,
        },
    )
    .unwrap();
    assert!(matches!(
        result,
        TimelineLayoutMutationResult::Created { .. }
    ));
    let preserved = upsert_timeline_layout_at_path(
        &path,
        UpsertTimelineLayoutRequest {
            workspace_id: timeline_workspace_identity(&path).unwrap(),
            graph_node_id: "event-1".into(),
            lane: "events".into(),
            offset_y: 34.0,
            width: 312.0,
            height: 118.0,
            style: json!({"dotColour":"#123456"}),
            expected_revision: None,
        },
    )
    .unwrap();
    assert!(matches!(
        preserved,
        TimelineLayoutMutationResult::Preserved { .. }
    ));
    let updated = upsert_timeline_layout_at_path(
        &path,
        UpsertTimelineLayoutRequest {
            workspace_id: timeline_workspace_identity(&path).unwrap(),
            graph_node_id: "event-1".into(),
            lane: "documents".into(),
            offset_y: 40.0,
            width: 330.0,
            height: 120.0,
            style: json!({"dotColour":"#abcdef"}),
            expected_revision: Some(0),
        },
    )
    .unwrap();
    assert!(matches!(
        updated,
        TimelineLayoutMutationResult::Updated { .. }
    ));
    let conflict = upsert_timeline_layout_at_path(
        &path,
        UpsertTimelineLayoutRequest {
            workspace_id: timeline_workspace_identity(&path).unwrap(),
            graph_node_id: "event-1".into(),
            lane: "events".into(),
            offset_y: 1.0,
            width: 200.0,
            height: 80.0,
            style: json!({}),
            expected_revision: Some(0),
        },
    )
    .unwrap();
    assert!(matches!(
        conflict,
        TimelineLayoutMutationResult::Conflict { .. }
    ));
    let reopened = Database::open(&path).unwrap();
    let row = research_canvas_desktop_lib::db::repositories::TimelineLayoutRepository::new(
        reopened.connection(),
    )
    .get("event-1")
    .unwrap()
    .unwrap();
    assert_eq!(
        (
            row.lane.as_str(),
            row.offset_y,
            row.width,
            row.height,
            row.layout_revision
        ),
        ("documents", 40.0, 330.0, 120.0, 1)
    );
    assert_eq!(row.style_json, json!({"dotColour":"#abcdef"}));
    let canvas_after: (String, String, f64, f64, f64, f64, String, String, String) = reopened.connection().query_row(
        "SELECT graph_node_id,canvas_id,position_x,position_y,width,height,style_json,created_at,updated_at FROM node_layout WHERE graph_node_id='event-1' AND canvas_id='canvas-1'", [],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?,row.get(7)?,row.get(8)?))).unwrap();
    assert_eq!(canvas_after, canvas_before);
    drop(reopened);
    let reloaded = load_timeline_view_at_path(
        &path,
        LoadTimelineViewRequest {
            workspace_id: timeline_workspace_identity(&path).unwrap(),
            filters: Default::default(),
            range: None,
        },
    )
    .unwrap();
    let layout = reloaded
        .nodes
        .iter()
        .find(|node| node.node.graph_node_id == "event-1")
        .unwrap()
        .layout_override
        .as_ref()
        .unwrap();
    assert_eq!(
        (
            layout.lane.as_str(),
            layout.offset_y,
            layout.width,
            layout.height,
            layout.layout_revision
        ),
        ("documents", 40.0, 330.0, 120.0, 1)
    );
    assert_eq!(layout.style, json!({"dotColour":"#abcdef"}));
}

#[test]
fn timeline_layout_command_rejects_non_temporal_nodes_without_writing() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("non-temporal.sqlite");
    let db = Database::open(&path).unwrap();
    db.connection().execute("INSERT INTO graph_node_metadata(graph_node_id,entity_type,title,content_origin,content_revision,is_temporal,schema_version,sync_state) VALUES ('concept-1','Archetype','Concept','user_authored',1,0,1,'pending')", []).unwrap();
    drop(db);
    let error = upsert_timeline_layout_at_path(
        &path,
        UpsertTimelineLayoutRequest {
            workspace_id: timeline_workspace_identity(&path).unwrap(),
            graph_node_id: "concept-1".into(),
            lane: "events".into(),
            offset_y: 0.0,
            width: 200.0,
            height: 80.0,
            style: json!({}),
            expected_revision: None,
        },
    )
    .unwrap_err();
    assert!(error.contains("must be temporal"));
    let reopened = Database::open(&path).unwrap();
    let count: i64 = reopened
        .connection()
        .query_row("SELECT COUNT(*) FROM timeline_layout", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

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
            range: None,
        },
    )
    .unwrap();

    assert_eq!(view.workspace_id, workspace_id);
    assert_eq!(view.nodes.len(), 1);
    assert_eq!(view.nodes[0].node.body, "[]");
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

    let bounded = load_timeline_view_at_path(
        &path,
        LoadTimelineViewRequest {
            workspace_id: workspace_id.clone(),
            filters: Default::default(),
            range: Some(TimelineYearRange {
                start_year: 1945,
                end_year: 1945,
            }),
        },
    )
    .unwrap();
    assert_eq!(bounded.nodes.len(), 1);
    assert_eq!(bounded.nodes[0].node.summary, "pithy face");
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
            range: None,
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
            filters: Default::default(),
            range: None,
        }
    )
    .unwrap_err()
    .contains("does not match"));
    assert!(load_timeline_view_at_path(
        &path,
        LoadTimelineViewRequest {
            workspace_id: "".into(),
            filters: Default::default(),
            range: None,
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

#[test]
fn expand_timeline_node_loads_edges_and_neighbours_with_properties() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("timeline-expand.sqlite");
    let db = Database::open(&path).unwrap();
    // Two dated events plus an atemporal archetype; event-1 relates to both.
    db.connection().execute_batch(r##"
        INSERT INTO graph_node_metadata(graph_node_id,entity_type,title,content_origin,content_revision,is_temporal,valid_from,temporal_precision,schema_version,sync_state)
        VALUES
          ('event-1','Event','Event One','user_authored',1,1,'1900','year',1,'pending'),
          ('event-2','Event','Event Two','user_authored',1,1,'1910','year',1,'pending'),
          ('arch-1','Archetype','Archetype','user_authored',1,0,NULL,NULL,1,'pending');
        INSERT INTO node_document(graph_node_id,body,summary,updated_at,content_origin,content_revision)
        VALUES
          ('event-1','event-1 body','face one','2026-07-12T00:00:00Z','user_authored',1),
          ('event-2','event-2 body','face two','2026-07-12T00:00:00Z','user_authored',1),
          ('arch-1','arch body','face arch','2026-07-12T00:00:00Z','user_authored',1);
        INSERT INTO graph_relationship(relationship_id,source_graph_node_id,target_graph_node_id,rel_type,properties_json,source_coordinates_json,evidence_tags_json,origin,sync_state,relationship_revision)
        VALUES
          ('rel-1','event-1','arch-1','INSTANTIATES','{"dominance":"dominant","evidence_tags":["documented"],"source_coordinates":["vault/ep-2/timeline.md"]}','[]','[]','seed','synced',0),
          ('rel-2','event-1','event-2','INFLUENCES','{"temporal_precision":"year"}','[]','[]','seed','synced',0),
          ('rel-3','event-2','arch-1','ECHOES','{"dominance":"secondary"}','[]','[]','seed','synced',0);
    "##).unwrap();
    let workspace_id = timeline_workspace_identity(&path).unwrap();

    let view = load_timeline_view_at_path(
        &path,
        LoadTimelineViewRequest {
            workspace_id: workspace_id.clone(),
            filters: Default::default(),
            range: None,
        },
    )
    .unwrap();
    assert_eq!(view.nodes.len(), 2, "base view stays dated-events-only");
    assert_eq!(view.nodes[0].node.graph_node_id, "event-1");
    assert_eq!(view.nodes[1].node.graph_node_id, "event-2");

    let expansion =
        research_canvas_desktop_lib::commands::timeline::expand_timeline_node_at_path(
            &path,
            &workspace_id,
            "event-1",
        )
        .unwrap();
    assert_eq!(expansion.subject_graph_node_id, "event-1");
    assert_eq!(expansion.subject.title, "Event One");
    assert_eq!(expansion.subject.body, "event-1 body");
    // Deep properties ride through untouched on the edge payloads.
    assert_eq!(expansion.edges.len(), 2);
    let instantiates = expansion
        .edges
        .iter()
        .find(|edge| edge.rel_type == "INSTANTIATES")
        .expect("INSTANTIATES edge");
    assert_eq!(instantiates.source_graph_node_id, "event-1");
    assert_eq!(instantiates.target_graph_node_id, "arch-1");
    assert_eq!(instantiates.properties["dominance"], json!("dominant"));
    assert_eq!(
        instantiates.properties["source_coordinates"][0],
        json!("vault/ep-2/timeline.md")
    );
    let influences = expansion
        .edges
        .iter()
        .find(|edge| edge.rel_type == "INFLUENCES")
        .expect("INFLUENCES edge");
    assert_eq!(influences.properties["temporal_precision"], json!("year"));
    // Both neighbours resolved property-complete from the local projection.
    let neighbour_ids = expansion
        .neighbours
        .iter()
        .map(|node| node.graph_node_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(neighbour_ids.len(), 2);
    assert!(neighbour_ids.contains(&"arch-1"));
    assert!(neighbour_ids.contains(&"event-2"));
    let arch = expansion
        .neighbours
        .iter()
        .find(|node| node.graph_node_id == "arch-1")
        .expect("arch neighbour");
    assert_eq!(arch.body, "arch body");

    // A non-temporal node can also be expanded: the stack is the user's own
    // exploration surface, not a temporal filter.
    let arch_expansion =
        research_canvas_desktop_lib::commands::timeline::expand_timeline_node_at_path(
            &path,
            &workspace_id,
            "arch-1",
        )
        .unwrap();
    assert_eq!(arch_expansion.edges.len(), 2);
    assert_eq!(arch_expansion.neighbours.len(), 2);

    // Unknown subject fails closed.
    let missing = research_canvas_desktop_lib::commands::timeline::expand_timeline_node_at_path(
        &path,
        &workspace_id,
        "event-999",
    )
    .expect_err("missing subject must error");
    assert!(missing.contains("does not exist"));
}
