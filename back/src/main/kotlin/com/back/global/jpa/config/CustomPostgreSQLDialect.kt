package com.back.global.jpa.config

import com.back.global.pGroonga.config.PGroongaCompositeMatchFunction
import org.hibernate.boot.model.FunctionContributions
import org.hibernate.dialect.PostgreSQLDialect
import org.hibernate.type.BasicType
import org.hibernate.type.SqlTypes

open class CustomPostgreSQLDialect : PostgreSQLDialect() {
    override fun initializeFunctionRegistry(functionContributions: FunctionContributions) {
        super.initializeFunctionRegistry(functionContributions)

        @Suppress("UNCHECKED_CAST")
        val booleanType = functionContributions.typeConfiguration
            .basicTypeRegistry
            .resolve(Boolean::class.javaObjectType, SqlTypes.BOOLEAN) as BasicType<Boolean>

        functionContributions.functionRegistry.register(
            "pgroonga_match",
            PGroongaCompositeMatchFunction("pgroonga_match", booleanType)
        )

        functionContributions.functionRegistry.register(
            "pgroonga_post_match",
            PGroongaCompositeMatchFunction("pgroonga_post_match", booleanType)
        )
    }
}
