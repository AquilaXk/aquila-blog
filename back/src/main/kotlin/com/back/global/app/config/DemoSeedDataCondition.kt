package com.back.global.app.config

import org.springframework.context.annotation.Condition
import org.springframework.context.annotation.ConditionContext
import org.springframework.core.type.AnnotatedTypeMetadata
import java.util.Locale

class DemoSeedDataCondition : Condition {
    override fun matches(
        context: ConditionContext,
        metadata: AnnotatedTypeMetadata,
    ): Boolean {
        val environment = context.environment
        val enabled =
            environment.getProperty(
                "custom.bootstrap.seed-demo-data-enabled",
                Boolean::class.java,
                false,
            )
        if (!enabled) return false

        val activeProfiles = environment.activeProfiles.map { it.lowercase(Locale.ROOT) }
        if (activeProfiles.none { it in ALLOWED_PROFILES }) return false

        return activeProfiles.none(::isProdLikeProfile)
    }

    companion object {
        private val ALLOWED_PROFILES = setOf("local", "dev", "test")
        private val DENIED_PROFILE_PREFIXES = listOf("prod", "staging", "preview", "qa", "release")

        fun isProdLikeProfile(profile: String): Boolean {
            val normalized = profile.trim().lowercase(Locale.ROOT)
            return DENIED_PROFILE_PREFIXES.any { denied ->
                normalized == denied || normalized.startsWith("$denied-")
            }
        }
    }
}
