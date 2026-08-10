import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const contractPath = path.join(repoRoot, "deploy/env/env.contract.json")
const deployWorkflowPath = path.join(repoRoot, ".github/workflows/deploy.yml")
const blueGreenPath = path.join(repoRoot, "deploy/homeserver/blue_green_deploy.sh")
const materializerPath = path.join(repoRoot, "deploy/homeserver/materialize_service_env.sh")
const identityScriptPath = path.join(repoRoot, "deploy/homeserver/minio_service_identity.sh")
const policyTemplatePath = path.join(repoRoot, "deploy/homeserver/minio-app-policy.template.json")
const policyRendererPath = path.join(repoRoot, "tools/env/render-minio-app-policy.mjs")
const rotationToolPath = path.join(repoRoot, "tools/env/rotate-storage-identity.mjs")
const policyVerifierPath = path.join(repoRoot, "tools/env/verify-minio-access-key-info.mjs")
const doctorPath = path.join(repoRoot, "deploy/homeserver/doctor.sh")
const precheckPath = path.join(repoRoot, "deploy/homeserver/post_precheck_env_guard.sh")

const pinnedMinioImage =
  "minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e"
const pinnedMcImage =
  "minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727"
const pinnedNodeImage = "node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293"
const rootSecret = "root-secret-for-contract-tests"
const firstSecret = "first-generated-storage-secret-value"
const secondSecret = "second-generated-storage-secret-val"

const requiredText = (filePath) => {
  assert(existsSync(filePath), `${path.relative(repoRoot, filePath)} must exist`)
  return readFileSync(filePath, "utf8")
}

const envText = ({ currentAccess = "storage-app-v1", currentSecret = firstSecret, version = "1" } = {}) =>
  [
    `MINIO_IMAGE=${pinnedMinioImage}`,
    `MINIO_MC_IMAGE=${pinnedMcImage}`,
    `NODE_RUNTIME_IMAGE=${pinnedNodeImage}`,
    "MINIO_ROOT_USER=minio-root",
    `MINIO_ROOT_PASSWORD=${rootSecret}`,
    "CUSTOM_STORAGE_ENABLED=true",
    "CUSTOM_STORAGE_ENDPOINT=http://minio:9000",
    "CUSTOM_STORAGE_REGION=us-east-1",
    "CUSTOM_STORAGE_BUCKET=blog-images",
    `CUSTOM_STORAGE_ACCESSKEY=${currentAccess}`,
    `CUSTOM_STORAGE_SECRETKEY=${currentSecret}`,
    `CUSTOM_STORAGE_CREDENTIAL_VERSION=${version}`,
    "CUSTOM_STORAGE_PATHSTYLEACCESS=true",
    "CUSTOM_STORAGE_KEYPREFIX=posts",
    "CUSTOM_STORAGE_CLOUD_KEY_PREFIX=cloud",
  ].join("\n")

const runNode = (args, options = {}) =>
  execFileSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  })

const readPrivateText = (filePath) => {
  const fileDescriptor = openSync(filePath, "r")
  try {
    return {
      mode: fstatSync(fileDescriptor).mode & 0o777,
      text: readFileSync(fileDescriptor, "utf8"),
    }
  } finally {
    closeSync(fileDescriptor)
  }
}

