import { DsqlSigner } from "@aws-sdk/dsql-signer"
import pg from "pg"

export type Sql = { query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> }
export type Conn = Sql & { release(): void }
export type Pool = { connect(): Promise<Conn> } & Sql

export function dsqlPool(endpoint: string, region: string): Pool {
  const signer = new DsqlSigner({ hostname: endpoint, region })
  return new pg.Pool({
    host: endpoint,
    port: 5432,
    user: "admin",
    database: "postgres",
    ssl: { rejectUnauthorized: true },
    password: () => signer.getDbConnectAdminAuthToken(),
    max: 20,
    idleTimeoutMillis: 30_000,
  })
}
