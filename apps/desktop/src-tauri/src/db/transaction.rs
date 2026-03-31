use rusqlite::{Connection, Result};

pub(crate) struct TransactionGuard<'conn> {
    connection: &'conn Connection,
    committed: bool,
}

impl<'conn> TransactionGuard<'conn> {
    pub(crate) fn begin(connection: &'conn Connection) -> Result<Self> {
        connection.execute_batch("BEGIN IMMEDIATE TRANSACTION;")?;
        Ok(Self {
            connection,
            committed: false,
        })
    }

    pub(crate) fn commit(mut self) -> Result<()> {
        self.connection.execute_batch("COMMIT;")?;
        self.committed = true;
        Ok(())
    }
}

impl Drop for TransactionGuard<'_> {
    fn drop(&mut self) {
        if !self.committed {
            let _ = self.connection.execute_batch("ROLLBACK;");
        }
    }
}
