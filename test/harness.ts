import { Database } from '@relate/relate';

import type { Db } from '../src/db';

/** The same Cypher as the browser, run through the Node binding instead. */
export function nodeDb(): Db {
  const raw = Database.open(':memory:');
  const conn = raw.connect();
  const query = conn.query.bind(conn) as unknown as (
    cypher: string,
    params?: Record<string, unknown>,
  ) => unknown;
  const db = {
    run(cypher: string, params?: Record<string, unknown>) {
      return query(cypher, params ?? {}) as ReturnType<Db['run']>;
    },
    script(source: string) {
      for (const statement of source.split(';').map((part) => part.trim()).filter(Boolean)) db.run(statement);
    },
  };
  db.script(`
    CREATE INDEX work_id IF NOT EXISTS FOR (n:Work) ON (n.id);
    CREATE INDEX work_year IF NOT EXISTS FOR (n:Work) ON (n.year)
  `);
  return db as Db;
}