test("storage identity env contract pins immutable images and closes the root/current/rotation boundary", async () => {
  const contract = JSON.parse(requiredText(contractPath))
  const source = contract.targets["home-server-source"]
  const definitions = new Map(source.keys.map((entry) => [entry.name, entry]))
  const identityCheck = source.crossChecks.find((entry) => entry.type === "storageServiceIdentity")

  assert.equal(definitions.get("MINIO_IMAGE").kind, "digest-image")
  assert.equal(definitions.get("MINIO_MC_IMAGE").kind, "digest-image")
  assert.deepEqual(definitions.get("MINIO_MC_IMAGE").allowedValues, [pinnedMcImage])
  assert.equal(definitions.get("CUSTOM_STORAGE_SECRETKEY").maxLength, 40)
  assert.equal(definitions.get("CUSTOM_STORAGE_CREDENTIAL_VERSION").kind, "integer")
  assert(identityCheck, "storageServiceIdentity cross-check must exist")
  assert.equal(identityCheck.rootAccessKey, "MINIO_ROOT_USER")
  assert.equal(identityCheck.rootSecretKey, "MINIO_ROOT_PASSWORD")
  assert.equal(identityCheck.currentAccessKey, "CUSTOM_STORAGE_ACCESSKEY")
  assert.equal(identityCheck.currentSecretKey, "CUSTOM_STORAGE_SECRETKEY")
  assert.equal(identityCheck.currentVersionKey, "CUSTOM_STORAGE_CREDENTIAL_VERSION")
  assert.equal(identityCheck.previousAccessKey, "CUSTOM_STORAGE_PREVIOUS_ACCESSKEY")
  assert.equal(identityCheck.previousVersionKey, "CUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION")
  assert.equal(identityCheck.rotationStartedAtKey, "CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS")
  assert.equal(identityCheck.maxRotationLifetimeSeconds, 86400)

  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const loaded = loadContract(contractPath)
  const storageKeyNames = new Set([
    "MINIO_IMAGE",
    "MINIO_MC_IMAGE",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "CUSTOM_STORAGE_ENABLED",
    "CUSTOM_STORAGE_ENDPOINT",
    "CUSTOM_STORAGE_REGION",
    "CUSTOM_STORAGE_BUCKET",
    "CUSTOM_STORAGE_ACCESSKEY",
    "CUSTOM_STORAGE_SECRETKEY",
    "CUSTOM_STORAGE_CREDENTIAL_VERSION",
    "CUSTOM_STORAGE_PREVIOUS_ACCESSKEY",
    "CUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION",
    "CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS",
    "CUSTOM_STORAGE_PATHSTYLEACCESS",
    "CUSTOM_STORAGE_KEYPREFIX",
    "CUSTOM_STORAGE_CLOUD_KEY_PREFIX",
  ])
  const storageContract = {
    placeholderPattern: loaded.placeholderPattern,
    targets: {
      storage: {
        keys: source.keys.filter((definition) => storageKeyNames.has(definition.name)),
        crossChecks: [identityCheck],
      },
    },
  }
  const nowEpochSeconds = 1_700_000_000
  const valid = validateEnvText({
    contract: storageContract,
    target: "storage",
    text: envText(),
    nowEpochSeconds,
  })
  assert.deepEqual(valid.errors, [])

  const validRotation = validateEnvText({
    contract: storageContract,
    target: "storage",
    text: `${envText({ currentAccess: "storage-app-v2", currentSecret: secondSecret, version: "2" })}\nCUSTOM_STORAGE_PREVIOUS_ACCESSKEY=storage-app-v1\nCUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION=1\nCUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS=1699999900`,
    nowEpochSeconds,
  })
  assert.deepEqual(validRotation.errors, [])

  const rejected = [
    envText({ currentAccess: "minio-root" }),
    envText({ currentSecret: rootSecret }),
    envText({ version: "0" }),
    envText({ version: "01" }),
    envText({ currentSecret: "x".repeat(41) }),
    envText({ currentSecret: "unsafe@secret" }),
    envText().replace(`MINIO_ROOT_PASSWORD=${rootSecret}`, "MINIO_ROOT_PASSWORD=unsafe:root"),
    envText().replace("MINIO_ROOT_USER=minio-root", "MINIO_ROOT_USER=unsafe@root"),
    `${envText()}\nCUSTOM_STORAGE_PREVIOUS_ACCESSKEY=storage-app-v0`,
    `${envText()}\nCUSTOM_STORAGE_PREVIOUS_ACCESSKEY=storage-app-v1\nCUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION=0\nCUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS=1699999999`,
    `${envText()}\nCUSTOM_STORAGE_PREVIOUS_ACCESSKEY=storage-app-v0\nCUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION=1\nCUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS=1699999999`,
    `${envText()}\nCUSTOM_STORAGE_PREVIOUS_ACCESSKEY=storage-app-v0\nCUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION=0\nCUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS=1700000001`,
  ]
  for (const text of rejected) {
    const result = validateEnvText({
      contract: storageContract,
      target: "storage",
      text,
      nowEpochSeconds,
    })
    assert.notEqual(result.errors.length, 0)
    const diagnostics = JSON.stringify(result.errors)
    assert.equal(diagnostics.includes(rootSecret), false)
    assert.equal(diagnostics.includes(firstSecret), false)
  }
})

