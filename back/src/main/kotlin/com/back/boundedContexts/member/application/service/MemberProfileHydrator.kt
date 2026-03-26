package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.ABOUT_BIO
import com.back.boundedContexts.member.domain.shared.memberMixin.ABOUT_DETAILS
import com.back.boundedContexts.member.domain.shared.memberMixin.ABOUT_ROLE
import com.back.boundedContexts.member.domain.shared.memberMixin.BLOG_TITLE
import com.back.boundedContexts.member.domain.shared.memberMixin.HOME_INTRO_DESCRIPTION
import com.back.boundedContexts.member.domain.shared.memberMixin.HOME_INTRO_TITLE
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_BIO
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_CONTACT_LINKS
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_ROLE
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_SERVICE_LINKS
import org.springframework.stereotype.Component

/**
 * MemberProfileHydrator는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Component
class MemberProfileHydrator(
    private val memberAttrRepository: MemberAttrRepositoryPort,
) {
    private val profileAttrNames =
        listOf(
            PROFILE_IMG_URL,
            PROFILE_ROLE,
            PROFILE_BIO,
            ABOUT_ROLE,
            ABOUT_BIO,
            ABOUT_DETAILS,
            BLOG_TITLE,
            HOME_INTRO_TITLE,
            HOME_INTRO_DESCRIPTION,
            PROFILE_SERVICE_LINKS,
            PROFILE_CONTACT_LINKS,
        )

    fun hydrate(member: Member): Member = hydrateAll(listOf(member)).first()

    /**
     * hydrateAll 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun hydrateAll(members: List<Member>): List<Member> {
        if (members.isEmpty()) return members

        val uniqueMembers = members.distinctBy { it.id }
        val attrsByKey =
            memberAttrRepository
                .findBySubjectInAndNameIn(uniqueMembers, profileAttrNames)
                .associateBy { "${it.subject.id}:${it.name}" }

        uniqueMembers.forEach { member ->
            member.getOrInitProfileImgUrlAttr {
                attrsByKey["${member.id}:$PROFILE_IMG_URL"] ?: MemberAttr(0, member, PROFILE_IMG_URL, "")
            }
            member.getOrInitProfileRoleAttr {
                attrsByKey["${member.id}:$PROFILE_ROLE"] ?: MemberAttr(0, member, PROFILE_ROLE, "")
            }
            member.getOrInitProfileBioAttr {
                attrsByKey["${member.id}:$PROFILE_BIO"] ?: MemberAttr(0, member, PROFILE_BIO, "")
            }
            member.getOrInitAboutRoleAttr {
                attrsByKey["${member.id}:$ABOUT_ROLE"] ?: MemberAttr(0, member, ABOUT_ROLE, "")
            }
            member.getOrInitAboutBioAttr {
                attrsByKey["${member.id}:$ABOUT_BIO"] ?: MemberAttr(0, member, ABOUT_BIO, "")
            }
            member.getOrInitAboutDetailsAttr {
                attrsByKey["${member.id}:$ABOUT_DETAILS"] ?: MemberAttr(0, member, ABOUT_DETAILS, "")
            }
            member.getOrInitBlogTitleAttr {
                attrsByKey["${member.id}:$BLOG_TITLE"] ?: MemberAttr(0, member, BLOG_TITLE, "")
            }
            member.getOrInitHomeIntroTitleAttr {
                attrsByKey["${member.id}:$HOME_INTRO_TITLE"] ?: MemberAttr(0, member, HOME_INTRO_TITLE, "")
            }
            member.getOrInitHomeIntroDescriptionAttr {
                attrsByKey["${member.id}:$HOME_INTRO_DESCRIPTION"] ?: MemberAttr(0, member, HOME_INTRO_DESCRIPTION, "")
            }
            member.getOrInitServiceLinksAttr {
                attrsByKey["${member.id}:$PROFILE_SERVICE_LINKS"] ?: MemberAttr(0, member, PROFILE_SERVICE_LINKS, "")
            }
            member.getOrInitContactLinksAttr {
                attrsByKey["${member.id}:$PROFILE_CONTACT_LINKS"] ?: MemberAttr(0, member, PROFILE_CONTACT_LINKS, "")
            }
        }

        return members
    }
}
