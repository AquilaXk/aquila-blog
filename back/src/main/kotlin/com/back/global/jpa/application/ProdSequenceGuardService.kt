package com.back.global.jpa.application

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Profile
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.regex.Pattern

/**
 * ProdSequenceGuardService는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */

@Profile("prod")
@Component
class ProdSequenceGuardService(
    private val jdbcTemplate: JdbcTemplate,
    @param:Value("\${custom.db.sequence-guard-on-startup:true}")
    private val sequenceGuardOnStartup: Boolean,
) : ApplicationRunner {
    /**
     * 애플리케이션 시작/스케줄 실행 시점에 점검 로직을 수행합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    override fun run(args: ApplicationArguments) {
        if (!sequenceGuardOnStartup) return
        repairAllKnownSequences()
    }

    /**
     * repairIfSequenceDrift 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    fun repairIfSequenceDrift(exception: DataIntegrityViolationException): Boolean {
        val message = exception.mostSpecificCause?.message ?: exception.message ?: return false
        if (!isDuplicateKeyViolation(exception, message)) return false

        val constraintName = extractConstraintName(exception, message) ?: return false
        val target = sequenceTargetsByConstraint[constraintName.lowercase()] ?: return false
        return repairSequence(target)
    }

    fun repairAllKnownSequences() {
        sequenceTargetsByConstraint.values.distinctBy { it.table }.forEach { target ->
            repairSequence(target)
        }
    }

    fun repairUploadedFileSequence(): Boolean {
        val target = sequenceTargetsByConstraint[UPLOADED_FILE_CONSTRAINT_KEY] ?: return false
        return repairSequence(target, allowSetvalOnlyFallback = true)
    }

    private fun repairSequence(
        target: SequenceTarget,
        allowSetvalOnlyFallback: Boolean = false,
    ): Boolean {
        val fullRepairSucceeded =
            runCatching {
                jdbcTemplate.execute("ALTER SEQUENCE IF EXISTS public.${target.sequence} INCREMENT BY ${target.allocationSize}")
                jdbcTemplate.execute(
                    "SELECT setval('public.${target.sequence}', COALESCE((SELECT MAX(id) FROM public.${target.table}), 0) + ${target.allocationSize}, false)",
                )
                true
            }.onSuccess {
                log.warn(
                    "Repaired sequence drift: table={}, sequence={}, allocationSize={}",
                    target.table,
                    target.sequence,
                    target.allocationSize,
                )
            }.onFailure { exception ->
                log.error(
                    "Failed to repair sequence drift: table={}, sequence={}, allocationSize={}",
                    target.table,
                    target.sequence,
                    target.allocationSize,
                    exception,
                )
            }.getOrElse { false }

        if (fullRepairSucceeded || !allowSetvalOnlyFallback) return fullRepairSucceeded
        return repairSequenceBySetvalOnly(target)
    }

    private fun repairSequenceBySetvalOnly(target: SequenceTarget): Boolean =
        runCatching {
            jdbcTemplate.execute(
                "SELECT setval('public.${target.sequence}', COALESCE((SELECT MAX(id) FROM public.${target.table}), 0) + ${target.allocationSize}, false)",
            )
            true
        }.onSuccess {
            log.warn(
                "Repaired sequence drift with setval-only fallback: table={}, sequence={}, allocationSize={}",
                target.table,
                target.sequence,
                target.allocationSize,
            )
        }.onFailure { exception ->
            log.error(
                "Failed setval-only sequence repair: table={}, sequence={}, allocationSize={}",
                target.table,
                target.sequence,
                target.allocationSize,
                exception,
            )
        }.getOrElse { false }

    /**
     * 입력/환경 데이터를 파싱·정규화해 내부 처리에 안전한 값으로 변환합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    private fun extractConstraintName(
        exception: DataIntegrityViolationException,
        message: String,
    ): String? {
        val serverConstraint = extractServerConstraintName(exception).orEmpty()
        if (serverConstraint.isNotBlank()) return serverConstraint

        return extractConstraintNameFromMessage(message)
            ?: sequenceTargetsByConstraint.keys.firstOrNull { key -> message.contains(key, ignoreCase = true) }
    }

    private fun extractConstraintNameFromMessage(message: String): String? {
        val match = CONSTRAINT_NAME_PATTERN.matcher(message)
        if (!match.find()) return null
        return match.group(1)
    }

    private fun isDuplicateKeyViolation(
        exception: DataIntegrityViolationException,
        message: String,
    ): Boolean {
        val sqlState = extractSqlState(exception)
        if (!sqlState.isNullOrBlank()) {
            return sqlState == DUPLICATE_KEY_SQLSTATE
        }

        return message.contains("duplicate key value violates unique constraint", ignoreCase = true) ||
            (message.contains("중복 키 값") && message.contains("고유 제약 조건"))
    }

    private fun extractSqlState(exception: DataIntegrityViolationException): String? {
        val cause = exception.mostSpecificCause ?: return null
        return runCatching {
            cause.javaClass.methods
                .firstOrNull { method -> method.name == "getSQLState" || method.name == "getSqlState" }
                ?.invoke(cause) as? String
        }.getOrNull()
    }

    private fun extractServerConstraintName(exception: DataIntegrityViolationException): String? {
        val cause = exception.mostSpecificCause ?: return null
        return runCatching {
            val serverErrorMessage =
                cause.javaClass.methods
                    .firstOrNull { method -> method.name == "getServerErrorMessage" }
                    ?.invoke(cause)
                    ?: return@runCatching null

            val constraint =
                serverErrorMessage.javaClass.methods
                    .firstOrNull { method -> method.name == "getConstraint" }
                    ?.invoke(serverErrorMessage) as? String

            constraint?.trim()?.takeIf { it.isNotBlank() }
        }.getOrNull()
    }

    private data class SequenceTarget(
        val table: String,
        val sequence: String,
        val allocationSize: Int,
    )

    companion object {
        private val log = LoggerFactory.getLogger(ProdSequenceGuardService::class.java)
        private const val DUPLICATE_KEY_SQLSTATE = "23505"
        private const val UPLOADED_FILE_CONSTRAINT_KEY = "uploaded_file_pkey"
        private val CONSTRAINT_NAME_PATTERN =
            Pattern.compile("(?:constraint|제약\\s*조건)\\s+\"([^\"]+)\"", Pattern.CASE_INSENSITIVE)
        private val sequenceTargetsByConstraint: Map<String, SequenceTarget> =
            mapOf(
                "member_pkey" to SequenceTarget("member", "member_seq", 50),
                "pk_member" to SequenceTarget("member", "member_seq", 50),
                "member_attr_pkey" to SequenceTarget("member_attr", "member_attr_seq", 50),
                "pk_member_attr" to SequenceTarget("member_attr", "member_attr_seq", 50),
                "member_notification_pkey" to SequenceTarget("member_notification", "member_notification_seq", 50),
                "pk_member_notification" to SequenceTarget("member_notification", "member_notification_seq", 50),
                "member_action_log_pkey" to SequenceTarget("member_action_log", "member_action_log_seq", 50),
                "pk_member_action_log" to SequenceTarget("member_action_log", "member_action_log_seq", 50),
                "member_signup_verification_pkey" to
                    SequenceTarget("member_signup_verification", "member_signup_verification_seq", 20),
                "pk_member_signup_verification" to
                    SequenceTarget("member_signup_verification", "member_signup_verification_seq", 20),
                "post_pkey" to SequenceTarget("post", "post_seq", 50),
                "pk_post" to SequenceTarget("post", "post_seq", 50),
                "post_attr_pkey" to SequenceTarget("post_attr", "post_attr_seq", 50),
                "pk_post_attr" to SequenceTarget("post_attr", "post_attr_seq", 50),
                "post_like_pkey" to SequenceTarget("post_like", "post_like_seq", 50),
                "pk_post_like" to SequenceTarget("post_like", "post_like_seq", 50),
                "post_comment_pkey" to SequenceTarget("post_comment", "post_comment_seq", 50),
                "pk_post_comment" to SequenceTarget("post_comment", "post_comment_seq", 50),
                "post_write_request_idempotency_pkey" to
                    SequenceTarget("post_write_request_idempotency", "post_write_request_idempotency_seq", 50),
                "pk_post_write_request_idempotency" to
                    SequenceTarget("post_write_request_idempotency", "post_write_request_idempotency_seq", 50),
                "task_pkey" to SequenceTarget("task", "task_seq", 50),
                "pk_task" to SequenceTarget("task", "task_seq", 50),
                "uploaded_file_pkey" to SequenceTarget("uploaded_file", "uploaded_file_seq", 1),
                "pk_uploaded_file" to SequenceTarget("uploaded_file", "uploaded_file_seq", 1),
            )
    }
}
