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

        private fun validateCount(size: Int, functionName: String) {
            if (size >= minCount) return

            throw FunctionArgumentException(
                "Function $functionName() requires at least $minCount arguments, but $size arguments given",
            )
        }
    }
}
