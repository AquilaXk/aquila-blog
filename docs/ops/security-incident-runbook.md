# Security Incident Runbook

Use this procedure for suspected unauthorized access, exposure, or integrity loss.

## Triage

1. Assign one incident lead and create an incident identifier.
2. Pause related deployments and configuration changes; preserve evidence without
   placing secrets or sensitive raw data in issues, PRs, chat, or the repository.
3. Record the detection time, affected systems, likely exposure path, and scope using
   redacted evidence and secure incident storage.

## Containment and recovery

- Revoke or rotate affected sessions, credentials, tokens, and keys.
- Disable exposed routes or integrations, purge caches, and isolate compromised
  infrastructure as applicable.
- Preserve logs and artifact evidence, then assess affected records, time window, and
  external access.
- Restore services only after containment and verification close the exposure path.

## Exit criteria

Containment, scope, evidence location, recovery verification, and follow-up ownership
must be recorded. Create a tracked remediation item for every missing control and use
the security incident exercise template for the retrospective.
