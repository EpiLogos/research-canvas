use std::sync::OnceLock;

use serde::Deserialize;

const COMPILED_CORPUS: &str = include_str!("corpus_knowledge.generated.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompiledCorpus {
    schema_version: u64,
    documents: Vec<CompiledDocument>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompiledDocument {
    pub(crate) slug: String,
    pub(crate) content_revision: i64,
    pub(crate) source_coordinates: Vec<String>,
    pub(crate) body: String,
}

fn corpus() -> &'static CompiledCorpus {
    static CORPUS: OnceLock<CompiledCorpus> = OnceLock::new();
    CORPUS.get_or_init(|| {
        let corpus = serde_json::from_str::<CompiledCorpus>(COMPILED_CORPUS)
            .expect("checked-in corpus knowledge artifact must be valid JSON");
        assert_eq!(
            corpus.schema_version, 1,
            "checked-in corpus knowledge artifact must use supported schema version"
        );
        corpus
    })
}

/// The corpus artifact is deterministic and checked into the desktop build;
/// runtime never reaches back into a user's vault path. A clone lets callers
/// safely combine source-derived bodies with an independent local revision.
pub(crate) fn document_for_slug(slug: &str) -> Option<CompiledDocument> {
    corpus()
        .documents
        .iter()
        .find(|document| document.slug == slug)
        .cloned()
}

pub(crate) fn source_coordinates_for_slug(slug: &str) -> Option<Vec<String>> {
    corpus()
        .documents
        .iter()
        .find(|document| document.slug == slug)
        .map(|document| document.source_coordinates.clone())
}
