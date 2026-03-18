package com.back.global.exception.application

import com.back.global.rsData.RsData

/**
 * AppException는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
class AppException(
    private val resultCode: String,
    private val msg: String,
) : RuntimeException(
        "$resultCode : $msg",
    ) {
    val rsData: RsData<Void>
        get() = RsData(resultCode, msg)
}
