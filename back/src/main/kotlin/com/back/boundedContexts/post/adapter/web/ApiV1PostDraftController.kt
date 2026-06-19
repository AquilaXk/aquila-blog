package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletResponse
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/post/api/v1/posts")
class ApiV1PostDraftController(
    private val postUseCase: PostUseCase,
    private val postWebDtoAssembler: PostWebDtoAssembler,
    private val rq: Rq,
) {
    @PostMapping("/temp")
    @Transactional
    fun getOrCreateTemp(response: HttpServletResponse): RsData<PostWithContentDto> {
        val (post, isNew) = postUseCase.getOrCreateTemp(rq.actor)
        return if (isNew) {
            response.status = 201
            RsData("201-1", "임시저장 글이 생성되었습니다.", postWebDtoAssembler.makePostWithContentDto(post))
        } else {
            RsData("200-1", "기존 임시저장 글을 불러옵니다.", postWebDtoAssembler.makePostWithContentDto(post))
        }
    }
}
