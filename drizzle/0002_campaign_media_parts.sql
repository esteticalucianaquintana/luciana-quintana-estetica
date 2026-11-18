CREATE TABLE campaign_media_parts (
  campaign_id TEXT NOT NULL,
  part INTEGER NOT NULL CHECK(part BETWEEN 0 AND 49),
  data TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 1048576),
  expires INTEGER,
  PRIMARY KEY(campaign_id, part)
);
CREATE INDEX campaign_media_expiration ON campaign_media_parts(expires) WHERE expires IS NOT NULL;
