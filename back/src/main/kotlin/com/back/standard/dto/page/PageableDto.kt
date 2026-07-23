package com.back.standard.dto.page

data class PageableDto(
    var pageNumber: Int = 1,
    var pageSize: Int = 30,
    var offset: Long = 0,
    var totalElements: Long = 0,
    var totalPages: Int = 0,
    var numberOfElements: Int = 0,
    var paged: Boolean = true,
)
