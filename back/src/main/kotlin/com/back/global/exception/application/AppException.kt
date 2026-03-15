package com.back.global.exception.application

import com.back.global.rsData.RsData

class AppException(
    private val resultCode: String,
    private val msg: String,
) : RuntimeException(
        "$resultCode : $msg",
    ) {
    val rsData: RsData<Void>
        get() = RsData(resultCode, msg)
}
