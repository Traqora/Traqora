# GDPR Compliance Assessment

Traqora is designed with privacy-by-design principles to ensure compliance with the General Data Protection Regulation (GDPR).

## 1. Data Controller and Processor
- **Data Controller**: Traqora Team
- **Data Processor**: AWS/Google Cloud (Hosting), Stripe (Payments), Redis (Rate limiting)

## 2. Lawful Basis for Processing
We process personal data under the following lawful bases:
- **Contractual Necessity**: Processing is necessary to fulfill flight bookings.
- **Legitimate Interests**: Security monitoring, rate limiting, and service improvement.
- **Consent**: For optional communication (if applicable).

## 3. Data Subject Rights
Traqora supports the following GDPR rights:
- **Right to be Informed**: Provided via `PRIVACY.md`.
- **Right of Access**: Users can request a copy of their stored data.
- **Right to Erasure (Right to be Forgotten)**: Users can request deletion of their account and PII.
- **Right to Data Portability**: Users can request their data in a machine-readable format.

## 4. Security Measures (Art. 32 GDPR)
- **Encryption at Rest**: All PII (Name, Email, Phone) is encrypted using AES-256-GCM.
- **Encryption in Transit**: All API communication is forced over TLS (HTTPS).
- **Rate Limiting**: Protection against brute-force and DDoS attacks.
- **Access Control**: Role-based access control (RBAC) for admin functions.

## 5. Data Protection Impact Assessment (DPIA)
Given that Traqora processes payment info (via Stripe) and identity info for travel, a DPIA is maintained to identify and mitigate risks.

## 6. Data Breach Notification
In accordance with Art. 33, any significant data breach will be reported to the relevant supervisory authority within 72 hours of becoming aware of it.

## 7. International Data Transfers
Data stored on the Stellar blockchain is distributed globally. Users are informed of the public nature of blockchain transactions.
