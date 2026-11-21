package com.back.standard.dto.page

import kotlin.math.ceil

data class PagedResult<T : Any>(
    val content: List<T>,
    val page: Int,
    val pageSize: Int,
    val totalElements: Long,
) {
    val numberOfElements: Int
        get() = content.size

    val totalPages: Int
        get() = if (pageSize <= 0) 0 else ceil(totalElements.toDouble() / pageSize.toDouble()).toInt()

    fun <R : Any> map(transform: (T) -> R): PagedResult<R> =
        PagedResult(
            content = content.map(transform),
            page = page,
            pageSize = pageSize,
            totalElements = totalElements,
        )
}
