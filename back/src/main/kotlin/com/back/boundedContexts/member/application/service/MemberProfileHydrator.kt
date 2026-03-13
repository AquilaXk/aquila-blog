package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.out.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.HOME_INTRO_DESCRIPTION
import com.back.boundedContexts.member.domain.shared.memberMixin.HOME_INTRO_TITLE
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_BIO
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_ROLE
import org.springframework.stereotype.Component

@Component
class MemberProfileHydrator(
    private val memberAttrRepository: MemberAttrRepositoryPort,
) {
    private val profileAttrNames =
        listOf(
            PROFILE_IMG_URL,
            PROFILE_ROLE,
            PROFILE_BIO,
            HOME_INTRO_TITLE,
            HOME_INTRO_DESCRIPTION,
        )

    fun hydrate(member: Member): Member {
        member.getOrInitProfileImgUrlAttr {
            memberAttrRepository.findBySubjectAndName(member, PROFILE_IMG_URL)
                ?: MemberAttr(0, member, PROFILE_IMG_URL, "")
        }
        member.getOrInitProfileRoleAttr {
            memberAttrRepository.findBySubjectAndName(member, PROFILE_ROLE)
                ?: MemberAttr(0, member, PROFILE_ROLE, "")
        }
        member.getOrInitProfileBioAttr {
            memberAttrRepository.findBySubjectAndName(member, PROFILE_BIO)
                ?: MemberAttr(0, member, PROFILE_BIO, "")
        }
        member.getOrInitHomeIntroTitleAttr {
            memberAttrRepository.findBySubjectAndName(member, HOME_INTRO_TITLE)
                ?: MemberAttr(0, member, HOME_INTRO_TITLE, "")
        }
        member.getOrInitHomeIntroDescriptionAttr {
            memberAttrRepository.findBySubjectAndName(member, HOME_INTRO_DESCRIPTION)
                ?: MemberAttr(0, member, HOME_INTRO_DESCRIPTION, "")
        }

        return member
    }

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
            member.getOrInitHomeIntroTitleAttr {
                attrsByKey["${member.id}:$HOME_INTRO_TITLE"] ?: MemberAttr(0, member, HOME_INTRO_TITLE, "")
            }
            member.getOrInitHomeIntroDescriptionAttr {
                attrsByKey["${member.id}:$HOME_INTRO_DESCRIPTION"] ?: MemberAttr(0, member, HOME_INTRO_DESCRIPTION, "")
            }
        }

        return members
    }
}
