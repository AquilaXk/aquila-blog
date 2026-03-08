package com.back.boundedContexts.member.domain.shared

class MemberProxy(
    private val real: Member,
    id: Int,
    username: String,
    nickname: String,
) : Member(id, username, null, nickname) {
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
