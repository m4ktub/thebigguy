import fs from 'fs';
import path from 'path';
import * as sqlite3 from 'sqlite3';
import type { Party } from 'thebigguy-contract';

//
// useful types
//

type SQLiteCallback<T> = (error: Error | null, value?: T) => void;

//
// other utilities
//

function resolveReject<T>(resolve: (value: T) => void, reject: (reason?: any) => void): SQLiteCallback<T> {
  return (error: Error | null, value?: T) => {
    if (error) {
      reject(error);
    } else {
      resolve(value as T);
    }
  };
}

function promisify<T>(block: (callback: SQLiteCallback<T>) => void) {
  return new Promise<T>((resolve, reject) => block(resolveReject(resolve, reject)));
}

//
// connection pooling
//

var pool: Array<sqlite3.Database> = [];

function open(callback?: SQLiteCallback<undefined>) {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../etc/database/contracts.db');
  return new sqlite3.Database(dbPath, callback);
}

function acquire() {
  return new Promise<sqlite3.Database>((resolve, reject) => {
    const existing = pool.shift();
    if (existing) {
      // resolve with existing instance
      resolve(existing);
    } else {
      // open new connection
      promisify<sqlite3.Database>(callback => {
        const db = open(resolveReject(() => callback(null, db), callback));
      }).then(resolve, reject);
    }
  });
}

function release(database: sqlite3.Database) {
  pool.push(database);
}

function clear() {
  // reset pool
  const current = pool;
  pool = [];

  // request close from all databases
  const closing = current.map(db => new Promise(resolve => {
    db.close(resolve);
  }));


  // wait for close and check errors
  return Promise.allSettled(closing).then(values => {
    // throw first error or simply resolve
    const error = values.find(v => v.status == "rejected");
    if (error) {
      throw error.reason;
    }
  });
}

//
// utility functions to deal with pool and callbacks
//

async function withDatabase<T>(block: (database: sqlite3.Database) => Promise<T>): Promise<T> {
  const db = await acquire();
  return block(db).finally(() => release(db));
}

//
// api
//

export function initialize() {
  return withDatabase(database => {
    const schemaPath = path.join(__dirname, '../../etc/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    return promisify(callback => database.exec(schema, callback));
  });
}

export function finalize() {
  return clear();
}

async function transaction<T>(database: sqlite3.Database, body: (database: sqlite3.Database) => Promise<T>) {
  // start transaction
  await promisify(cb => database.run("begin transaction", cb));

  try {
    // execute body that may throw
    let result = await body(database);

    // commit and return
    await promisify(cb => database.run("commit", cb));
    return result;
  } catch (ex) {
    // rollback and propagate
    await promisify(cb => database.run("rollback", cb));
    throw ex;
  }
}

export interface DbContract {
  hash: string,
  address: string,
  fee: number,
  registeredDate?: Date,
  parties: Party[],
  store: boolean,
  autoSpend: boolean
}

export function storeContract(contract: DbContract) {
  return withDatabase(async database => {
    // check existing contract
    const row = await promisify(cb => database.get("select 1 from p2sh where hash = ?", [contract.hash], cb));

    // resolve promise negatively, if row exists
    if (row) {
      return false;
    }

    // insert new contract in a transaction
    return await transaction(database, async database => {
      // start insert querties
      const unixTime = Math.floor(Date.now() / 1000);
      const p2shQuery = "insert into p2sh (hash, address, fee, registered_date, auto_spend) values (?, ?, ?, ?, ?)";
      const p2shValues = [contract.hash, contract.address, contract.fee, unixTime, contract.autoSpend];
      const insertContract = promisify(cb => database.run(p2shQuery, p2shValues, cb));

      const insertShares = contract.parties.map((party, position) => {
        const sharesQuery = "insert into shares (hash, position, address, share) values (?, ?, ?, ?)";
        const sharesValues = [contract.hash, position, party.address, party.share];
        return promisify(cb => database.run(sharesQuery, sharesValues, cb));
      });

      // wait for all parallel queries to complete
      const results = await Promise.allSettled([insertContract, ...insertShares]);

      // find and throw first error, if something failed
      const error = results.find(result => result.status == "rejected");
      if (error) {
        throw error.reason;
      }

      // resolve promise positively, to indicate success
      return true;
    });
  });
}

export function loadContract(hash: string) {
  return withDatabase<DbContract | undefined>(async database => {
    // get contract row
    const p2shRow = await promisify(cb =>
      database.get("select * from p2sh where hash = ?", [hash], cb));

    // resolve missing row as undefined contract
    if (!p2shRow) {
      return undefined;
    }

    // get share rows
    const shareRows = await promisify<any[]>(cb =>
      database.all("select * from shares where hash = ? order by position asc", [hash], cb));

    // consider missing shares as error
    if (!shareRows || !shareRows.length) {
      throw new Error(`Missing parties for contract ${hash}`);
    }

    // create db result from row
    const p2shRecord = p2shRow as Record<string, any>;
    const shareRecords = shareRows as Array<Record<string, any>>

    return {
      hash,
      address: p2shRecord.address as string,
      fee: p2shRecord.fee as number,
      registeredDate: new Date(1000 * (p2shRecord.registered_date as number)),
      store: true,
      autoSpend: p2shRecord.auto_spend !== 0,
      parties: shareRecords.map(share => {
        return {
          address: share.address as string,
          share: share.share as number
        };
      })
    };
  });
}

export function getAutoSpendContracts() {
  return withDatabase(async database => {
    const rows = await promisify<any[]>(cb =>
      database.all("select hash from p2sh where auto_spend = 1", [], cb));
    return rows.map(row => row.hash as string);
  });
}
