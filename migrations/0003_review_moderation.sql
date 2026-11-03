-- Moderation safety for member reports.
-- One review report per member prevents accidental duplicate submissions.
-- The same member may report a different review or different content type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_review_report
ON content_reports(reporter_id, content_type, content_id)
WHERE content_type = 'review';

CREATE INDEX IF NOT EXISTS idx_review_report_queue
ON content_reports(state, created_at);
