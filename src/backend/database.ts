import fs from 'fs';
import path from 'path';
import * as sqlite3 from 'sqlite3';

var database: sqlite3.Database | undefined = undefined;

export function open(callback?: (err: Error | null) => void) {
  // open or create database
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../etc/database/contracts.db');
  database = new sqlite3.Database(dbPath, callback);

  // initialize schema
  const schemaPath = path.join(__dirname, '../../etc/database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema, callback);
}

export function close(callback?: (err: Error | null) => void) {
  // check if there's a database open
  if (!database) {
    return;
  }

  // close and unset global
  database.close(callback)
  database = undefined;
}
