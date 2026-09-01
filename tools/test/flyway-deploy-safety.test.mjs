import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const scriptPath = path.join(repoRoot, "tools/ci/check-flyway-deploy-safety.mjs")

const createRepo = ({ files }) => {
  const root = mkdtempSync(path.join(tmpdir(), "flyway-safety-"))
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return root
}

const compatibilityPolicy = ({ migrations = [], cutovers = [] } = {}) => ({
  version: 1,
  migrations,
  cutovers,
})

const expandPolicyFor = (files) =>
  compatibilityPolicy({
    migrations: files.map((file) => ({ file, class: "EXPAND_SAFE" })),
  })

const runSafety = ({ root, changedFiles, policy, basePolicy }) => {
  const changedPath = path.join(root, "changed-files.txt")
  writeFileSync(changedPath, `${changedFiles.join("\n")}\n`)
  const args = [scriptPath, "--json", "--repo-root", root, "--changed-files", changedPath]

  if (policy) {
    const policyPath = path.join(root, "flyway-compatibility-policy.json")
    writeFileSync(policyPath, `${JSON.stringify(policy)}\n`)
    args.push("--policy", policyPath)
  }
  if (basePolicy) {
    const basePolicyPath = path.join(root, "base-flyway-compatibility-policy.json")
    writeFileSync(basePolicyPath, `${JSON.stringify(basePolicy)}\n`)
    args.push("--base-policy", basePolicyPath)
  }

  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  })

  return {
    ...result,
    json: result.stdout ? JSON.parse(result.stdout) : null,
  }
}

