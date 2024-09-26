CREATE TABLE IF NOT EXISTS p2sh (
  hash text PRIMARY KEY,
  fee integer,
  address text,
  registered_date integer,
  auto_spend integer default FALSE
);

CREATE TABLE IF NOT EXISTS shares (
  hash text,
  position integer,
  address text,
  share integer,
  PRIMARY key (hash, position, address)
);
