// apps/desktop/src-tauri/tests/support/mod.rs
use neo4rs::query;
use research_canvas_desktop_lib::db::neo4j::{self, config::Neo4jConfig, SharedGraph};

const REQUIRED_TEST_INSTANCE: &str = "antichrist-neo4j-integration";
const DEVELOPMENT_BOLT_PORT: u16 = 17687;
const SENTINEL_IDENTITY: &str = "antichrist-graph-integration-test";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Neo4jTestConfig {
    pub uri: String,
    pub instance: String,
    pub user: String,
    pub password: String,
    pub database: String,
    pub run_namespace: String,
    pub sentinel_token: String,
}

impl Neo4jTestConfig {
    pub fn from_process_env() -> Result<Self, String> {
        Self::from_values(
            std::env::var("NEO4J_TEST_URI").ok().as_deref(),
            std::env::var("NEO4J_TEST_INSTANCE").ok().as_deref(),
            std::env::var("NEO4J_TEST_USER").ok().as_deref(),
            std::env::var("NEO4J_TEST_PASSWORD").ok().as_deref(),
            std::env::var("NEO4J_TEST_DATABASE").ok().as_deref(),
            std::env::var("NEO4J_TEST_RUN_NAMESPACE").ok().as_deref(),
            std::env::var("NEO4J_TEST_SENTINEL_TOKEN").ok().as_deref(),
        )
    }

    pub fn from_values(
        uri: Option<&str>,
        instance: Option<&str>,
        user: Option<&str>,
        password: Option<&str>,
        database: Option<&str>,
        run_namespace: Option<&str>,
        sentinel_token: Option<&str>,
    ) -> Result<Self, String> {
        let required = |name: &str, value: Option<&str>| {
            value
                .filter(|value| !value.trim().is_empty())
                .map(str::to_owned)
                .ok_or_else(|| {
                    format!(
                        "{name} is required for graph integration tests; run `pnpm test:graph:integration`"
                    )
                })
        };

        let uri = required("NEO4J_TEST_URI", uri)?;
        validate_test_uri(&uri)?;

        let instance = required("NEO4J_TEST_INSTANCE", instance)?;
        if instance != REQUIRED_TEST_INSTANCE {
            return Err(format!(
                "refusing unrecognised Neo4j instance {instance:?}; expected {REQUIRED_TEST_INSTANCE:?}"
            ));
        }

        let database = required("NEO4J_TEST_DATABASE", database)?;
        if matches!(
            database.to_ascii_lowercase().as_str(),
            "dev" | "development"
        ) {
            return Err(format!(
                "refusing development database {database:?}; use the dedicated Community test instance's `neo4j` database"
            ));
        }

        let run_namespace = required("NEO4J_TEST_RUN_NAMESPACE", run_namespace)?;
        if !run_namespace
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        {
            return Err(
                "NEO4J_TEST_RUN_NAMESPACE may contain only ASCII letters, digits, '-' and '_'"
                    .to_string(),
            );
        }

        let sentinel_token = required("NEO4J_TEST_SENTINEL_TOKEN", sentinel_token)?;
        if sentinel_token.len() != 64
            || !sentinel_token.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(
                "NEO4J_TEST_SENTINEL_TOKEN must be a 64-character hexadecimal wrapper token"
                    .to_string(),
            );
        }

        Ok(Self {
            uri,
            instance,
            user: required("NEO4J_TEST_USER", user)?,
            password: required("NEO4J_TEST_PASSWORD", password)?,
            database,
            run_namespace,
            sentinel_token,
        })
    }
}

