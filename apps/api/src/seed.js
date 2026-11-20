export const syntheticUsers = Object.freeze([
  { name: 'Example Student', email: 'student@example.test', role: 'student' },
  { name: 'Example Tutor', email: 'tutor@example.test', role: 'tutor' }
]);

export function seed(db) {
  const statement = db.prepare('INSERT OR IGNORE INTO users (name, email, role) VALUES (@name, @email, @role)');
  return db.transaction(() => syntheticUsers.reduce((count, user) => count + statement.run(user).changes, 0))();
}
