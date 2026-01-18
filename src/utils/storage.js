// === DB delete helpers ===
// pool — это pg.Pool

export async function deleteUserDataFromDB(pool, userId) {
  if (!pool) throw new Error("deleteUserDataFromDB: pool is required");
  if (!userId) throw new Error("deleteUserDataFromDB: userId is required");

  const TABLES_TO_CLEAN = [
    "free_usage",
    "error_reports",
    "user_consents",
    "user_profiles",
    "user_sessions",
    "user_limits",
    "user_photos",
    "pdf_reports",
    "generations",
    "payments",
  ];

  for (const table of TABLES_TO_CLEAN) {
    try {
      await pool.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    } catch (e) {
      const msg = String(e?.message || "");
      if (!msg.includes("does not exist")) {
        console.warn(`⚠️ deleteUserDataFromDB: table=${table} err=${msg}`);
      }
    }
  }
}
