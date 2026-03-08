package com.back.boundedContexts.post.`in`

import com.back.boundedContexts.member.out.shared.MemberApiClient
import com.back.boundedContexts.post.app.PostFacade
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/post/api/v1/adm/posts")
@Tag(name = "ApiV1AdmPostController", description = "관리자용 API 글 컨트롤러")
@SecurityRequirement(name = "bearerAuth")
class ApiV1AdmPostController(
    private val postFacade: PostFacade,
    private val memberApiClient: MemberApiClient,
) {
    data class AdmPostCountResBody(val all: Long, val secureTip: String)

    @GetMapping("/count")
    @Transactional(readOnly = true)
    @Operation(summary = "전체 글 개수")
    fun count(): AdmPostCountResBody {
        return AdmPostCountResBody(
            postFacade.count(),
            memberApiClient.randomSecureTip
        )
    }
}
