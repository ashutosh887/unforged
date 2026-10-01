import schema from "../db/schema.sql"
import { pool } from "./http.js"

type Job = { job_id: string; status: string; details: string | null; object_name: string }

export async function handler(): Promise<{ applied: number; jobs: Job[] }> {
  const statements = schema.split(";").map((s) => s.trim()).filter(Boolean)
  const jobIds: string[] = []
  for (const statement of statements) {
    const { rows } = await pool().query<{ job_id?: string }>(statement)
    if (rows[0]?.job_id) jobIds.push(rows[0].job_id)
  }
  for (const id of jobIds) await pool().query("CALL sys.wait_for_job($1)", [id])
  const { rows: jobs } = jobIds.length
    ? await pool().query<Job>("SELECT job_id, status, details, object_name FROM sys.jobs WHERE job_id = ANY($1)", [jobIds])
    : { rows: [] as Job[] }
  const failed = jobs.filter((j) => j.status !== "completed")
  if (failed.length) throw new Error(`Index builds did not complete: ${failed.map((j) => `${j.object_name} ${j.status} ${j.details ?? ""}`).join("; ")}`)
  return { applied: statements.length, jobs }
}