fn validate_test_uri(uri: &str) -> Result<(), String> {
    let authority = uri.strip_prefix("bolt://").ok_or_else(|| {
        format!("refusing Neo4j test URI {uri:?}; only the bolt:// scheme is approved")
    })?;
    if authority.contains(['@', '/', '?', '#']) {
        return Err(format!(
            "refusing Neo4j test URI {uri:?}; credentials, paths, queries and fragments are not allowed"
        ));
    }

    let (host, raw_port) = if let Some(ipv6) = authority.strip_prefix('[') {
        let (host, raw_port) = ipv6.split_once("]:").ok_or_else(|| {
            format!("refusing Neo4j test URI {uri:?}; an explicit Bolt port is required")
        })?;
        (host, raw_port)
    } else {
        let (host, raw_port) = authority.rsplit_once(':').ok_or_else(|| {
            format!("refusing Neo4j test URI {uri:?}; an explicit Bolt port is required")
        })?;
        if host.contains(':') {
            return Err(format!(
                "refusing Neo4j test URI {uri:?}; IPv6 loopback must use bracket notation"
            ));
        }
        (host, raw_port)
    };

    if !matches!(host, "127.0.0.1" | "::1") {
        return Err(format!(
            "refusing Neo4j test URI {uri:?}; only numeric loopback hosts are allowed"
        ));
    }
    let port = raw_port.parse::<u16>().map_err(|_| {
        format!("refusing Neo4j test URI {uri:?}; the explicit Bolt port is invalid")
    })?;
    if port == 0 {
        return Err(format!(
            "refusing Neo4j test URI {uri:?}; the explicit Bolt port must be non-zero"
        ));
    }
    if port == DEVELOPMENT_BOLT_PORT {
        return Err(format!(
            "refusing development Neo4j endpoint {uri}; graph tests require the dedicated test container"
        ));
    }
    Ok(())
}

/// Connect to the required dedicated Neo4j integration instance.
///
/// Unlike the old optional fixture, this fails closed when the dedicated
/// configuration is absent or points at the persistent development service.
pub fn neo4j_test_graph() -> (SharedGraph, String, String) {
    let test_config = Neo4jTestConfig::from_process_env()
        .unwrap_or_else(|error| panic!("graph integration fixture unavailable: {error}"));
    let config = Neo4jConfig {
        uri: test_config.uri,
        user: test_config.user,
        password: test_config.password,
        database: test_config.database,
    };
    let database = config.database.clone();
    let graph = block_on(neo4j::connect(&config)).unwrap_or_else(|error| {
        panic!("connect to required dedicated Neo4j integration instance failed: {error}")
    });
    verify_server_identity(&graph, &database, &test_config.sentinel_token)
        .unwrap_or_else(|error| panic!("graph integration server identity check failed: {error}"));
    let run_id = format!("{}:{}", test_config.run_namespace, uuid::Uuid::new_v4());
    (graph, run_id, database)
}

/// Verify that this server contains the unguessable sentinel written by the
/// wrapper after starting its disposable container.
pub fn verify_server_identity(
    graph: &SharedGraph,
    database: &str,
    expected_token: &str,
) -> Result<(), String> {
    let tokens = block_on(async {
        let mut rows = graph
            .execute_on(
                database,
                query(
                    "MATCH (sentinel:GraphTestHarnessIdentity {identity: $identity}) \
                     RETURN collect(sentinel.token) AS tokens",
                )
                .param("identity", SENTINEL_IDENTITY),
            )
            .await
            .map_err(|error| format!("sentinel lookup failed: {error}"))?;
        let row = rows
            .next()
            .await
            .map_err(|error| format!("sentinel row failed: {error}"))?
            .ok_or_else(|| "sentinel lookup returned no row".to_string())?;
        row.get::<Vec<String>>("tokens")
            .map_err(|error| format!("sentinel token decode failed: {error}"))
    })?;

    if tokens != [expected_token.to_string()] {
        return Err(
            "sentinel missing or mismatched; refusing to mutate this Neo4j server".to_string(),
        );
    }
    Ok(())
}

/// Delete only graph data whose stable identifier belongs to this test run.
/// Returns the number of deleted nodes so callers can assert teardown behavior.
#[allow(dead_code)]
pub fn cleanup_run_namespace(graph: &SharedGraph, database: &str, run_id: &str) -> i64 {
    block_on(async {
        let mut rows = graph
            .execute_on(
                database,
                query(
                    "MATCH (n) WHERE n.graph_node_id STARTS WITH $prefix \
                     WITH collect(n) AS doomed, count(n) AS removed \
                     FOREACH (node IN doomed | DETACH DELETE node) \
                     RETURN removed",
                )
                .param("prefix", format!("{run_id}:")),
            )
            .await
            .expect("namespace-bounded graph cleanup query");
        rows.next()
            .await
            .expect("namespace cleanup row")
            .expect("namespace cleanup result")
            .get::<i64>("removed")
            .expect("namespace cleanup count")
    })
}

/// Block on a future using a fresh current-thread runtime (enable_all for bolt I/O).
pub fn block_on<F: std::future::Future>(fut: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio rt")
        .block_on(fut)
}
