export async function createBranchAndQuery(neon, sql) {
  await neon.createBranch();
  return sql`select * from users limit 1`;
}
