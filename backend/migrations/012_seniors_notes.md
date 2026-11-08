# Users and seniors compatibility migration

Run `012_create_seniors_compatibility.sql` in the Supabase SQL editor, then run
`checks/012_verify_seniors_compatibility.sql`. The verification rolls back its test edits.
The migration is transactional and can be rerun. It has not been executed against the hosted database.

## Account fields

`users` keeps its existing ID, first/middle/last names, email, `password_hash`,
created_at, avatar_url, and role. It adds token, ip_address, and status (default Active).
Password hashes are retained; no plaintext password column is introduced.
Migration 014 adds session token issuance, seven-day expiry and logout revocation.
A successful password-only admin login or successful resident face verification/enrollment
stores a new token and the request IP. A new login rotates the previous token.
The frontend persists the token and validates it when restoring a session. Login is
required again for cached sessions created before token support. Profile responses do
not expose tokens. Existing application endpoint authorization is unchanged; this is
session lifecycle support, not an authorization rewrite for every API route.
Status remains a stored field; account-status enforcement is not added.

The backend records request.remote_addr. When behind a trusted reverse proxy that
strips/replaces forwarded headers, TRUST_PROXY_HEADERS=true uses X-Forwarded-For.
Leave it false for direct/LAN connections. With NAT, the recorded address may be a
shared public IP; a server cannot reliably discover a device's private Wi-Fi IP.
Migration 014 revokes direct users-table SELECT/UPDATE for anon/authenticated roles;
the existing app accesses accounts through the backend service role.

## Senior profile fields

`seniors.user_id` uniquely links to `users.id`. The senior table includes all requested
profile fields: names, contact, address, email, avatar_url, gender, civil_status, spouse,
signature, children, birth_certificate, monthly_income and category. It additionally
keeps dob, osca_id_number, created_at, updated_at and is_active. DOB is necessary for
age-based eligibility; category describes health or mobility. A missing OSCA ID is not invented during backfill.

Only resident roles (user, senior, senior citizen) aged 60+ are backfilled. Staff/admin
accounts remain account records. Missing/invalid DOBs and younger residents are reported
by the verification script. Later changes to an existing senior's role or eligibility
mark its record inactive rather than deleting historical information.

Existing users.id values and foreign keys remain unchanged. Applications, reservations,
chat, feedback and digital IDs still refer to the account ID, not seniors.id.
Deleting an account cascades to its linked senior record. Deleting only a senior record
does not delete the account; a later account update can recreate an eligible profile.

## Compatibility

Legacy senior columns are intentionally retained in users. Existing routes continue
reading and writing users; database triggers synchronize the linked profile. SQL editor
or trusted backend edits to seniors synchronize shared profile values back to users.
Category defaults to Not Specified and is selected by the user in the profile dropdown.
Apply migration 013 if 012 was already run with age-based category defaults.
Spouse, category and monthly income can also be updated through the existing profile PUT endpoint.
The users table remains the source for account role, credentials, token, IP and status.

This is the compatibility phase, not a destructive removal of the old users columns.
Do not drop legacy columns until all consumers have migrated to seniors. Both tables
are locked/updated within the same transaction, so trigger errors roll back the write.
Concurrent edits to both tables can require transaction retry if PostgreSQL detects a deadlock.
Senior linkage IDs cannot be changed through profile updates.

The seniors table uses RLS with no anonymous policies; the backend service role and SQL
editor manage it. Trigger helper RPC access is revoked from PUBLIC. Existing users table
permissions are not changed by this migration.

## Preflight and verification

Keep a database backup before applying schema changes. Apply preceding migrations first.
The migration assumes public.users.id is BIGINT-compatible, as existing foreign keys do.
Existing children must be JSON arrays and monthly income must be a nonnegative numeric amount.
If legacy values violate these rules, the migration rolls back instead of discarding them.
Review and correct those source records before rerunning it.


## Senior-only signature and OSCA ID (migration 015)

Migration 015 copies existing values and removes users.digital_signature and
users.osca_id_number. Their storage is seniors.signature and seniors.osca_id_number.
The backend merges those values into the existing user API response, including profile,
login, session, benefit-admin and face-verification responses. Signature endpoints write
seniors directly. Account updates no longer overwrite either senior-only field.
New senior profiles use the established SA-#### ID format based on users.id.

Apply migrations in order; do not rerun 012 or 013 after 015, since the older migrations
restore the earlier compatibility functions. Migration 015 refuses to discard populated
account values when no linked senior record exists; reconcile those records first.
The migration has not been run on the hosted database.
