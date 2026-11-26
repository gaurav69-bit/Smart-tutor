import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRegistrationProfile } from './registration-profile.js';

const shared = { username: 'test_user', subject: 'Mathematics', terms: true };
const student = { ...shared, role: 'student', dob: '2000-02-29', address: 'Test address' };
const tutor = { ...shared, role: 'tutor', qualifications: 'Test qualifications', bio: 'Test bio' };

test('selects only validated student or tutor fields', () => {
  assert.deepEqual(validateRegistrationProfile({ ...student, bio: 'Ignored', password: 'Ignored' }), {
    valid: true, profile: { ...shared, dob: student.dob, address: student.address }
  });
  assert.deepEqual(validateRegistrationProfile({ ...tutor, address: 'Ignored', termsVersion: 'Ignored' }), {
    valid: true, profile: { ...shared, qualifications: tutor.qualifications, bio: tutor.bio }
  });
});

test('rejects invalid dates, missing fields and non-boolean consent with safe field errors', () => {
  const result = validateRegistrationProfile({
    ...student, username: 'bad name', subject: ' ', address: '', dob: '2001-02-29', terms: 'true'
  });
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['address', 'dob', 'subject', 'terms', 'username']);
  assert.equal(result.profile, undefined);
  assert.equal(validateRegistrationProfile({ ...student, dob: '2999-01-01' }).valid, false);
  assert.equal(validateRegistrationProfile({ ...tutor, qualifications: 'x'.repeat(1001) }).valid, false);
  assert.equal(validateRegistrationProfile({ ...tutor, role: 'admin' }).valid, false);
});
