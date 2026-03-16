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

@Profile("prod")
@Component
class ProdSequenceGuardService(
    private val jdbcTemplate: JdbcTemplate,
    @param:Value("\${custom.db.sequence-guard-on-startup:true}")
    private val sequenceGuardOnStartup: Boolean,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        if (!sequenceGuardOnStartup) return
        repairAllKnownSequences()
    }

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
