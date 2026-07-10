mod support;

use neo4rs::query;
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        graph::{
            ContentOrigin, GraphContentCasInput, GraphContentCasMutation, GraphRepository,
            NewGraphNode, NewGraphNodeMetadata,
        },
        DocumentContentInput, DocumentMetadataProjection, NodeDocumentRepository,
        SyncAcknowledgementMutation,
    },
};

fn local_input(id: &str, body: &str, revision: i64) -> DocumentContentInput {
    DocumentContentInput {
        graph_node_id: id.into(),
        body: body.into(),
        summary: format!("{body} face"),
        content_origin: ContentOrigin::UserAuthored,
        content_revision: revision,
        body_source_coordinates: vec!["source.md#body".into()],
        neo4j_synced: false,
    }
}

fn create_local_note(repo: &NodeDocumentRepository<'_>, id: &str, body: &str, revision: i64) {
    repo.apply_reconciliation_with_projection(
        &local_input(id, body, revision),
        None,
        Some(&DocumentMetadataProjection {
            entity_type: "Work".into(),
            title: "Node".into(),
            schema_version: 1,
        }),
    )
    .unwrap();
}

fn create_remote(
    repo: &GraphRepository,
    id: &str,
    body: &str,
    revision: i64,
    origin: ContentOrigin,
) {
    support::block_on(repo.create_node_with_metadata(
        NewGraphNode {
            graph_node_id: Some(id.into()),
            entity_type: "Work".into(),
            title: "Node".into(),
            body: body.into(),
            coordinate: None,
            source_coordinates: vec![],
            is_temporal: false,
            valid_from: None,
            valid_to: None,
            temporal_precision: None,
        },
        NewGraphNodeMetadata {
            content_origin: Some(origin),
            content_revision: Some(revision),
            body_source_coordinates: vec!["source.md#body".into()],
            ..Default::default()
        },
    ))
    .unwrap();
}

fn cas(
    id: &str,
    expected_revision: i64,
    expected_origin: ContentOrigin,
    body: &str,
    revision: i64,
) -> GraphContentCasInput {
    GraphContentCasInput {
        graph_node_id: id.into(),
        expected_remote_revision: Some(expected_revision),
        expected_remote_origin: Some(expected_origin),
        allow_legacy_null: false,
        body: body.into(),
        summary: format!("{body} face"),
        content_origin: ContentOrigin::UserAuthored,
        content_revision: revision,
        body_source_coordinates: vec!["source.md#body".into()],
    }
}

