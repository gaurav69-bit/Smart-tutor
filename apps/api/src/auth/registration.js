import { validateRegistration } from '../../../../week3-jahid/src/validation.js';
import { hashPassword } from './password.js';

export async function prepareRegistration(input) {
  const result = validateRegistration(input);

  if (!result.valid) {
    return { valid: false, errors: result.errors };
  }

  const passwordHash = await hashPassword(input.password);

  return {
    valid: true,
    account: {
      name: input.name.trim(),
      email: input.email.toLowerCase(),
      role: input.role,
      passwordHash
    }
  };
}
