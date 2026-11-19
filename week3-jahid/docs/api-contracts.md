# ST-65 — Proposed API contracts
The original team application already exposes /api/auth/register, /api/auth/login and /api/auth/otp. Coordinate exact payloads and response shapes with the backend owner before integration.
## Standalone demonstration (ST-66/ST-67)
POST /api/sample/register-validation
Request: {"name":"Student","email":"student@example.com","password":"safePassword123","role":"student"}
200: {"valid":true,"message":"Input format accepted; no account created"}
400: {"error":{"code":"VALIDATION_ERROR","message":"Invalid input","details":{"email":"Valid email required"}}}
POST /api/sample/login-validation
Request: {"email":"student@example.com","password":"password"}
200: same validation-only success response; 400: same error envelope.
These sample endpoints do NOT store users, hash passwords, authenticate, send OTPs or establish sessions. Never send real passwords to the demonstration server.
