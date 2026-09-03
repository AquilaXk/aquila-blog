package com.back.boundedContexts.member.domain.shared

// SecurityContext에서 꺼낸 lightweight actor를 real Member 참조와 동기화하기 위한 래퍼다.
// equals/hashCode는 BaseEntity 기준(id + identityClass)으로 동작하도록 별도 하드닝되어 있다.

/**
 * MemberProxy는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
class MemberProxy(
    private val real: Member,
    id: Long,
    username: String,
    nickname: String,
) : Member(id, username, null, nickname, real.email, real.isAdmin) {
    val persistenceMember: Member
        get() = real

    override val isAdmin: Boolean
        get() = real.isAdmin

    override fun grantAdmin() {
        real.grantAdmin()
        super.grantAdmin()
    }

    override var nickname: String
        get() = super.nickname
        set(value) {
            super.nickname = value
            real.nickname = value
        }

    override var createdAt
        get() = real.createdAt
        set(value) {
            real.createdAt = value
        }

    override var modifiedAt
        get() = real.modifiedAt
        set(value) {
            real.modifiedAt = value
        }

    override var email
        get() = real.email
        set(value) {
            real.email = value
        }

    override var apiKey
        get() = real.apiKey
        set(value) {
            real.apiKey = value
        }

    override var password
        get() = real.password
        set(value) {
            real.password = value
        }
}