test("changed versioned migration without a machine-readable compatibility class fails closed", () => {
  const file = "back/src/main/resources/db/migration/V20260619_03__expand_safe.sql"
  const root = createRepo({
    files: {
      [file]: `
        CREATE TABLE public.release_audit (id bigint);
        ALTER TABLE public.post ADD COLUMN release_note text;
        CREATE INDEX IF NOT EXISTS idx_release_audit_id ON public.release_audit(id);
        INSERT INTO public.release_audit(id) VALUES (1);
      `,
    },
  })

  try {
    const result = runSafety({ root, changedFiles: [file], policy: compatibilityPolicy() })
    assert.equal(result.status, 1)
    assert.equal(result.json.ok, false)
    assert.equal(result.json.blocked, true)
    assert.deepEqual(result.json.findings, [{ file, rule: "missing-compatibility-class" }])
    assert.deepEqual(result.json.checkedFiles, [file])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("EXPAND_SAFE permits additive SQL and rejects destructive SQL", () => {
  const additiveFile = "back/src/main/resources/db/migration/V20260619_03__expand_safe.sql"
  const destructiveFile = "back/src/main/resources/db/migration/V20260619_04__expand_unsafe.sql"
  const root = createRepo({
    files: {
      [additiveFile]: "ALTER TABLE public.post ADD COLUMN release_note text;",
      [destructiveFile]: "ALTER TABLE public.post DROP COLUMN legacy_note;",
    },
  })
  const policy = expandPolicyFor([additiveFile, destructiveFile])

  try {
    const additive = runSafety({ root, changedFiles: [additiveFile], policy })
    assert.equal(additive.status, 0, additive.stderr)
    assert.equal(additive.json.ok, true)
    assert.equal(additive.json.runNMinusOne, false)

    const destructive = runSafety({ root, changedFiles: [destructiveFile], policy })
    assert.equal(destructive.status, 1)
    assert.equal(destructive.json.blocked, true)
    assert.deepEqual(destructive.json.findings, [{ file: destructiveFile, rule: "drop-column" }])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("destructive schema changes fail closed", () => {
  const files = {
    "back/src/main/resources/db/migration/V20260619_03__drop_schema.sql": "DROP SCHEMA public CASCADE;",
    "back/src/main/resources/db/migration/V20260619_04__drop_table.sql": "DROP TABLE public.post;",
    "back/src/main/resources/db/migration/V20260619_05__drop_column.sql": "ALTER TABLE public.post DROP COLUMN title;",
    "back/src/main/resources/db/migration/V20260619_06__truncate.sql": "TRUNCATE TABLE public.post;",
    "back/src/main/resources/db/migration/V20260619_07__rename_table.sql": "ALTER TABLE public.post RENAME TO archived_post;",
    "back/src/main/resources/db/migration/V20260619_08__rename_column.sql": "ALTER TABLE public.post RENAME COLUMN title TO subject;",
    "back/src/main/resources/db/migration/V20260619_09__type_change.sql": "ALTER TABLE public.post ALTER COLUMN title TYPE varchar(255);",
    "back/src/main/resources/db/migration/V20260619_10__drop_view.sql": "DROP VIEW public.post_summary;",
    "back/src/main/resources/db/migration/V20260619_10__not_null.sql": "ALTER TABLE public.post ALTER COLUMN title SET NOT NULL;",
    "back/src/main/resources/db/migration/V20260619_16__type_change_shorthand.sql": "ALTER TABLE public.post ALTER title TYPE varchar(255);",
    "back/src/main/resources/db/migration/V20260619_17__not_null_shorthand.sql": "ALTER TABLE public.post ALTER title SET NOT NULL;",
    "back/src/main/resources/db/migration/V20260619_18__do_block_drop.sql": `
      DO $$
      BEGIN
        ALTER TABLE public.post DROP COLUMN title;
      END
      $$;
    `,
    "back/src/main/resources/db/migration/V20260619_19__function_body_drop.sql": `
      CREATE FUNCTION public.drop_post_title() RETURNS void AS $fn$
      BEGIN
        ALTER TABLE public.post DROP COLUMN title;
      END
      $fn$ LANGUAGE plpgsql;
    `,
    "back/src/main/resources/db/migration/V20260619_20__dynamic_sql_drop.sql": `
      DO $$
      BEGIN
        EXECUTE 'DROP TABLE public.post';
      END
      $$;
    `,
    "back/src/main/resources/db/migration/V20260619_21__single_quoted_function_body_drop.sql": `
      CREATE FUNCTION public.drop_post_title() RETURNS void AS '
      BEGIN
        ALTER TABLE public.post DROP COLUMN title;
      END
      ' LANGUAGE plpgsql;
    `,
    "back/src/main/resources/db/migration/V20260619_22__do_block_truncate.sql": `
      DO $$
      BEGIN
        TRUNCATE TABLE public.post;
      END
      $$;
    `,
    "back/src/main/resources/db/migration/V20260619_23__dynamic_sql_truncate.sql": `
      DO $$
      BEGIN
        EXECUTE 'TRUNCATE TABLE public.post';
      END
      $$;
    `,
    "back/src/main/resources/db/migration/V20260619_24__drop_type.sql": "DROP TYPE public.post_state;",
    "back/src/main/resources/db/migration/V20260619_25__drop_sequence.sql": "DROP SEQUENCE public.post_id_seq;",
  }
  const root = createRepo({ files })

  try {
    const result = runSafety({ root, changedFiles: Object.keys(files), policy: expandPolicyFor(Object.keys(files)) })
    assert.equal(result.status, 1)
    assert.equal(result.json.ok, false)
    assert.equal(result.json.blocked, true)
    assert.deepEqual(
      result.json.findings.map((finding) => finding.rule).sort(),
      [
        "alter-column-type",
        "alter-column-type",
        "drop-column",
        "drop-column",
        "drop-column",
        "drop-column",
        "drop-schema",
        "drop-schema-object",
        "drop-schema-object",
        "drop-schema-object",
        "drop-table",
        "drop-table",
        "rename-column",
        "rename-table",
        "set-not-null",
        "set-not-null",
        "truncate-table",
        "truncate-table",
        "truncate-table",
      ],
    )
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("comments and string literals do not trigger destructive findings", () => {
  const file = "back/src/main/resources/db/migration/V20260619_10__safe_mentions.sql"
  const root = createRepo({
    files: {
      [file]: `
        -- DROP TABLE public.post;
        /* ALTER TABLE public.post DROP COLUMN title; */
        INSERT INTO public.release_audit(message) VALUES ('TRUNCATE TABLE public.post');
        INSERT INTO public.release_audit(message) VALUES ($$DROP TABLE public.post$$);
        INSERT INTO public.release_audit(message) VALUES ($safe$ALTER TABLE public.post DROP COLUMN title$safe$);
        INSERT INTO public.release_audit(message) VALUES (E'it\\'s DROP TABLE public.post');
        GRANT TRUNCATE ON TABLE public.post TO app_user;
        REVOKE TRUNCATE ON TABLE public.post FROM app_user;
      `,
    },
  })

  try {
    const result = runSafety({ root, changedFiles: [file], policy: expandPolicyFor([file]) })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.json.ok, true)
    assert.equal(result.json.blocked, false)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("PostgreSQL column drop and rename shorthand fail closed", () => {
  const files = {
    "back/src/main/resources/db/migration/V20260619_11__drop_column_shorthand.sql": "ALTER TABLE public.post DROP title;",
    "back/src/main/resources/db/migration/V20260619_12__rename_column_shorthand.sql": "ALTER TABLE public.post RENAME title TO subject;",
  }
  const root = createRepo({ files })

  try {
    const result = runSafety({ root, changedFiles: Object.keys(files), policy: expandPolicyFor(Object.keys(files)) })
    assert.equal(result.status, 1)
    assert.equal(result.json.ok, false)
    assert.equal(result.json.blocked, true)
    assert.deepEqual(
      result.json.findings.map((finding) => finding.rule).sort(),
      ["drop-column", "rename-column"],
    )
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("constraint and index cleanup does not look like a column drop", () => {
  const file = "back/src/main/resources/db/migration/V20260619_13__drop_duplicate_index.sql"
  const root = createRepo({
    files: {
      [file]: `
        ALTER TABLE public.member
          DROP CONSTRAINT IF EXISTS uk_member_legacy;
        DROP INDEX IF EXISTS public.uk_member_legacy;
      `,
    },
  })

  try {
    const result = runSafety({ root, changedFiles: [file], policy: expandPolicyFor([file]) })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.json.ok, true)
    assert.equal(result.json.blocked, false)
    assert.deepEqual(result.json.findings, [])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("constraint relaxation does not look like a column drop", () => {
  const file = "back/src/main/resources/db/migration/V20260619_14__relax_column.sql"
  const root = createRepo({
    files: {
      [file]: `
        ALTER TABLE public.post ALTER COLUMN title DROP NOT NULL;
        ALTER TABLE public.post ALTER COLUMN title DROP DEFAULT;
      `,
    },
  })

  try {
    const result = runSafety({ root, changedFiles: [file], policy: expandPolicyFor([file]) })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.json.ok, true)
    assert.equal(result.json.blocked, false)
    assert.deepEqual(result.json.findings, [])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("missing changed migration file fails closed for rename and delete", () => {
  const missingFile = "back/src/main/resources/db/migration/V20260619_15__renamed_away.sql"
  const root = createRepo({ files: {} })

  try {
    const result = runSafety({ root, changedFiles: [missingFile], policy: expandPolicyFor([missingFile]) })
    assert.equal(result.status, 1)
    assert.equal(result.json.ok, false)
    assert.equal(result.json.blocked, true)
    assert.deepEqual(result.json.findings, [{ file: missingFile, rule: "missing-migration-file" }])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("retired lifecycle callback deletion does not permit repeatable migration deletion", () => {
  const callback = "back/src/main/resources/db/migration/beforeMigrate__temporary_recovery.sql"
  const repeatable = "back/src/main/resources/db/migration/R__current_projection.sql"
  const root = createRepo({ files: {} })

  try {
    const callbackResult = runSafety({ root, changedFiles: [callback], policy: compatibilityPolicy() })
    assert.equal(callbackResult.status, 0, callbackResult.stderr)
    assert.equal(callbackResult.json.ok, true)
    assert.deepEqual(callbackResult.json.findings, [])

    const repeatableResult = runSafety({ root, changedFiles: [repeatable], policy: compatibilityPolicy() })
    assert.equal(repeatableResult.status, 1)
    assert.equal(repeatableResult.json.ok, false)
    assert.deepEqual(repeatableResult.json.findings, [{ file: repeatable, rule: "missing-migration-file" }])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("CONTRACT_AFTER_CUTOVER accepts only merge-base cutover evidence and routes N-1", () => {
  const file = "back/src/main/resources/db/migration/V20260619_16__contract_after_cutover.sql"
  const baseCutover = {
    id: "post-title-cutover",
    repository: "AquilaXk/aquila-blog",
    mergeSha: "a".repeat(40),
    deployRunId: 1633,
  }
  const currentOnlyCutover = {
    id: "same-pr-cutover",
    repository: "AquilaXk/aquila-blog",
    mergeSha: "b".repeat(40),
    deployRunId: 1634,
  }
  const root = createRepo({
    files: { [file]: "ALTER TABLE public.post DROP COLUMN legacy_title;" },
  })

  try {
    const rejected = runSafety({
      root,
      changedFiles: [file],
      policy: compatibilityPolicy({
        migrations: [{ file, class: "CONTRACT_AFTER_CUTOVER", cutoverEvidenceId: currentOnlyCutover.id }],
        cutovers: [baseCutover, currentOnlyCutover],
      }),
      basePolicy: compatibilityPolicy({ cutovers: [baseCutover] }),
    })
    assert.equal(rejected.status, 1)
    assert.deepEqual(rejected.json.findings, [{ file, rule: "cutover-evidence-not-in-base-policy" }])

    const changedEvidence = runSafety({
      root,
      changedFiles: [file],
      policy: compatibilityPolicy({
        migrations: [{ file, class: "CONTRACT_AFTER_CUTOVER", cutoverEvidenceId: baseCutover.id }],
        cutovers: [{ ...baseCutover, deployRunId: baseCutover.deployRunId + 1 }],
      }),
      basePolicy: compatibilityPolicy({ cutovers: [baseCutover] }),
    })
    assert.equal(changedEvidence.status, 1)
    assert.deepEqual(changedEvidence.json.findings, [
      { cutoverEvidenceId: baseCutover.id, rule: "cutover-evidence-changed-from-base-policy" },
    ])

    const accepted = runSafety({
      root,
      changedFiles: [file],
      policy: compatibilityPolicy({
        migrations: [{ file, class: "CONTRACT_AFTER_CUTOVER", cutoverEvidenceId: baseCutover.id }],
        cutovers: [baseCutover],
      }),
      basePolicy: compatibilityPolicy({ cutovers: [baseCutover] }),
    })
    assert.equal(accepted.status, 0, accepted.stderr)
    assert.equal(accepted.json.ok, true)
    assert.equal(accepted.json.runNMinusOne, true)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("merge-base cutover evidence is immutable in policy-only changes", () => {
  const baseCutover = {
    id: "post-title-cutover",
    repository: "AquilaXk/aquila-blog",
    mergeSha: "a".repeat(40),
    deployRunId: 1633,
  }
  const root = createRepo({ files: {} })

  try {
    const changed = runSafety({
      root,
      changedFiles: ["back/config/flyway-compatibility-policy.json"],
      policy: compatibilityPolicy({ cutovers: [{ ...baseCutover, deployRunId: 1634 }] }),
      basePolicy: compatibilityPolicy({ cutovers: [baseCutover] }),
    })
    assert.equal(changed.status, 1)
    assert.deepEqual(changed.json.findings, [
      { cutoverEvidenceId: baseCutover.id, rule: "cutover-evidence-changed-from-base-policy" },
    ])

    const removed = runSafety({
      root,
      changedFiles: ["back/config/flyway-compatibility-policy.json"],
      policy: compatibilityPolicy(),
      basePolicy: compatibilityPolicy({ cutovers: [baseCutover] }),
    })
    assert.equal(removed.status, 1)
    assert.deepEqual(removed.json.findings, [
      { cutoverEvidenceId: baseCutover.id, rule: "cutover-evidence-removed-from-base-policy" },
    ])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("REQUIRES_N_MINUS_1_TEST routes N-1 while EXPAND_SAFE does not", () => {
  const expandFile = "back/src/main/resources/db/migration/V20260619_17__expand.sql"
  const requiresNMinusOneFile = "back/src/main/resources/db/migration/V20260619_18__requires_n_minus_1.sql"
  const root = createRepo({
    files: {
      [expandFile]: "ALTER TABLE public.post ADD COLUMN subtitle text;",
      [requiresNMinusOneFile]: "ALTER TABLE public.post ADD COLUMN compatibility_marker text;",
    },
  })
  const policy = compatibilityPolicy({
    migrations: [
      { file: expandFile, class: "EXPAND_SAFE" },
      { file: requiresNMinusOneFile, class: "REQUIRES_N_MINUS_1_TEST" },
    ],
  })

  try {
    const expand = runSafety({ root, changedFiles: [expandFile], policy })
    const requiresNMinusOne = runSafety({ root, changedFiles: [requiresNMinusOneFile], policy })
    assert.equal(expand.status, 0, expand.stderr)
    assert.equal(expand.json.runNMinusOne, false)
    assert.equal(requiresNMinusOne.status, 0, requiresNMinusOne.stderr)
    assert.equal(requiresNMinusOne.json.runNMinusOne, true)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("non migration changed files are ignored", () => {
  const root = createRepo({
    files: {
      "back/src/main/kotlin/com/back/PostController.kt": "class PostController",
    },
  })

  try {
    const result = runSafety({
      root,
      changedFiles: ["back/src/main/kotlin/com/back/PostController.kt"],
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.json.ok, true)
    assert.equal(result.json.blocked, false)
    assert.deepEqual(result.json.checkedFiles, [])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
