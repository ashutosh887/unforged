import schema from "../db/schema.sql"
import { pool } from "./http.js"

export async function handler(): Promise<{ applied: number }> {
  const statements = schema.split(";").map((s) => s.trim()).filter(Boolean)
  for (const statement of statements) await pool().query(statement)
  return { applied: statements.length }
}
