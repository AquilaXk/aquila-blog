package com.back.global.app.config

import com.back.global.app.AdminProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

@Profile("prod")
@Component
class ProdConfigGuard(
    @param:Value("\${custom.site.cookieDomain:}")
    private val cookieDomain: String,
    @param:Value("\${custom.site.frontUrl:}")
    private val frontUrl: String,
    @param:Value("\${custom.site.backUrl:}")
    private val backUrl: String,
    @param:Value("\${custom.ai.tag.enabled:false}")
    private val aiTagEnabled: Boolean,
    @param:Value("\${custom.ai.tag.policy.dpaConfirmed:false}")
    private val aiTagDpaConfirmed: Boolean,
    @param:Value("\${custom.ai.tag.policy.regionConfirmed:false}")
    private val aiTagRegionConfirmed: Boolean,
    @param:Value("\${custom.ai.tag.policy.retentionConfirmed:false}")
    private val aiTagRetentionConfirmed: Boolean,
    @param:Value("\${custom.ai.tag.policy.trainingOptOutConfirmed:false}")
    private val aiTagTrainingOptOutConfirmed: Boolean,
    @param:Value("\${custom.ai.tag.policy.processorRegistryConfirmed:false}")
    private val aiTagProcessorRegistryConfirmed: Boolean,
    private val adminProperties: AdminProperties,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val missingKeys =
            buildList {
                if (cookieDomain.isBlank()) add("custom.site.cookieDomain")
                if (frontUrl.isBlank()) add("custom.site.frontUrl")
                if (backUrl.isBlank()) add("custom.site.backUrl")
                if (adminProperties.normalizedEmail.isBlank()) add("custom.admin.email")
                if (adminProperties.password.isBlank()) add("custom.admin.password")
            }

        require(missingKeys.isEmpty()) {
            "Missing required production configuration keys: ${missingKeys.joinToString(", ")}"
        }
        require(!cookieDomain.equals("localhost", ignoreCase = true)) {
            "custom.site.cookieDomain must not be localhost in prod profile."
        }
        require(frontUrl.startsWith("https://")) {
            "custom.site.frontUrl must use https in prod profile."
        }
        require(backUrl.startsWith("https://")) {
            "custom.site.backUrl must use https in prod profile."
        }
        require(!aiTagEnabled || aiTagPolicyConfirmed()) {
            "custom.ai.tag.enabled requires confirmed DPA, region, retention, training opt-out, and processor registry in prod profile."
        }
    }

    private fun aiTagPolicyConfirmed(): Boolean =
        aiTagDpaConfirmed &&
            aiTagRegionConfirmed &&
            aiTagRetentionConfirmed &&
            aiTagTrainingOptOutConfirmed &&
            aiTagProcessorRegistryConfirmed
}
