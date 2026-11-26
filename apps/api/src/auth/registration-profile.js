// Approval Pending: matches the proposed ST-141 payload in integration tests.
const sharedFields = { subject: 100 };
const roleFields = {
  student: { address: 300 },
  tutor: { qualifications: 1000, bio: 2000 }
};

function isBirthDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      value.startsWith('0000')) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10);
}

export function validateRegistrationProfile(input) {
  const role = input?.role;
  if (role !== 'student' && role !== 'tutor') {
    return { valid: false, errors: { role: 'Role must be student or tutor' } };
  }

  const errors = {};
  const profile = {};
  for (const [field, limit] of Object.entries({ ...sharedFields, ...roleFields[role] })) {
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (!value || value.length > limit) {
      errors[field] = `Enter 1–${limit} characters.`;
    } else {
      profile[field] = value;
    }
  }

  if (typeof input.username !== 'string' || !/^[a-zA-Z0-9_]{3,40}$/.test(input.username)) {
    errors.username = 'Use 3–40 letters, numbers or underscores.';
  } else {
    profile.username = input.username;
  }

  if (role === 'student') {
    if (isBirthDate(input.dob)) {
      profile.dob = input.dob;
    } else {
      errors.dob = 'Enter a valid date of birth.';
    }
  }

  if (input.terms !== true) errors.terms = 'Accept the terms and privacy policy.';
  if (Object.keys(errors).length) return { valid: false, errors };
  return { valid: true, profile: { ...profile, terms: true } };
}
