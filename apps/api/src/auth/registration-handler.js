import { validateRegistration } from '../../../../week3-jahid/src/validation.js';
import { prepareRegistration } from './registration.js';

// Transport layer only. The persistence implementation is owned by ST-106.
// A configured registerAccount must atomically persist the account and enforce uniqueness.
export function registrationHandler(registerAccount, validateProfileAndConsent) {
  return async (req, res) => {
    const validation = validateRegistration(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: validation.errors }
      });
    }

    // Do not accept an account until the role-specific profile and consent
    // contract is supplied by the registration/API owners.
    if (typeof registerAccount !== 'function' || typeof validateProfileAndConsent !== 'function') {
      return res.status(503).json({
        error: { code: 'REGISTRATION_UNAVAILABLE', message: 'Registration is not yet available' }
      });
    }

    // Validation implementations may be asynchronous (for example, when
    // checking agreed role-specific rules). Always await before persistence.
    const profileValidation = await validateProfileAndConsent(req.body);
    if (!profileValidation?.valid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: profileValidation?.errors ?? { profile: 'Profile and consent required' }
        }
      });
    }

    try {
      const prepared = await prepareRegistration(req.body);
      // Only pass validated, explicitly selected profile values to persistence.
      // Never forward the raw request, which contains the plaintext password.
      const account = await registerAccount(prepared.account, profileValidation.profile ?? {});
      if (!account || !account.id) {
        throw new Error('Registration persistence did not return an account identifier');
      }
      // Never return the internal password hash or any security token.
      return res.status(201).json({
        account: {
          id: account.id,
          name: account.name,
          email: account.email,
          role: account.role,
          verified: false
        }
      });
    } catch (err) {
      if (err?.code === 'DUPLICATE_EMAIL' || err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({
          error: { code: 'DUPLICATE_EMAIL', message: 'Email already registered' }
        });
      }
      // Let the existing Express error handler return a generic safe error.
      throw err;
    }
  };
}
