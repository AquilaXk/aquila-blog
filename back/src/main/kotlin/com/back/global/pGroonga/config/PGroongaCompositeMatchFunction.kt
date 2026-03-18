package com.back.global.pGroonga.config

import org.hibernate.metamodel.model.domain.ReturnableType
import org.hibernate.query.sqm.function.AbstractSqmSelfRenderingFunctionDescriptor
import org.hibernate.query.sqm.function.FunctionKind
import org.hibernate.query.sqm.produce.function.ArgumentsValidator
import org.hibernate.query.sqm.produce.function.FunctionArgumentException
import org.hibernate.query.sqm.produce.function.StandardFunctionReturnTypeResolvers
import org.hibernate.query.sqm.tree.SqmTypedNode
import org.hibernate.sql.ast.SqlAstTranslator
import org.hibernate.sql.ast.spi.SqlAppender
import org.hibernate.sql.ast.tree.SqlAstNode
import org.hibernate.type.BasicType
import org.hibernate.type.BindingContext

/**
 * PGroongaCompositeMatchFunction는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
class PGroongaCompositeMatchFunction(
    functionName: String,
    booleanType: BasicType<Boolean>,
) : AbstractSqmSelfRenderingFunctionDescriptor(
        functionName,
        FunctionKind.NORMAL,
        MinArgumentCountValidator(2),
        StandardFunctionReturnTypeResolvers.invariant(booleanType),
        null,
    ) {
    /**
     * render 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    override fun render(
        sqlAppender: SqlAppender,
        sqlAstArguments: List<SqlAstNode>,
        returnType: ReturnableType<*>?,
        walker: SqlAstTranslator<*>,
    ) {
        val keywordArgIndex = sqlAstArguments.lastIndex

        sqlAppender.appendSql("ARRAY[")
        sqlAstArguments.dropLast(1).forEachIndexed { index, argument ->
            if (index > 0) {
                sqlAppender.appendSql(", ")
            }
            argument.accept(walker)
            sqlAppender.appendSql("::text")
        }
        sqlAppender.appendSql("] &@~ ")
        sqlAstArguments[keywordArgIndex].accept(walker)
    }

    private class MinArgumentCountValidator(
        private val minCount: Int,
    ) : ArgumentsValidator {
        override fun validate(
            arguments: List<SqmTypedNode<*>>,
            functionName: String,
            bindingContext: BindingContext,
        ) {
            validateCount(arguments.size, functionName)
        }

        /**
         * validateCount 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
         * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
         */
        private fun validateCount(
            size: Int,
            functionName: String,
        ) {
            if (size >= minCount) return

            throw FunctionArgumentException(
                "Function $functionName() requires at least $minCount arguments, but $size arguments given",
            )
        }
    }
}
