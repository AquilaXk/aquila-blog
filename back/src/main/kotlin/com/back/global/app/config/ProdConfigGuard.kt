package com.back.global.app.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * ProdConfigGuard는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
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
    @param:Value("\${custom.admin.email:}")
    private val adminEmail: String,
    @param:Value("\${custom.admin.password:}")
    private val adminPassword: String,
) : ApplicationRunner {
    /**
     * 애플리케이션 시작/스케줄 실행 시점에 점검 로직을 수행합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    override fun run(args: ApplicationArguments) {
        val missingKeys =
            buildList {
                if (cookieDomain.isBlank()) add("custom.site.cookieDomain")
                if (frontUrl.isBlank()) add("custom.site.frontUrl")
                if (backUrl.isBlank()) add("custom.site.backUrl")
                if (adminUsername.isBlank() && adminEmail.isBlank()) {
                    add("custom.admin.username or custom.admin.email")
                }
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
