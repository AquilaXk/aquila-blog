package com.back.boundedContexts.post.adapter.`in`.web

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.standard.extensions.getOrThrow
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ApiV1PostCommentControllerTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    private lateinit var post: Post
    private lateinit var commentByAuthor: PostComment

    @BeforeEach
    fun setUp() {
        val user1 = actorApplicationService.findByUsername("user1").getOrThrow()
        val user3 = actorApplicationService.findByUsername("user3").getOrThrow()

        post = postFacade.write(user1, "댓글 게시글", "댓글 게시글 내용", true, true)
        commentByAuthor = postFacade.writeComment(user1, post, "댓글 내용1")
        postFacade.writeComment(user3, post, "댓글 내용2")
    }

    @Nested
    inner class GetItems {
        @Test
        fun `게시글의 댓글 목록을 조회하면 생성된 댓글 목록이 정상 반환된다`() {
            val postId = post.id
            val comments = postFacade.getComments(postFacade.findById(postId).getOrThrow())

            val resultActions = mvc.get("/post/api/v1/posts/$postId/comments")

            resultActions.andExpect {
                match(handler().handlerType(ApiV1PostCommentController::class.java))
                match(handler().methodName("getItems"))
                status { isOk() }
                jsonPath("$.length()") { value(comments.size) }
            }

            for (i in comments.indices) {
                val postComment = comments[i]
                resultActions.andExpect {
                    jsonPath("$[$i].id") { value(postComment.id) }
                    jsonPath("$[$i].authorId") { value(postComment.author.id) }
                    jsonPath("$[$i].authorName") { value(postComment.author.name) }
                    jsonPath("$[$i].postId") { value(postComment.post.id) }
                    jsonPath("$[$i].content") { value(postComment.content) }
                }
            }
        }

        @Test
        fun `실패 - 존재하지 않는 글`() {
            mvc.get("/post/api/v1/posts/${Int.MAX_VALUE}/comments").andExpect {
                match(handler().handlerType(ApiV1PostCommentController::class.java))
                match(handler().methodName("getItems"))
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
            }
        }

        @Test
        fun `댓글 목록 조회는 잘못된 인증 정보가 있어도 정상 반환된다`() {
            mvc
                .get("/post/api/v1/posts/${post.id}/comments") {
                    cookie(Cookie("apiKey", "invalid-api-key"))
                    cookie(Cookie("accessToken", "invalid-access-token"))
                    header(HttpHeaders.AUTHORIZATION, "Bearer invalid-api-key invalid-access-token")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostCommentController::class.java))
                    match(handler().methodName("getItems"))
                }
        }
    }

    @Nested
    inner class GetItem {
        @Test
        fun `존재하는 댓글 식별자로 댓글을 조회하면 상세 정보가 정상 반환된다`() {
            val postId = post.id
            val id = commentByAuthor.id
            val postComment = postFacade.findCommentById(postFacade.findById(postId).getOrThrow(), id).getOrThrow()

            mvc.get("/post/api/v1/posts/$postId/comments/$id").andExpect {
                match(handler().handlerType(ApiV1PostCommentController::class.java))
                match(handler().methodName("getItem"))
                status { isOk() }
                jsonPath("$.id") { value(postComment.id) }
                jsonPath("$.authorId") { value(postComment.author.id) }
                jsonPath("$.authorName") { value(postComment.author.name) }
                jsonPath("$.postId") { value(postComment.post.id) }
                jsonPath("$.content") { value(postComment.content) }
            }
        }

        @Test
        fun `실패 - 존재하지 않는 댓글`() {
            mvc.get("/post/api/v1/posts/${post.id}/comments/${Int.MAX_VALUE}").andExpect {
                match(handler().handlerType(ApiV1PostCommentController::class.java))
                match(handler().methodName("getItem"))
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
            }
        }
    }

    @Nested
    inner class Write {
        @Test
        @WithUserDetails("user1")
        fun `인증된 사용자가 댓글을 작성하면 새 댓글이 정상 생성된다`() {
            val postId = post.id

            val resultActions =
                mvc.post("/post/api/v1/posts/$postId/comments") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"content": "새 댓글 내용"}"""
                }

            val postComment = postFacade.getComments(postFacade.findById(postId).getOrThrow()).last()

            resultActions.andExpect {
                match(handler().handlerType(ApiV1PostCommentController::class.java))
                match(handler().methodName("write"))
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.msg") { value("${postComment.id}번 댓글이 작성되었습니다.") }
                jsonPath("$.data.id") { value(postComment.id) }
                jsonPath("$.data.authorId") { value(postComment.author.id) }
                jsonPath("$.data.postId") { value(postComment.post.id) }
                jsonPath("$.data.content") { value("새 댓글 내용") }
            }
        }

        @Test
        @WithUserDetails("user3")
        fun `인증된 사용자가 기존 댓글에 대댓글을 작성하면 부모 댓글 식별자가 함께 저장된다`() {
            val postId = post.id

            mvc
                .post("/post/api/v1/posts/$postId/comments") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"content": "대댓글 내용", "parentCommentId": ${commentByAuthor.id}}"""
                }.andExpect {
                    match(handler().handlerType(ApiV1PostCommentController::class.java))
                    match(handler().methodName("write"))
                    status { isCreated() }
                    jsonPath("$.data.content") { value("대댓글 내용") }
                    jsonPath("$.data.parentCommentId") { value(commentByAuthor.id) }
                }
        }

        @Test
        fun `실패 - 인증 없이`() {
            mvc
                .post("/post/api/v1/posts/${post.id}/comments") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"content": "내용"}"""
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-1") }
                }
        }

        @Test
        @WithUserDetails("user1")
        fun `실패 - 빈 내용`() {
            mvc
                .post("/post/api/v1/posts/${post.id}/comments") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"content": ""}"""
                }.andExpect {
                    match(handler().handlerType(ApiV1PostCommentController::class.java))
                    match(handler().methodName("write"))
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                }
        }
    }

    @Nested
    inner class Modify {
        @Test
        @WithUserDetails("user1")
        fun `작성자가 댓글을 수정 요청하면 내용이 정상적으로 변경된다`() {
            val postId = post.id
            val id = commentByAuthor.id

            mvc
                .put("/post/api/v1/posts/$postId/comments/$id") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"content": "내용 new"}"""
                }.andExpect {
                    match(handler().handlerType(ApiV1PostCommentController::class.java))
                    match(handler().methodName("modify"))
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                    jsonPath("$.msg") { value("${id}번 댓글이 수정되었습니다.") }
                }
        }

        @Test
        @WithUserDetails("user3")
        fun `실패 - 권한 없음`() {
            val postId = post.id
            val id = commentByAuthor.id

            mvc
                .put("/post/api/v1/posts/$postId/comments/$id") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"content": "내용 new"}"""
                }.andExpect {
                    match(handler().handlerType(ApiV1PostCommentController::class.java))
                    match(handler().methodName("modify"))
                    status { isForbidden() }
                    jsonPath("$.resultCode") { value("403-1") }
                    jsonPath("$.msg") { value("작성자만 댓글을 수정할 수 있습니다.") }
                }
        }
    }

    @Nested
    inner class Delete {
        @Test
        @WithUserDetails("user1")
        fun `작성자가 댓글 삭제 요청 시 댓글이 정상 삭제된다`() {
            val postId = post.id
            val id = commentByAuthor.id

            mvc.delete("/post/api/v1/posts/$postId/comments/$id").andExpect {
                match(handler().handlerType(ApiV1PostCommentController::class.java))
                match(handler().methodName("delete"))
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("${id}번 댓글이 삭제되었습니다.") }
            }

            val deletedAtExists =
                jdbcTemplate.queryForObject(
                    "select count(*) from post_comment where id = ? and deleted_at is not null",
                    Int::class.java,
                    id,
                )

            org.assertj.core.api.Assertions
                .assertThat(deletedAtExists)
                .isEqualTo(1)
        }

        @Test
        @WithUserDetails("user1")
        fun `부모 댓글을 삭제하면 그 대댓글도 함께 삭제된다`() {
            val reply = postFacade.writeComment(actorApplicationService.findByUsername("user3").getOrThrow(), post, "대댓글", commentByAuthor)
            val postId = post.id
            val id = commentByAuthor.id

            mvc.delete("/post/api/v1/posts/$postId/comments/$id").andExpect {
                match(handler().handlerType(ApiV1PostCommentController::class.java))
                match(handler().methodName("delete"))
                status { isOk() }
            }

            mvc.get("/post/api/v1/posts/$postId/comments").andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(1) }
            }

            val deletedRepliesCount =
                jdbcTemplate.queryForObject(
                    "select count(*) from post_comment where id in (?, ?) and deleted_at is not null",
                    Int::class.java,
                    id,
                    reply.id,
                )

            org.assertj.core.api.Assertions
                .assertThat(deletedRepliesCount)
                .isEqualTo(2)
        }

        @Test
        @WithUserDetails("user3")
        fun `실패 - 권한 없음`() {
            val postId = post.id
            val id = commentByAuthor.id

            mvc.delete("/post/api/v1/posts/$postId/comments/$id").andExpect {
                match(handler().handlerType(ApiV1PostCommentController::class.java))
                match(handler().methodName("delete"))
                status { isForbidden() }
                jsonPath("$.resultCode") { value("403-2") }
                jsonPath("$.msg") { value("작성자만 댓글을 삭제할 수 있습니다.") }
            }
        }
    }
}
