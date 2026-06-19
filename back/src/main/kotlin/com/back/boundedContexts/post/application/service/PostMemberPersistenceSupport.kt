package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberProxy

internal fun Member.toPersistenceMember(): Member = if (this is MemberProxy) persistenceMember else this
