package com.back.global.security.config

/**
 * PublicApiRouteContributor는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
interface PublicApiRouteContributor {
    fun publicApiRoutes(): List<PublicApiRouteSpec>
}
