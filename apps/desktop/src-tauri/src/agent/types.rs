use crate::agent::markdown::MarkdownHeading;
use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::Map;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum AgentEnvelope<T> {
    Success(AgentSuccessEnvelope<T>),
    Error(AgentFailureEnvelope),
}

impl<T> AgentEnvelope<T> {
    pub fn success(command: impl Into<String>, data: T) -> Self {
        Self::Success(AgentSuccessEnvelope {
            ok: true,
            command: command.into(),
            warnings: Vec::new(),
            data,
        })
    }

    pub fn success_with_warnings(
        command: impl Into<String>,
        data: T,
        warnings: Vec<AgentWarning>,
    ) -> Self {
        Self::Success(AgentSuccessEnvelope {
            ok: true,
            command: command.into(),
            warnings,
            data,
        })
    }

    pub fn failure(
        command: impl Into<String>,
        error: impl Into<String>,
        warnings: Vec<AgentWarning>,
    ) -> Self {
        Self::Error(AgentFailureEnvelope {
            ok: false,
            command: command.into(),
            error: error.into(),
            warnings,
        })
    }

    pub fn with_warning(mut self, warning: AgentWarning) -> Self {
        match &mut self {
            Self::Success(envelope) => envelope.warnings.push(warning),
            Self::Error(envelope) => envelope.warnings.push(warning),
        }
        self
    }

    pub fn is_ok(&self) -> bool {
        matches!(self, Self::Success(_))
    }

    pub fn command(&self) -> &str {
        match self {
            Self::Success(envelope) => &envelope.command,
            Self::Error(envelope) => &envelope.command,
        }
    }

    pub fn warnings(&self) -> &[AgentWarning] {
        match self {
            Self::Success(envelope) => &envelope.warnings,
            Self::Error(envelope) => &envelope.warnings,
        }
    }

    pub fn data(&self) -> Option<&T> {
        match self {
            Self::Success(envelope) => Some(&envelope.data),
            Self::Error(_) => None,
        }
    }

    pub fn into_data(self) -> Option<T> {
        match self {
            Self::Success(envelope) => Some(envelope.data),
            Self::Error(_) => None,
        }
    }

    pub fn error(&self) -> Option<&str> {
        match self {
            Self::Success(_) => None,
            Self::Error(envelope) => Some(&envelope.error),
        }
    }
}

impl<'de, T> Deserialize<'de> for AgentEnvelope<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum RawEnvelope<T> {
            Success(AgentSuccessEnvelope<T>),
            Error(AgentFailureEnvelope),
        }

        match RawEnvelope::deserialize(deserializer)? {
            RawEnvelope::Success(envelope) if envelope.ok => Ok(Self::Success(envelope)),
            RawEnvelope::Success(_) => Err(de::Error::custom(
                "success agent envelope must serialize ok as true",
            )),
            RawEnvelope::Error(envelope) if !envelope.ok => Ok(Self::Error(envelope)),
            RawEnvelope::Error(_) => Err(de::Error::custom(
                "error agent envelope must serialize ok as false",
            )),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentSuccessEnvelope<T> {
    ok: bool,
    command: String,
    #[serde(default)]
    warnings: Vec<AgentWarning>,
    data: T,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentFailureEnvelope {
    ok: bool,
    command: String,
    error: String,
    #[serde(default)]
    warnings: Vec<AgentWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWarning {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiLink {
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub source_path: String,
    pub byte_start: usize,
    pub byte_end: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDocument {
    pub path: String,
    #[serde(default)]
    pub absolute_path: String,
    #[serde(default)]
    pub root_path: String,
    #[serde(default)]
    pub relative_path: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub headings: Vec<MarkdownHeading>,
    #[serde(default)]
    pub wikilinks: Vec<WikiLink>,
    #[serde(default, deserialize_with = "deserialize_frontmatter")]
    pub frontmatter: Map<String, serde_json::Value>,
    #[serde(default)]
    pub size_bytes: u64,
    #[serde(default)]
    pub snippet: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContextPack {
    pub project_id: String,
    pub query: String,
    #[serde(default)]
    pub documents: Vec<VaultDocument>,
    #[serde(default)]
    pub search_hits: Vec<AgentSearchHit>,
    #[serde(default)]
    pub warnings: Vec<AgentWarning>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSearchHit {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
    #[serde(default)]
    pub match_ranges: Vec<ByteRange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByteRange {
    pub byte_start: usize,
    pub byte_end: usize,
}

fn deserialize_frontmatter<'de, D>(
    deserializer: D,
) -> Result<Map<String, serde_json::Value>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<Map<String, serde_json::Value>>::deserialize(deserializer)
        .map(|frontmatter| frontmatter.unwrap_or_default())
}
