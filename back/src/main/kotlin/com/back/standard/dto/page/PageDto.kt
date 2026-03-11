package com.back.standard.dto.page

import org.springframework.data.domain.Page

data class PageDto<T : Any>(
    val content: List<T>,
    val pageable: PageableDto,
) {
    constructor(page: Page<T>) : this(
        content = page.content,
        pageable =
            PageableDto(
                pageNumber = page.pageable.pageNumber + 1,
                pageSize = page.pageable.pageSize,
                offset = page.pageable.offset,
                totalElements = page.totalElements,
                totalPages = page.totalPages,
                numberOfElements = page.numberOfElements,
                paged = page.pageable.isPaged,
            ),
    )
}
