package com.back.global.jpa.config

import com.back.global.pGroonga.config.PGroongaCompositeMatchFunction
import org.hibernate.boot.model.FunctionContributions
import org.hibernate.dialect.PostgreSQLDialect
import org.hibernate.type.BasicType
import org.hibernate.type.SqlTypes

/**
 * CustomPostgreSQLDialect는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
open class CustomPostgreSQLDialect : PostgreSQLDialect() {
    /**
     * initializeFunctionRegistry 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    override fun initializeFunctionRegistry(functionContributions: FunctionContributions) {
        super.initializeFunctionRegistry(functionContributions)

        @Suppress("UNCHECKED_CAST")
        val booleanType =
            functionContributions.typeConfiguration
                .basicTypeRegistry
                .resolve(Boolean::class.javaObjectType, SqlTypes.BOOLEAN) as BasicType<Boolean>

        functionContributions.functionRegistry.register(
            "pgroonga_match",
            PGroongaCompositeMatchFunction("pgroonga_match", booleanType),
        )

        functionContributions.functionRegistry.register(
            "pgroonga_post_match",
            PGroongaCompositeMatchFunction("pgroonga_post_match", booleanType),
        )
    }
}
