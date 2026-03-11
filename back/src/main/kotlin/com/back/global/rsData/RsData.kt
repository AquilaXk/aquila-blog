package com.back.global.rsData

import com.fasterxml.jackson.annotation.JsonIgnore

data class RsData<T>(
    val resultCode: String,
    @field:JsonIgnore val statusCode: Int,
    val msg: String,
    val data: T
) {
    constructor(resultCode: String, msg: String, data: T = emptyData()) : this(
        resultCode,
        resultCode.split("-", ignoreCase = false, limit = 2)[0].toInt(),
        msg,
        data
    )

    @get:JsonIgnore
    val isSuccess: Boolean
        get() = statusCode in 200..399

    @get:JsonIgnore
    val isFail: Boolean
        get() = !isSuccess

    companion object {
        val OK: RsData<Void> = RsData("200-1", "성공")

        fun <T> ok(data: T): RsData<T> = RsData("200-1", "성공", data)

        fun <T> fail(resultCode: String, msg: String): RsData<T> = RsData(resultCode, msg)

        @Suppress("UNCHECKED_CAST")
        private fun <T> emptyData(): T = null as T
    }
}
