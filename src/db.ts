/** The embedded Relate engine, opened once, plus a thin typed query helper. */

import init, { RelateDb } from '@relate/relate-wasm';
import wasmUrl from '@relate/relate-wasm/relate_bg.wasm?url';

export type Row = Record<string, unknown>;

export interface Envelope {
  columns: string[];
  rows: Row[];
  error?: string | null;
}

export interface Db {
  run(cypher: string, params?: Record<string, unknown>): Envelope;
  script(source: string): void;
}

let opening: Promise<Db> | null = null;

export function openDb(): Promise<Db> {
  opening ??= (async () => {
    await init(wasmUrl);
    const raw = new RelateDb();
    const run: Db['run'] = (cypher, params) => {
      const envelope = JSON.parse(raw.execute(cypher, params ? JSON.stringify(params) : null)) as Envelope;
      if (envelope.error) throw new Error(envelope.error);
      return envelope;
    };
    const db: Db = {
      run,
      script(source) {
        for (const statement of source.split(';').map((part) => part.trim()).filter(Boolean)) run(statement);
      },
    };
    db.script(`
      CREATE INDEX work_id IF NOT EXISTS FOR (n:Work) ON (n.id);
      CREATE INDEX work_year IF NOT EXISTS FOR (n:Work) ON (n.year)
    `);
    return db;
  })();
  return opening;
}
