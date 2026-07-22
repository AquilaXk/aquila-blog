package com.back.global.exception.application

import com.back.global.rsData.RsData
import org.springframework.http.HttpStatus

/**
 * 백엔드 resultCode 단일 레지스트리.
 * 신규 코드는 대역 확인 → enum 추가 → docs/design/error-codes.md 갱신 순서로만 추가한다.
 *
 * 대역(두 번째 숫자): 1–9 global/security, 10–19 post, 20–29 member/auth,
 * 30–39 cloud/storage, 40–49 admin/system, 50+ 예약.
 */
enum class ErrorCode(
    val code: String,
    val status: HttpStatus,
    val defaultUserMessage: String,
    val kind: ErrorKind,
) {
    // --- 400 ---
    BAD_REQUEST(
        "400-1",
        HttpStatus.BAD_REQUEST,
        "잘못된 요청입니다.",
        ErrorKind.USER,
    ),
    MEMBER_BAD_REQUEST(
        "400-2",
        HttpStatus.BAD_REQUEST,
        "요청이 올바르지 않습니다.",
        ErrorKind.USER,
    ),
    IP_SECURITY_UNAVAILABLE(
        "400-3",
        HttpStatus.BAD_REQUEST,
        "IP 보안 정보를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.",
        ErrorKind.USER,
    ),

    // --- 401 ---
    UNAUTHORIZED(
        "401-1",
        HttpStatus.UNAUTHORIZED,
        "로그인 후 이용해주세요.",
        ErrorKind.USER,
    ),
    INVALID_BEARER(
        "401-2",
        HttpStatus.UNAUTHORIZED,
        "Authorization 헤더가 Bearer 형식이 아닙니다.",
        ErrorKind.USER,
    ),
    EMAIL_NOT_VERIFIED(
        "401-4",
        HttpStatus.UNAUTHORIZED,
        "이메일 인증이 완료되지 않았습니다.",
        ErrorKind.USER,
    ),
    IP_SECURITY_FAILED(
        "401-7",
        HttpStatus.UNAUTHORIZED,
        "IP 보안 검증에 실패했습니다. 다시 로그인해주세요.",
        ErrorKind.USER,
    ),
    SESSION_EXPIRED(
        "401-8",
        HttpStatus.UNAUTHORIZED,
        "세션이 만료되었습니다. 다시 로그인해주세요.",
        ErrorKind.USER,
    ),

    // --- 403 ---
    ACCESS_DENIED(
        "403-1",
        HttpStatus.FORBIDDEN,
        "권한이 없습니다.",
        ErrorKind.USER,
    ),
    CSRF_ORIGIN_DENIED(
        "403-2",
        HttpStatus.FORBIDDEN,
        "허용되지 않은 Origin의 요청입니다.",
        ErrorKind.USER,
    ),
    CSRF_PREFLIGHT_REQUIRED(
        "403-3",
        HttpStatus.FORBIDDEN,
        "CSRF preflight 헤더가 필요합니다.",
        ErrorKind.USER,
    ),
    OAUTH_SIGNUP_REQUIRED(
        "403-4",
        HttpStatus.FORBIDDEN,
        "소셜 로그인 신규 가입은 현재 지원하지 않습니다.",
        ErrorKind.USER,
    ),
    POST_EDIT_DENIED(
        "403-10",
        HttpStatus.FORBIDDEN,
        "작성자만 글을 수정할 수 있습니다.",
        ErrorKind.USER,
    ),
    POST_VIEW_DENIED(
        "403-11",
        HttpStatus.FORBIDDEN,
        "글 조회권한이 없습니다.",
        ErrorKind.USER,
    ),
    POST_DELETE_DENIED(
        "403-12",
        HttpStatus.FORBIDDEN,
        "작성자만 글을 삭제할 수 있습니다.",
        ErrorKind.USER,
    ),
    POST_COMMENT_EDIT_DENIED(
        "403-13",
        HttpStatus.FORBIDDEN,
        "작성자만 댓글을 수정할 수 있습니다.",
        ErrorKind.USER,
    ),
    POST_COMMENT_DELETE_DENIED(
        "403-14",
        HttpStatus.FORBIDDEN,
        "작성자만 댓글을 삭제할 수 있습니다.",
        ErrorKind.USER,
    ),
    CLOUD_PLAYBACK_DENIED(
        "403-30",
        HttpStatus.FORBIDDEN,
        "외부 재생 token이 올바르지 않거나 만료되었습니다.",
        ErrorKind.USER,
    ),

    // --- 404 ---
    NOT_FOUND(
        "404-1",
        HttpStatus.NOT_FOUND,
        "해당 데이터가 존재하지 않습니다.",
        ErrorKind.USER,
    ),
    MEMBER_SESSION_NOT_FOUND(
        "404-2",
        HttpStatus.NOT_FOUND,
        "유효하지 않은 세션입니다.",
        ErrorKind.USER,
    ),

    // --- 409 ---
    DB_CONFLICT(
        "409-1",
        HttpStatus.CONFLICT,
        "동시에 처리된 요청 충돌이 발생했습니다. 잠시 후 다시 시도해주세요.",
        ErrorKind.USER,
    ),
    RESOURCE_CONFLICT(
        "409-2",
        HttpStatus.CONFLICT,
        "이미 사용 중인 리소스입니다.",
        ErrorKind.USER,
    ),
    MEMBER_SIGNUP_RACE(
        "409-3",
        HttpStatus.CONFLICT,
        "동시에 처리된 회원가입 요청입니다. 다시 시도해주세요.",
        ErrorKind.USER,
    ),
    OAUTH_SIGNUP_POLICY(
        "409-4",
        HttpStatus.CONFLICT,
        "약관 또는 개인정보처리방침이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요.",
        ErrorKind.USER,
    ),
    POST_CONCURRENT_EDIT(
        "409-10",
        HttpStatus.CONFLICT,
        "다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요.",
        ErrorKind.USER,
    ),
    MEMBER_DUPLICATE(
        "409-20",
        HttpStatus.CONFLICT,
        "이미 존재하는 회원 아이디입니다.",
        ErrorKind.USER,
    ),
    MEMBER_WITHDRAWN(
        "409-21",
        HttpStatus.CONFLICT,
        "이미 탈퇴 처리된 계정입니다.",
        ErrorKind.USER,
    ),
    CLOUD_UPLOAD_CONFLICT(
        "409-30",
        HttpStatus.CONFLICT,
        "대용량 업로드 세션 상태가 변경되었습니다.",
        ErrorKind.USER,
    ),

    // --- 410 ---
    GONE(
        "410-1",
        HttpStatus.GONE,
        "요청한 리소스가 더 이상 유효하지 않습니다.",
        ErrorKind.USER,
    ),

    // --- 413 ---
    PAYLOAD_TOO_LARGE(
        "413-1",
        HttpStatus.PAYLOAD_TOO_LARGE,
        "업로드 가능한 파일 용량을 초과했습니다. 허용 크기 이내 파일로 다시 시도해주세요.",
        ErrorKind.USER,
    ),

    // --- 429 ---
    LOGIN_RATE_LIMITED(
        "429-1",
        HttpStatus.TOO_MANY_REQUESTS,
        "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
        ErrorKind.USER,
    ),
    SIGNUP_RATE_LIMITED(
        "429-2",
        HttpStatus.TOO_MANY_REQUESTS,
        "이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        ErrorKind.USER,
    ),
    API_RATE_LIMITED(
        "429-10",
        HttpStatus.TOO_MANY_REQUESTS,
        "요청이 너무 많습니다.",
        ErrorKind.USER,
    ),

    // --- 500 ---
    INTERNAL_ERROR(
        "500-1",
        HttpStatus.INTERNAL_SERVER_ERROR,
        "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        ErrorKind.DEVELOPER,
    ),
    MEMBER_USERNAME_GENERATE_FAILED(
        "500-2",
        HttpStatus.INTERNAL_SERVER_ERROR,
        "회원가입 사용자 식별자 생성에 실패했습니다.",
        ErrorKind.DEVELOPER,
    ),

    // --- 503 ---
    SERVICE_UNAVAILABLE(
        "503-1",
        HttpStatus.SERVICE_UNAVAILABLE,
        "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
        ErrorKind.USER,
    ),
    DEPENDENCY_NOT_READY(
        "503-2",
        HttpStatus.SERVICE_UNAVAILABLE,
        "보호 시스템이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.",
        ErrorKind.DEVELOPER,
    ),
    SIGNUP_PROTECTION_NOT_READY(
        "503-3",
        HttpStatus.SERVICE_UNAVAILABLE,
        "회원가입 보호 시스템이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.",
        ErrorKind.DEVELOPER,
    ),
    API_PROTECTION_NOT_READY(
        "503-4",
        HttpStatus.SERVICE_UNAVAILABLE,
        "API 보호 시스템이 준비되지 않았습니다.",
        ErrorKind.DEVELOPER,
    ),
    SIGNUP_NOT_LAUNCHED(
        "503-5",
        HttpStatus.SERVICE_UNAVAILABLE,
        "회원가입은 출시 준비 중입니다.",
        ErrorKind.USER,
    ),
    ;

    init {
        val prefix =
            code.substringBefore("-").toIntOrNull()
                ?: error("ErrorCode $name: code '$code' must be '{status}-{n}'")
        require(prefix == status.value()) {
            "ErrorCode $name: code prefix $prefix does not match status ${status.value()}"
        }
    }

    fun toRsData(): RsData<Void> = RsData(code, defaultUserMessage)

    fun toRsData(message: String): RsData<Void> = RsData(code, message)

    companion object {
        private val byCode: Map<String, ErrorCode> =
            entries.associateBy { it.code }.also { map ->
                require(map.size == entries.size) {
                    val duplicates =
                        entries
                            .groupBy { it.code }
                            .filter { it.value.size > 1 }
                            .keys
                    "Duplicate ErrorCode wire values: $duplicates"
                }
            }

        fun fromCode(code: String): ErrorCode = byCode[code] ?: error("Unknown ErrorCode: $code")
    }
}
