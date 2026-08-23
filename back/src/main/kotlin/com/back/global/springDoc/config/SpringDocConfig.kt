package com.back.global.springDoc.config

import io.swagger.v3.oas.annotations.OpenAPIDefinition
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType
import io.swagger.v3.oas.annotations.info.Info
import io.swagger.v3.oas.annotations.security.SecurityScheme
import io.swagger.v3.oas.annotations.servers.Server
import io.swagger.v3.oas.models.media.Schema
import org.springdoc.core.customizers.GlobalOpenApiCustomizer
import org.springdoc.core.models.GroupedOpenApi
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
@OpenAPIDefinition(
    info = Info(title = "API 서버", version = "beta", description = "API 서버 문서입니다."),
    servers = [Server(url = "https://blog.aquilaxk.site")],
)
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT")
class SpringDocConfig {
    @Bean
    fun nullableEnumCustomizer(): GlobalOpenApiCustomizer =
        GlobalOpenApiCustomizer { openApi ->
            openApi.components
                ?.schemas
                ?.values
                .orEmpty()
                .flatMap { it.properties?.values.orEmpty() }
                .forEach(::addNullEnumItem)
        }

    @Bean
    fun groupApiV1(): GroupedOpenApi =
        GroupedOpenApi
            .builder()
            .group("apiV1")
            .pathsToMatch("/*/api/v1/**")
            .build()

    @Bean
    fun groupMemberApiV1(): GroupedOpenApi =
        GroupedOpenApi
            .builder()
            .group("memberApiV1")
            .pathsToMatch("/member/api/v1/**")
            .build()

    @Bean
    fun groupPostApiV1(): GroupedOpenApi =
        GroupedOpenApi
            .builder()
            .group("postApiV1")
            .pathsToMatch("/post/api/v1/**")
            .build()

    @Bean
    fun groupController(): GroupedOpenApi =
        GroupedOpenApi
            .builder()
            .group("controller")
            .pathsToExclude("/*/api/v1/**")
            .build()

    private fun addNullEnumItem(schema: Schema<*>) {
        if (!schema.types.orEmpty().contains("null") || schema.enum.isNullOrEmpty() || schema.enum.contains(null)) {
            return
        }

        @Suppress("UNCHECKED_CAST")
        (schema as Schema<Any?>).enum = schema.enum + null
    }
}
