package com.back.global.exception.application

import com.back.global.rsData.RsData

class AppException(
    val errorCode: ErrorCode,
    overrideMessage: String? = null,
    cause: Throwable? = null,
) : RuntimeException(
        "${errorCode.code} : ${overrideMessage ?: errorCode.defaultUserMessage}",
        cause,
    ) {
    private val userMessage: String = overrideMessage ?: errorCode.defaultUserMessage

    val rsData: RsData<Void>
        get() = RsData(errorCode.code, userMessage)
}
