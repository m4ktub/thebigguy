CREATE TABLE IF NOT EXISTS p2sh (
  hash text PRIMARY KEY,
  fee integer,
  address text,
  registered_date integer,
  auto_spend integer default FALSE
);

CREATE TABLE IF NOT EXISTS shares (
  hash text,
  share integer,
  address text,
  PRIMARY key (hash, share, address)
);
