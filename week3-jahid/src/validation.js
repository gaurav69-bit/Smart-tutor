const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateRegistration(input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: { body: 'Expected an object' } };
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) errors.name = 'Name must be 1-100 characters';
  if (typeof input.email !== 'string' || input.email.length > 200 || !emailPattern.test(input.email)) errors.email = 'Valid email required';
  if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) errors.password = 'Password must be 8-128 characters';
  if (!['student', 'tutor'].includes(input.role)) errors.role = 'Role must be student or tutor';
  return { valid: Object.keys(errors).length === 0, errors };
}
export function validateLogin(input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: { body: 'Expected an object' } };
  if (typeof input.email !== 'string' || input.email.length > 200 || !emailPattern.test(input.email)) errors.email = 'Valid email required';
  if (typeof input.password !== 'string' || !input.password.length) errors.password = 'Password required';
  return { valid: Object.keys(errors).length === 0, errors };
}
