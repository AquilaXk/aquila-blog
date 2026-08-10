package com.back.global.storage.health

import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.amazon.awssdk.services.s3.model.S3Exception
import java.net.SocketTimeoutException
import java.net.URI
import java.net.UnknownHostException
import java.net.http.HttpTimeoutException

enum class StorageDependencyFailureReason(
    val wireValue: String,
) {
    MISSING_BUCKET("missing_bucket"),
    ACCESS_DENIED("access_denied"),
    INVALID_CREDENTIAL("invalid_credential"),
    DNS("dns"),
    TIMEOUT("timeout"),
    INVALID_CONFIGURATION("invalid_configuration"),
    OTHER("other"),
}

enum class StorageDependencyState(
    val wireValue: String,
) {
    DISABLED("disabled"),
    READY("ready"),
    DOWN("down"),
}

data class StorageDependencyProbeResult(
    val state: StorageDependencyState,
    val reason: StorageDependencyFailureReason? = null,
    val credentialVersion: String? = null,
) {
    companion object {
        fun disabled(): StorageDependencyProbeResult = StorageDependencyProbeResult(StorageDependencyState.DISABLED)

        fun ready(credentialVersion: String): StorageDependencyProbeResult =
            StorageDependencyProbeResult(
                state = StorageDependencyState.READY,
                credentialVersion = credentialVersion,
            )

        fun down(
            reason: StorageDependencyFailureReason,
            credentialVersion: String? = null,
        ): StorageDependencyProbeResult =
            StorageDependencyProbeResult(
                state = StorageDependencyState.DOWN,
                reason = reason,
                credentialVersion = credentialVersion,
            )
    }
}

class ValidatedStorageConfiguration internal constructor(
    val endpoint: URI,
    val region: String,
    val bucket: String,
    val accessKey: String,
    val secretKey: String,
    val credentialVersion: String,
)

object StorageRuntimeConfigurationValidator {
    fun validate(
        endpoint: String,
        region: String,
        bucket: String,
        accessKey: String,
        secretKey: String,
        credentialVersion: String,
    ): ValidatedStorageConfiguration {
        val resolvedEndpoint = requireConcrete(endpoint, "CUSTOM_STORAGE_ENDPOINT")
        val endpointUri =
            runCatching { URI.create(resolvedEndpoint) }
                .getOrElse { throw IllegalArgumentException("CUSTOM_STORAGE_ENDPOINT 설정이 유효하지 않습니다.") }
        require(endpointUri.scheme in SUPPORTED_SCHEMES && !endpointUri.host.isNullOrBlank()) {
            "CUSTOM_STORAGE_ENDPOINT 설정이 유효하지 않습니다."
        }

        val resolvedRegion = requireConcrete(region, "CUSTOM_STORAGE_REGION")
        val resolvedBucket = requireConcrete(bucket, "CUSTOM_STORAGE_BUCKET")
        val resolvedAccessKey = requireConcrete(accessKey, "CUSTOM_STORAGE_ACCESSKEY")
        val resolvedSecretKey = requireConcrete(secretKey, "CUSTOM_STORAGE_SECRETKEY")
        val resolvedVersion = requireConcrete(credentialVersion, "CUSTOM_STORAGE_CREDENTIAL_VERSION")
        require(CANONICAL_POSITIVE_LONG.matches(resolvedVersion) && resolvedVersion.toLongOrNull() != null) {
            "CUSTOM_STORAGE_CREDENTIAL_VERSION 설정이 유효하지 않습니다."
        }

        return ValidatedStorageConfiguration(
            endpoint = endpointUri,
            region = resolvedRegion,
            bucket = resolvedBucket,
            accessKey = resolvedAccessKey,
            secretKey = resolvedSecretKey,
            credentialVersion = resolvedVersion,
        )
    }

    private fun requireConcrete(
        rawValue: String,
        key: String,
    ): String {
        val value = rawValue.trim()
        require(
            value.isNotBlank() &&
                value == rawValue &&
                !value.contains("\${") &&
                !PLACEHOLDER_VALUE.matches(value),
        ) {
            "$key 설정이 유효하지 않습니다."
        }
        return value
    }

    private val SUPPORTED_SCHEMES = setOf("http", "https")
    private val CANONICAL_POSITIVE_LONG = Regex("^[1-9][0-9]{0,18}$")
    private val PLACEHOLDER_VALUE =
        Regex(
            "^(?:<[^>]+>|change[-_]?me(?:[-_].*)?|replace[-_]?me(?:[-_].*)?|your[-_].+|example(?:\\.com)?)$",
            RegexOption.IGNORE_CASE,
        )
}

object StorageDependencyFailureClassifier {
    fun isExplicitMissingBucket(error: Throwable): Boolean =
        error.causalChain().any { cause ->
            cause is NoSuchBucketException ||
                (cause is S3Exception && cause.awsErrorDetails()?.errorCode().equals("NoSuchBucket", ignoreCase = true))
        }

    fun classify(error: Throwable): StorageDependencyFailureReason {
        val causes = error.causalChain()
        if (causes.any { it is IllegalArgumentException }) {
            return StorageDependencyFailureReason.INVALID_CONFIGURATION
        }
        if (causes.any { it is UnknownHostException }) {
            return StorageDependencyFailureReason.DNS
        }
        if (causes.any { it is SocketTimeoutException || it is HttpTimeoutException }) {
            return StorageDependencyFailureReason.TIMEOUT
        }

        val s3Error = causes.filterIsInstance<S3Exception>().firstOrNull()
        if (s3Error != null) {
            val errorCode =
                s3Error
                    .awsErrorDetails()
                    ?.errorCode()
                    ?.lowercase()
                    .orEmpty()
            return when {
                s3Error is NoSuchBucketException || errorCode == "nosuchbucket" || s3Error.statusCode() == 404 ->
                    StorageDependencyFailureReason.MISSING_BUCKET
                errorCode in INVALID_CREDENTIAL_CODES || s3Error.statusCode() == 401 ->
                    StorageDependencyFailureReason.INVALID_CREDENTIAL
                errorCode in ACCESS_DENIED_CODES || s3Error.statusCode() == 403 ->
                    StorageDependencyFailureReason.ACCESS_DENIED
                else -> StorageDependencyFailureReason.OTHER
            }
        }

        return StorageDependencyFailureReason.OTHER
    }

    private fun Throwable.causalChain(): List<Throwable> {
        val causes = mutableListOf<Throwable>()
        var current: Throwable? = this
        while (current != null && current !in causes) {
            causes += current
            current = current.cause
        }
        return causes
    }

    private val INVALID_CREDENTIAL_CODES =
        setOf(
            "invalidaccesskeyid",
            "signaturedoesnotmatch",
            "invalidtoken",
            "expiredtoken",
        )
    private val ACCESS_DENIED_CODES = setOf("accessdenied", "allaccessdisabled")
}