#[test]
fn content_sync_cas_coordinates_remote_and_local_revisions_without_blind_overwrites() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let graph_repo = GraphRepository::new(graph, database);
    support::block_on(graph_repo.ensure_schema()).unwrap();
    let directory = tempfile::tempdir().unwrap();
    let db = Database::open(directory.path().join("content-sync.sqlite")).unwrap();
    let local = NodeDocumentRepository::new(db.connection());

    // Happy path: local 7→8 pending, remote 7→8 CAS, local ack stays revision 8.
    let happy = format!("{run_id}:happy");
    create_remote(
        &graph_repo,
        &happy,
        "remote7",
        7,
        ContentOrigin::UserAuthored,
    );
    create_local_note(&local, &happy, "remote7", 7);
    local
        .apply_user_edit(&happy, "local8", "local8 face", 7)
        .unwrap();
    assert_eq!(
        support::block_on(graph_repo.compare_and_swap_content(&cas(
            &happy,
            7,
            ContentOrigin::UserAuthored,
            "local8",
            8
        )))
        .unwrap(),
        GraphContentCasMutation::Updated
    );
    assert_eq!(
        local
            .acknowledge_sync(&happy, 8, ContentOrigin::UserAuthored)
            .unwrap(),
        SyncAcknowledgementMutation::Updated
    );
    let happy_local = local.get_node_document(&happy).unwrap().unwrap();
    assert!(happy_local.neo4j_synced);
    assert_eq!(happy_local.content_revision, 8);
    assert_eq!(
        support::block_on(graph_repo.get_node(&happy))
            .unwrap()
            .unwrap()
            .content_revision,
        Some(8)
    );

    // Ack for 8 cannot clear pending revision 9 created before the ack arrived.
    let concurrent = format!("{run_id}:concurrent");
    create_remote(
        &graph_repo,
        &concurrent,
        "remote7",
        7,
        ContentOrigin::UserAuthored,
    );
    create_local_note(&local, &concurrent, "remote7", 7);
    local
        .apply_user_edit(&concurrent, "local8", "face8", 7)
        .unwrap();
    assert_eq!(
        support::block_on(graph_repo.compare_and_swap_content(&cas(
            &concurrent,
            7,
            ContentOrigin::UserAuthored,
            "local8",
            8
        )))
        .unwrap(),
        GraphContentCasMutation::Updated
    );
    local
        .apply_user_edit(&concurrent, "local9", "face9", 8)
        .unwrap();
    assert!(matches!(
        local
            .acknowledge_sync(&concurrent, 8, ContentOrigin::UserAuthored)
            .unwrap(),
        SyncAcknowledgementMutation::Conflict { .. }
    ));
    let concurrent_local = local.get_node_document(&concurrent).unwrap().unwrap();
    assert_eq!(concurrent_local.content_revision, 9);
    assert!(!concurrent_local.neo4j_synced);

    // A remote-newer revision and an origin mismatch both reject the write.
    let newer = format!("{run_id}:newer");
    create_remote(
        &graph_repo,
        &newer,
        "remote9",
        9,
        ContentOrigin::UserAuthored,
    );
    assert!(matches!(
        support::block_on(graph_repo.compare_and_swap_content(&cas(
            &newer,
            7,
            ContentOrigin::UserAuthored,
            "stale8",
            8
        )))
        .unwrap(),
        GraphContentCasMutation::Conflict {
            current_remote_revision: Some(9),
            ..
        }
    ));
    assert_eq!(
        support::block_on(graph_repo.get_node(&newer))
            .unwrap()
            .unwrap()
            .body,
        "remote9"
    );

    let origin = format!("{run_id}:origin");
    create_remote(
        &graph_repo,
        &origin,
        "corpus7",
        7,
        ContentOrigin::CorpusCompiled,
    );
    assert!(matches!(
        support::block_on(graph_repo.compare_and_swap_content(&cas(
            &origin,
            7,
            ContentOrigin::UserAuthored,
            "wrong",
            8
        )))
        .unwrap(),
        GraphContentCasMutation::Conflict {
            current_remote_origin: Some(ContentOrigin::CorpusCompiled),
            ..
        }
    ));
    assert_eq!(
        support::block_on(graph_repo.get_node(&origin))
            .unwrap()
            .unwrap()
            .body,
        "corpus7"
    );

    for id in [&happy, &concurrent, &newer, &origin] {
        support::block_on(graph_repo.delete_node(id)).unwrap();
    }
}

#[test]
fn legacy_null_remote_cas_requires_an_explicit_all_null_boundary() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).unwrap();
    let id = format!("{run_id}:legacy");
    support::block_on(graph.run_on(
        &database,
        query("CREATE (:TheoryNode:Work {graph_node_id:$id,title:'Legacy',body:'legacy',summary:'',source_coordinates:[],evidence_tags:[],body_source_coordinates:[],ql_source_coordinates:[],is_temporal:false,created_at:'now',updated_at:'now'})")
            .param("id", id.clone()),
    )).unwrap();

    let mut invalid = cas(&id, 0, ContentOrigin::Imported, "new", 1);
    invalid.expected_remote_revision = None;
    invalid.expected_remote_origin = None;
    assert!(support::block_on(repo.compare_and_swap_content(&invalid)).is_err());

    let mut mixed = invalid.clone();
    mixed.expected_remote_revision = Some(0);
    mixed.allow_legacy_null = true;
    assert!(support::block_on(repo.compare_and_swap_content(&mixed)).is_err());

    let mut explicit = invalid;
    explicit.allow_legacy_null = true;
    assert_eq!(
        support::block_on(repo.compare_and_swap_content(&explicit)).unwrap(),
        GraphContentCasMutation::Updated
    );
    let updated = support::block_on(repo.get_node(&id)).unwrap().unwrap();
    assert_eq!(updated.body, "new");
    assert_eq!(updated.content_revision, Some(1));
    assert_eq!(updated.content_origin, Some(ContentOrigin::UserAuthored));
    assert!(matches!(
        support::block_on(repo.compare_and_swap_content(&explicit)).unwrap(),
        GraphContentCasMutation::Conflict {
            current_remote_revision: Some(1),
            current_remote_origin: Some(ContentOrigin::UserAuthored),
            ..
        }
    ));
    support::block_on(repo.delete_node(&id)).unwrap();
}