test("policy renderer emits the exact bucket and prefix allowlist without administrative permissions", () => {
  requiredText(policyTemplatePath)
  requiredText(policyRendererPath)
  const workdir = mkdtempSync(path.join(tmpdir(), "aquila-minio-policy-"))
  try {
    const envFile = path.join(workdir, "source.env")
    const policyFile = path.join(workdir, "policy.json")
    writeFileSync(envFile, `${envText()}\n`, { mode: 0o600 })
    runNode([policyRendererPath, "--env-file", envFile, "--output", policyFile])

    const policy = JSON.parse(readFileSync(policyFile, "utf8"))
    assert.deepEqual(policy, {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:GetBucketLocation", "s3:ListBucket", "s3:ListBucketMultipartUploads"],
          Resource: ["arn:aws:s3:::blog-images"],
        },
        {
          Effect: "Allow",
          Action: [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:AbortMultipartUpload",
            "s3:ListMultipartUploadParts",
          ],
          Resource: ["arn:aws:s3:::blog-images/posts/*", "arn:aws:s3:::blog-images/cloud/*"],
        },
      ],
    })
    const serialized = JSON.stringify(policy)
    for (const forbidden of ["s3:CreateBucket", "s3:DeleteBucket", "admin:", '"s3:*"', "arn:aws:s3:::*"]) {
      assert.equal(serialized.includes(forbidden), false, `policy must exclude ${forbidden}`)
    }
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
})

