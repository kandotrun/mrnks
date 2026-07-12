-- Fail closed if an older Worker version is rolled back after indefinite trash ships.
-- The legacy hard-delete Worker inserts into this table before deleting media rows;
-- removing it makes that atomic batch fail before any metadata or storage can be deleted.
DROP TABLE IF EXISTS media_deletion_jobs;
