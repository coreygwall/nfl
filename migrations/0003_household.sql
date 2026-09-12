-- One phone, several players: the commissioner can put a family member's name on their own
-- device, and every pick records the device that wrote it so that stays visible.
-- Statements run one at a time; "duplicate column name" is treated as already-applied.

ALTER TABLE devices ADD COLUMN issued_by TEXT NOT NULL DEFAULT 'self';

ALTER TABLE picks ADD COLUMN device_id TEXT;
