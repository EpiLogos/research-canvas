use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::error::{RepositoryError, RepositoryResult};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeAttachment {
    pub id: String,
    pub graph_node_id: String,
    pub managed_path: String,
    pub original_filename: String,
    pub mime_type: String,
    pub kind: String,
    pub content_hash: String,
    pub caption: String,
    /// The first role that introduced this identity. All current roles are
    /// read from `node_attachment_usage`; retaining this field keeps old
    /// consumers and exports able to render a single primary role.
    pub role: String,
    pub provenance_source_path: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct NodeAttachmentRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> NodeAttachmentRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn find_by_content_identity(
        &self,
        graph_node_id: &str,
        content_hash: &str,
    ) -> RepositoryResult<Option<NodeAttachment>> {
        self.connection
            .query_row(
                "SELECT id,graph_node_id,managed_path,original_filename,mime_type,kind,
                        content_hash,caption,role,provenance_source_path,created_at,updated_at
                 FROM node_attachment
                 WHERE graph_node_id=?1 AND content_hash=?2",
                params![graph_node_id, content_hash],
                node_attachment_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn get(&self, attachment_id: &str) -> RepositoryResult<Option<NodeAttachment>> {
        self.connection
            .query_row(
                "SELECT id,graph_node_id,managed_path,original_filename,mime_type,kind,
                        content_hash,caption,role,provenance_source_path,created_at,updated_at
                 FROM node_attachment WHERE id=?1",
                [attachment_id],
                node_attachment_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn insert(&self, attachment: &NodeAttachment) -> RepositoryResult<()> {
        validate_attachment(attachment)?;
        self.connection.execute(
            "INSERT INTO node_attachment(
               id,graph_node_id,managed_path,original_filename,mime_type,kind,content_hash,
               caption,role,provenance_source_path,created_at,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![
                attachment.id,
                attachment.graph_node_id,
                attachment.managed_path,
                attachment.original_filename,
                attachment.mime_type,
                attachment.kind,
                attachment.content_hash,
                attachment.caption,
                attachment.role,
                attachment.provenance_source_path,
                attachment.created_at,
                attachment.updated_at,
            ],
        )?;
        Ok(())
    }

    /// Idempotently marks the attachment as usable in a presentation role.
    /// A cover and an inline reference therefore share exactly one identity.
    pub fn ensure_usage(&self, attachment_id: &str, role: &str) -> RepositoryResult<()> {
        validate_role(role)?;
        self.connection.execute(
            "INSERT INTO node_attachment_usage(attachment_id,role) VALUES(?1,?2)
             ON CONFLICT(attachment_id,role) DO NOTHING",
            params![attachment_id, role],
        )?;
        Ok(())
    }

    pub fn usages(&self, attachment_id: &str) -> RepositoryResult<Vec<String>> {
        let mut statement = self.connection.prepare(
            "SELECT role FROM node_attachment_usage WHERE attachment_id=?1 ORDER BY role",
        )?;
        let rows = statement.query_map([attachment_id], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Returns every durable attachment path so the native attachment service
    /// can conservatively recover crash residue without touching bytes still
    /// referenced by SQLite.
    pub fn managed_paths(&self) -> RepositoryResult<Vec<String>> {
        let mut statement = self
            .connection
            .prepare("SELECT managed_path FROM node_attachment ORDER BY managed_path")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Select the image that represents this graph node outside any
    /// particular canvas. The caller normally already marked the role, but
    /// keeping that invariant here makes the durable selector safe for future
    /// entry points too.
    pub fn select_cover(
        &self,
        graph_node_id: &str,
        attachment_id: &str,
    ) -> RepositoryResult<NodeAttachment> {
        let attachment = self
            .get(attachment_id)?
            .ok_or_else(|| RepositoryError::Validation("cover attachment does not exist".into()))?;
        if attachment.graph_node_id != graph_node_id {
            return Err(RepositoryError::Validation(
                "cover attachment belongs to a different graph node".into(),
            ));
        }
        if attachment.kind != "image" {
            return Err(RepositoryError::Validation(
                "only image attachments can be selected as a cover".into(),
            ));
        }
        self.ensure_usage(attachment_id, "cover")?;
        self.connection.execute(
            "INSERT INTO node_attachment_presentation(graph_node_id, cover_attachment_id, updated_at)
             VALUES(?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
             ON CONFLICT(graph_node_id) DO UPDATE SET
               cover_attachment_id=excluded.cover_attachment_id,
               updated_at=excluded.updated_at",
            params![graph_node_id, attachment_id],
        )?;
        Ok(attachment)
    }

    pub fn selected_cover_for_node(
        &self,
        graph_node_id: &str,
    ) -> RepositoryResult<Option<NodeAttachment>> {
        self.connection
            .query_row(
                "SELECT a.id,a.graph_node_id,a.managed_path,a.original_filename,a.mime_type,a.kind,
                        a.content_hash,a.caption,a.role,a.provenance_source_path,a.created_at,a.updated_at
                 FROM node_attachment_presentation AS presentation
                 JOIN node_attachment AS a ON a.id = presentation.cover_attachment_id
                 JOIN node_attachment_usage AS usage
                   ON usage.attachment_id = a.id
                  AND usage.role = 'cover'
                 WHERE presentation.graph_node_id=?1
                   AND a.kind = 'image'",
                [graph_node_id],
                node_attachment_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn selected_covers(&self) -> RepositoryResult<Vec<NodeAttachment>> {
        let mut statement = self.connection.prepare(
            "SELECT a.id,a.graph_node_id,a.managed_path,a.original_filename,a.mime_type,a.kind,
                    a.content_hash,a.caption,a.role,a.provenance_source_path,a.created_at,a.updated_at
             FROM node_attachment_presentation AS presentation
             JOIN node_attachment AS a ON a.id = presentation.cover_attachment_id
             JOIN node_attachment_usage AS usage
               ON usage.attachment_id = a.id
              AND usage.role = 'cover'
             WHERE a.kind = 'image'",
        )?;
        let rows = statement.query_map([], node_attachment_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

fn validate_attachment(attachment: &NodeAttachment) -> RepositoryResult<()> {
    if attachment.id.trim().is_empty()
        || attachment.graph_node_id.trim().is_empty()
        || attachment.managed_path.trim().is_empty()
        || attachment.original_filename.trim().is_empty()
        || attachment.content_hash.trim().is_empty()
    {
        return Err(RepositoryError::Validation(
            "attachment identity, node, path, filename and content hash are required".into(),
        ));
    }
    if !attachment.managed_path.starts_with("assets/")
        || attachment.managed_path.contains("..")
        || attachment.managed_path.contains('\\')
    {
        return Err(RepositoryError::Validation(
            "attachment path must be a portable path below assets/".into(),
        ));
    }
    if !matches!(attachment.kind.as_str(), "image" | "file") {
        return Err(RepositoryError::Validation(
            "unknown attachment kind".into(),
        ));
    }
    if (attachment.kind == "image" && attachment.role == "file")
        || (attachment.kind == "file" && attachment.role != "file")
    {
        return Err(RepositoryError::Validation(
            "attachment kind and primary role are incompatible".into(),
        ));
    }
    validate_role(&attachment.role)
}

fn validate_role(role: &str) -> RepositoryResult<()> {
    if matches!(role, "inline" | "cover" | "file") {
        Ok(())
    } else {
        Err(RepositoryError::Validation(
            "unknown attachment role".into(),
        ))
    }
}

fn node_attachment_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NodeAttachment> {
    Ok(NodeAttachment {
        id: row.get(0)?,
        graph_node_id: row.get(1)?,
        managed_path: row.get(2)?,
        original_filename: row.get(3)?,
        mime_type: row.get(4)?,
        kind: row.get(5)?,
        content_hash: row.get(6)?,
        caption: row.get(7)?,
        role: row.get(8)?,
        provenance_source_path: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}
