package com.back.standard.util

import com.querydsl.core.types.Expression
import com.querydsl.core.types.Order
import com.querydsl.core.types.OrderSpecifier
import com.querydsl.core.types.Path
import com.querydsl.jpa.impl.JPAQuery
import org.springframework.data.domain.Pageable

object QueryDslUtil {
    @Suppress("UNCHECKED_CAST")
    fun <T> applySorting(
        query: JPAQuery<T>,
        pageable: Pageable,
        pathProvider: (String) -> Path<out Comparable<*>>?,
    ) {
        pageable.sort.forEach { order ->
            val path = pathProvider(order.property) ?: return@forEach

            query.orderBy(
                OrderSpecifier(
                    if (order.isAscending) Order.ASC else Order.DESC,
                    path as Expression<Comparable<*>>,
                ),
            )
        }
    }
}
