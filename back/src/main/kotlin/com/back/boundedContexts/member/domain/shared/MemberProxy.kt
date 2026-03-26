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
) : Member(id, username, null, nickname, real.email) {
    val persistenceMember: Member
        get() = real

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

    override var profileImgUrl
        get() = real.profileImgUrl
        set(value) {
            real.profileImgUrl = value
        }

    override val profileImgUrlOrDefault: String
        get() = real.profileImgUrlOrDefault

    override var profileRole
        get() = real.profileRole
        set(value) {
            real.profileRole = value
        }

    override var profileBio
        get() = real.profileBio
        set(value) {
            real.profileBio = value
        }

    override var aboutRole
        get() = real.aboutRole
        set(value) {
            real.aboutRole = value
        }

    override var aboutBio
        get() = real.aboutBio
        set(value) {
            real.aboutBio = value
        }

    override var aboutDetails
        get() = real.aboutDetails
        set(value) {
            real.aboutDetails = value
        }

    override var homeIntroTitle
        get() = real.homeIntroTitle
        set(value) {
            real.homeIntroTitle = value
        }

    override var homeIntroDescription
        get() = real.homeIntroDescription
        set(value) {
            real.homeIntroDescription = value
        }

    override var serviceLinks
        get() = real.serviceLinks
        set(value) {
            real.serviceLinks = value
        }

    override var contactLinks
        get() = real.contactLinks
        set(value) {
            real.contactLinks = value
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