test("policy verifier compares policy semantics while rejecting any permission expansion", async () => {
  requiredText(policyVerifierPath)
  const { verifyPolicy } = await import("../env/verify-minio-access-key-info.mjs")
  const expectedPolicy = {
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: ["s3:ListBucket", "s3:GetBucketLocation"], Resource: ["bucket"] },
      { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject"], Resource: ["posts/*", "cloud/*"] },
    ],
  }
  assert.doesNotThrow(() =>
    verifyPolicy({
      info: {
        policy: {
          Statement: [
            { Resource: ["cloud/*", "posts/*"], Action: ["s3:PutObject", "s3:GetObject"], Effect: "Allow" },
            { Resource: ["bucket"], Action: ["s3:GetBucketLocation", "s3:ListBucket"], Effect: "Allow" },
          ],
          Version: "2012-10-17",
        },
      },
      expectedPolicy,
    }),
  )
  assert.throws(
    () =>
      verifyPolicy({
        info: {
          policy: {
            ...expectedPolicy,
            Statement: [
              ...expectedPolicy.Statement,
              { Effect: "Allow", Action: ["s3:CreateBucket"], Resource: ["*"] },
            ],
          },
        },
        expectedPolicy,
      }),
    /differs from the tracked policy/,
  )
})

test("owner rotation consumes generated credentials atomically and keeps only non-secret previous metadata", () => {
  requiredText(rotationToolPath)
  const workdir = mkdtempSync(path.join(tmpdir(), "aquila-minio-rotation-"))
  try {
    const envFile = path.join(workdir, ".env.prod")
    const firstCredential = path.join(workdir, "credential-v1.json")
    writeFileSync(
      envFile,
      `${envText({ currentAccess: "minio-root", currentSecret: rootSecret, version: "1" })}\n`,
      { mode: 0o600 },
    )
    writeFileSync(
      firstCredential,
      JSON.stringify({ status: "success", accessKey: "storage-app-v1", secretKey: firstSecret }),
      { mode: 0o600 },
    )

    const firstOutput = runNode([
      rotationToolPath,
      "prepare",
      "--env-file",
      envFile,
      "--credential-file",
      firstCredential,
      "--now-epoch-seconds",
      "1700000000",
    ])
    assert.equal(firstOutput.includes(firstSecret), false)
    assert.equal(existsSync(firstCredential), false, "consumed credential file must be removed")
    const firstEnvSnapshot = readPrivateText(envFile)
    assert.equal(firstEnvSnapshot.mode, 0o600)
    let updated = firstEnvSnapshot.text
    assert.match(updated, /^CUSTOM_STORAGE_ACCESSKEY=storage-app-v1$/m)
    assert.match(updated, new RegExp(`^CUSTOM_STORAGE_SECRETKEY=${firstSecret}$`, "m"))
    assert.match(updated, /^CUSTOM_STORAGE_CREDENTIAL_VERSION=1$/m)
    assert.doesNotMatch(updated, /CUSTOM_STORAGE_PREVIOUS_/)
    assert.doesNotMatch(updated, /CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS/)

    const secondCredential = path.join(workdir, "credential-v2.json")
    writeFileSync(
      secondCredential,
      JSON.stringify({ status: "success", accessKey: "storage-app-v2", secretKey: secondSecret }),
      { mode: 0o600 },
    )
    const secondOutput = runNode([
      rotationToolPath,
      "prepare",
      "--env-file",
      envFile,
      "--credential-file",
      secondCredential,
      "--now-epoch-seconds",
      "1700000100",
    ])
    assert.equal(secondOutput.includes(secondSecret), false)
    updated = readPrivateText(envFile).text
    assert.match(updated, /^CUSTOM_STORAGE_ACCESSKEY=storage-app-v2$/m)
    assert.match(updated, new RegExp(`^CUSTOM_STORAGE_SECRETKEY=${secondSecret}$`, "m"))
    assert.match(updated, /^CUSTOM_STORAGE_CREDENTIAL_VERSION=2$/m)
    assert.match(updated, /^CUSTOM_STORAGE_PREVIOUS_ACCESSKEY=storage-app-v1$/m)
    assert.match(updated, /^CUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION=1$/m)
    assert.match(updated, /^CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS=1700000100$/m)
    assert.equal(updated.includes(`PREVIOUS_SECRET=${firstSecret}`), false)

    const blockedCredential = path.join(workdir, "credential-v3.json")
    writeFileSync(
      blockedCredential,
      JSON.stringify({ status: "success", accessKey: "storage-app-v3", secretKey: "third-secret-value" }),
      { mode: 0o600 },
    )
    const blocked = spawnSync(
      process.execPath,
      [
        rotationToolPath,
        "prepare",
        "--env-file",
        envFile,
        "--credential-file",
        blockedCredential,
        "--now-epoch-seconds",
        "1700000200",
      ],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
    assert.notEqual(blocked.status, 0, "a pending rotation must fail closed")
    assert.equal(`${blocked.stdout}${blocked.stderr}`.includes("third-secret-value"), false)

    runNode([rotationToolPath, "finalize", "--env-file", envFile])
    updated = readPrivateText(envFile).text
    assert.doesNotMatch(updated, /CUSTOM_STORAGE_PREVIOUS_/)
    assert.doesNotMatch(updated, /CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS/)
    assert.match(updated, /^CUSTOM_STORAGE_ACCESSKEY=storage-app-v2$/m)
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
})

test("service env materialization includes only current application identity", () => {
  const workdir = mkdtempSync(path.join(tmpdir(), "aquila-minio-materialize-"))
  try {
    const copiedScript = path.join(workdir, "materialize_service_env.sh")
    const sourceEnv = path.join(workdir, ".env.prod")
    copyFileSync(materializerPath, copiedScript)
    chmodSync(copiedScript, 0o755)
    writeFileSync(
      sourceEnv,
      `${envText()}\nCUSTOM_STORAGE_PREVIOUS_ACCESSKEY=storage-app-v0\nCUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION=0\nCUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS=1699999900\n`,
      { mode: 0o600 },
    )
    execFileSync("bash", [copiedScript, sourceEnv], {
      cwd: workdir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    const backEnv = readFileSync(path.join(workdir, ".env.back.prod"), "utf8")
    assert.match(backEnv, /^CUSTOM_STORAGE_ACCESSKEY=storage-app-v1$/m)
    assert.match(backEnv, new RegExp(`^CUSTOM_STORAGE_SECRETKEY=${firstSecret}$`, "m"))
    assert.match(backEnv, /^CUSTOM_STORAGE_CREDENTIAL_VERSION=1$/m)
    for (const forbiddenKey of [
      "MINIO_ROOT_USER",
      "MINIO_ROOT_PASSWORD",
      "MINIO_MC_IMAGE",
      "CUSTOM_STORAGE_PREVIOUS_ACCESSKEY",
      "CUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION",
      "CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS",
    ]) {
      assert.doesNotMatch(backEnv, new RegExp(`^${forbiddenKey}=`, "m"))
    }
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
})

test("deploy and operator checks use the pinned verifier without mutable image or secret argv fallback", () => {
  const workflow = requiredText(deployWorkflowPath)
  const blueGreen = requiredText(blueGreenPath)
  const identity = requiredText(identityScriptPath)
  const doctor = requiredText(doctorPath)
  const precheck = requiredText(precheckPath)

  assert.equal(`${workflow}\n${blueGreen}`.includes("minio/minio:latest"), false)
  assert.equal(`${workflow}\n${blueGreen}`.includes('ensure_image_key_from_local_digest "MINIO_IMAGE"'), false)
  assert.equal(`${workflow}\n${blueGreen}`.includes('ensure_image_env_key_from_local_digest "MINIO_IMAGE"'), false)
  assert.match(workflow, /require_digest_image_key "MINIO_IMAGE"/)
  assert.match(workflow, /require_digest_image_key "MINIO_MC_IMAGE"/)
  assert.match(workflow, /up -d minio_1/)
  assert.match(workflow, /minio_service_identity\.sh" prepare/)
  assert.match(workflow, /RUNTIME_ENV_MATERIALIZED="true"/)
  assert.match(blueGreen, /require_digest_image_env_key "MINIO_IMAGE"/)
  assert.match(blueGreen, /require_digest_image_env_key "MINIO_MC_IMAGE"/)
  assert.match(blueGreen, /minio_service_identity\.sh" prepare/)
  assert.match(workflow, /minio_service_identity\.sh" audit/)
  assert.match(workflow, /minio_service_identity\.sh" finalize/)
  assert.match(identity, /admin accesskey create/)
  assert.equal(identity.includes("--secret-key"), false)
  assert.match(identity, /admin accesskey info/)
  assert.match(identity, /admin accesskey edit/)
  assert.match(identity, /admin accesskey rm/)
  assert.match(identity, /ls --json "app\/\$\{STORAGE_BUCKET\}"/)
  assert.equal(identity.includes("|| true"), false)
  assert.equal(identity.includes("current_policy_is_implied"), false)
  assert.match(identity, /verify-minio-access-key-info\.mjs/)
  assert.match(identity, /NODE_RUNTIME_IMAGE/)
  assert.match(identity, /credential_output/)
  assert.match(identity, /chmod 600/)
  assert.match(doctor, /MinIO Service Identity/)
  assert.match(doctor, /minio_service_identity\.sh" check/)
  assert.match(precheck, /minio_service_identity\.sh" check/)

  for (const surface of [workflow, blueGreen, identity, doctor, precheck]) {
    assert.equal(surface.includes("CUSTOM_STORAGE_SECRETKEY="), false, "scripts must not echo the application secret")
    assert.equal(surface.includes("MINIO_ROOT_PASSWORD="), false, "scripts must not echo the root secret")
  }
})

test("deploy rollback is active before MinIO runtime mutation", () => {
  const workflow = requiredText(deployWorkflowPath)
  const minioStartIndex = workflow.indexOf("up -d minio_1")
  const identityPrepareIndex = workflow.indexOf('minio_service_identity.sh" prepare')
  const rollbackActivationIndex = workflow.indexOf('RUNTIME_ENV_MATERIALIZED="true"', minioStartIndex - 200)

  assert(rollbackActivationIndex >= 0 && rollbackActivationIndex < minioStartIndex)
  assert(minioStartIndex < identityPrepareIndex)
})

test("identity audit guarantees admin cleanup for every application probe object", () => {
  const identity = requiredText(identityScriptPath)

  assert.match(identity, /cleanup_audit_probe_objects\(\)/)
  assert.match(identity, /AUDIT_PROBE_OBJECTS/)
  assert.match(identity, /admin\/\$\{STORAGE_BUCKET\}\/\$\{probe_object\}/)
})
