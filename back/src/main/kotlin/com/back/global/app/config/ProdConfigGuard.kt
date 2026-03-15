package com.back.global.app.config

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
    @param:Value("\${custom.admin.username:}")
    private val adminUsername: String,
    @param:Value("\${custom.admin.password:}")
    private val adminPassword: String,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val missingKeys =
            buildList {
                if (cookieDomain.isBlank()) add("custom.site.cookieDomain")
                if (frontUrl.isBlank()) add("custom.site.frontUrl")
                if (backUrl.isBlank()) add("custom.site.backUrl")
                if (adminUsername.isBlank()) add("custom.admin.username")
                if (adminPassword.isBlank()) add("custom.admin.password")
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
    }
}
