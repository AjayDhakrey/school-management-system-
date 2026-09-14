import "dotenv/config";
import pg from "pg";

const base = process.env.FEES_TEST_API_URL ?? "http://localhost:43140/api";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});
const result = await pool.query(`
  SELECT r.id, r.receipt_no, r.school_id
  FROM fee_receipts r
  JOIN fees f ON f.id=r.fee_id
  JOIN fee_structures fs ON fs.id=f.fee_structure_id
  WHERE fs.fee_type LIKE 'Step7 Tuition %'
  ORDER BY r.created_at DESC
  LIMIT 1
`);
await pool.end();
if (result.rowCount !== 1) throw new Error("No Step 7 receipt persisted in Supabase");
const receipt = result.rows[0];
console.log(`PASS Step 7 receipt exists directly in Supabase (${receipt.receipt_no})`);

if (process.argv.includes("--api")) {
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "everbright.admin@example.com", password: "password123" }),
  });
  if (!login.ok) throw new Error("Persistence login failed after restart");
  const { token } = await login.json();
  const response = await fetch(`${base}/fees/receipts/${receipt.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  if (!response.ok || body.id !== receipt.id || body.receipt_no !== receipt.receipt_no)
    throw new Error("Persisted receipt was not retrievable through the API after restart");
  console.log("PASS Step 7 receipt retrieved through API after backend restart");
}
