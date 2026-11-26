// Persist only the role-specific profile selected by the server validator.
export async function saveRegistrationDetails(trx, userId, role, profile) {
  if (profile.terms !== true || !profile.username || !profile.subject) {
    throw new TypeError('Validated profile and terms acceptance required');
  }
  await trx('account_registration_details').insert({
    user_id: userId,
    username: profile.username.toLowerCase(),
    subject: profile.subject,
    date_of_birth: role === 'student' ? profile.dob : null,
    address: role === 'student' ? profile.address : null,
    qualifications: role === 'tutor' ? profile.qualifications : null,
    terms_version: 'smarttutor-terms-v1',
    terms_accepted_at: new Date()
  });
}
