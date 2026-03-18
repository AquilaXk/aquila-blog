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
        if (!message.contains("duplicate key value violates unique constraint", ignoreCase = true)) return false

        val constraintName = extractConstraintName(message) ?: return false
        val target = sequenceTargetsByConstraint[constraintName.lowercase()] ?: return false
        return repairSequence(target)
    }

    fun repairAllKnownSequences() {
        sequenceTargetsByConstraint.values.distinctBy { it.table }.forEach { target ->
            repairSequence(target)
        }
    }

    private fun repairSequence(target: SequenceTarget): Boolean =
        runCatching {
            jdbcTemplate.execute(
                "SELECT setval('public.${target.sequence}', COALESCE((SELECT MAX(id) + 1 FROM public.${target.table}), 1), false)",
            )
            true
        }.onSuccess {
            log.warn("Repaired sequence drift: table={}, sequence={}", target.table, target.sequence)
        }.onFailure { exception ->
            log.error("Failed to repair sequence drift: table={}, sequence={}", target.table, target.sequence, exception)
        }.getOrElse { false }

    /**
     * 입력/환경 데이터를 파싱·정규화해 내부 처리에 안전한 값으로 변환합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    private fun extractConstraintName(message: String): String? {
        val match = CONSTRAINT_NAME_PATTERN.matcher(message)
        if (!match.find()) return null
        return match.group(1)
    }

    private data class SequenceTarget(
        val table: String,
        val sequence: String,
    )

    companion object {
        private val log = LoggerFactory.getLogger(ProdSequenceGuardService::class.java)
        private val CONSTRAINT_NAME_PATTERN = Pattern.compile("constraint\\s+\"([^\"]+)\"", Pattern.CASE_INSENSITIVE)
        private val sequenceTargetsByConstraint: Map<String, SequenceTarget> =
            mapOf(
                "member_pkey" to SequenceTarget("member", "member_seq"),
                "member_attr_pkey" to SequenceTarget("member_attr", "member_attr_seq"),
                "member_notification_pkey" to SequenceTarget("member_notification", "member_notification_seq"),
                "member_action_log_pkey" to SequenceTarget("member_action_log", "member_action_log_seq"),
                "post_pkey" to SequenceTarget("post", "post_seq"),
                "post_attr_pkey" to SequenceTarget("post_attr", "post_attr_seq"),
                "post_like_pkey" to SequenceTarget("post_like", "post_like_seq"),
                "post_comment_pkey" to SequenceTarget("post_comment", "post_comment_seq"),
                "task_pkey" to SequenceTarget("task", "task_seq"),
                "uploaded_file_pkey" to SequenceTarget("uploaded_file", "uploaded_file_seq"),
            )
    }
}
