# @rudyrustam/auth

Zero-dependency authentication, RBAC/ReBAC access control, FIDO2/WebAuthn Passkeys challenge manager, and Mandatory Legal & Privacy Trio compliance plugin for the Centaury Framework.

## Features
- **Web Crypto HMAC-SHA256 Tokens**: Stateless JWT signing & verification (`signToken`, `verifyToken`).
- **PBKDF2 Password Hashing**: Per-user salted `PBKDF2-SHA256` hashing with constant-time comparison (`hashPassword`, `verifyPassword`).
- **RBAC & ReBAC Access Control**: Role permissions + relationship tuples (`CentauryAccessControl`) and bearer middleware (`createAuthMiddleware`).
- **FIDO2 / WebAuthn Passkeys**: TTL-enforced registration and authentication challenge verification (`CentauryPasskeyManager`).
- **Legal & Privacy Trio Plugin**: Ready-to-serve `/privacy`, `/terms`, `/delete-account`, and `POST /api/compliance/delete-account` endpoints compliant with UU PDP No. 27/2022, GDPR Art. 17, Apple App Store 5.1.1(v), and Google Play Data Safety.
