package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.application.service.PostHitDedupService
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import com.back.support.SeededSpringBootTestSupport
import jakarta.persistence.EntityManager
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers
import org.junit.jupiter.api.AfterEach
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
class ApiV1PostControllerTest : SeededSpringBootTestSupport() {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postHitDedupService: PostHitDedupService

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    private lateinit var entityManager: EntityManager

    @AfterEach
    fun clearHitDedupState() {
        postHitDedupService.clearAllForTest()
    }

    @Nested
    inner class Write {
        @Test
        @WithUserDetails("admin")
        fun `인증된 사용자가 글을 작성하면 제목과 내용이 저장된 게시글이 정상 생성된다`() {
            val resultActions =
                mvc.post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목", "content": "내용"}"""
                }

            val post = postFacade.findLatest().getOrThrow()

            resultActions.andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("write"))
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.msg") { value("${post.id}번 글이 작성되었습니다.") }
                jsonPath("$.data.id") { value(post.id) }
                jsonPath("$.data.authorId") { value(post.author.id) }
                jsonPath("$.data.authorName") { value(post.author.name) }
                jsonPath("$.data.title") { value("제목") }
                jsonPath("$.data.published") { value(false) }
                jsonPath("$.data.listed") { value(false) }
            }
        }

        @Test
        @WithUserDetails("admin")
        fun `성공 - 공개 글 작성`() {
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "공개 글", "content": "내용", "published": true, "listed": true}"""
                }.andExpect {
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("write"))
                    status { isCreated() }
                    jsonPath("$.data.published") { value(true) }
                    jsonPath("$.data.listed") { value(true) }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `실패 - 제목 없이`() {
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "", "content": "내용"}"""
                }.andExpect {
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("write"))
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                }
        }

        @Test
        fun `실패 - 인증 없이`() {
            mvc
                .post("/post/api/v1/posts") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목", "content": "내용"}"""
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-1") }
                    jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
                }
        }

        @Test
        fun `실패 - 인증 헤더 없이 post api 접근시 401`() {
            mvc
                .post("/post/api/v1/posts") {
                    header(HttpHeaders.AUTHORIZATION, "Bearer some-token")
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목", "content": "내용"}"""
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-3") }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `동일 Idempotency-Key 로 글 작성 요청을 재시도하면 중복 생성되지 않는다`() {
            val beforeCount = postFacade.count()
            val idempotencyKey = "same-write-key-001"

            mvc
                .post("/post/api/v1/posts") {
                    header("Idempotency-Key", idempotencyKey)
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "멱등 글", "content": "멱등 내용"}"""
                }.andExpect {
                    status { isCreated() }
                }

            mvc
                .post("/post/api/v1/posts") {
                    header("Idempotency-Key", idempotencyKey)
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "멱등 글", "content": "멱등 내용"}"""
                }.andExpect {
                    status { isCreated() }
                }

            val afterCount = postFacade.count()
            assertThat(afterCount).isEqualTo(beforeCount + 1)
        }

        @Test
        @WithUserDetails("admin")
        fun `contentHtml 저장 시 위험한 스크립트와 이벤트 속성은 제거된다`() {
            mvc.post("/post/api/v1/posts") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "보안 테스트",
                      "content": "본문",
                      "contentHtml": "<p onclick=\"alert('x')\">safe</p><script>alert('x')</script>"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isCreated() }
            }

            val post = postFacade.findLatest().getOrThrow()
            assertThat(post.contentHtml).contains("<p>safe</p>")
            assertThat(post.contentHtml).doesNotContain("onclick")
            assertThat(post.contentHtml).doesNotContain("<script")
        }
    }

    @Nested
    inner class GetItem {
        @Test
        fun `성공 - 공개 글`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()

            mvc.get("/post/api/v1/posts/${post.id}").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("getItem"))
                status { isOk() }
                jsonPath("$.id") { value(post.id) }
                jsonPath("$.authorId") { value(post.author.id) }
                jsonPath("$.title") { value(post.title) }
                jsonPath("$.authorProfileImageDirectUrl") { value(post.author.profileImgUrlOrDefault) }
                jsonPath("$.published") { value(post.published) }
            }
        }

        @Test
        @WithUserDetails("user1")
        fun `성공 - 미공개 글 작성자 조회`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            val post = postFacade.write(actor, "미공개 글", "내용", false, false)

            mvc.get("/post/api/v1/posts/${post.id}").andExpect {
                status { isOk() }
                jsonPath("$.published") { value(false) }
            }
        }

        @Test
        fun `실패 - 존재하지 않는 글`() {
            mvc.get("/post/api/v1/posts/${Int.MAX_VALUE}").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("getItem"))
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
            }
        }

        @Test
        @WithUserDetails("user3")
        fun `실패 - 미공개 글 다른 사용자`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            val post = postFacade.write(actor, "미공개 글", "내용", false, false)

            mvc.get("/post/api/v1/posts/${post.id}").andExpect {
                status { isForbidden() }
                jsonPath("$.resultCode") { value("403-3") }
            }
        }
    }

    @Nested
    inner class GetItems {
        @Test
        fun `성공 - 기본값 조회`() {
            val posts = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 30).content

            mvc.get("/post/api/v1/posts").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("getItems"))
                status { isOk() }
                jsonPath("$.content.length()") { value(posts.size) }
            }
        }

        @Test
        fun `성공 - 페이지와 페이지 크기 경계 보정 조회`() {
            val posts = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 30).content

            mvc.get("/post/api/v1/posts?page=0&pageSize=31").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("getItems"))
                status { isOk() }
                jsonPath("$.content.length()") { value(posts.size) }
            }
        }

        @Test
        fun `성공 - 기본 페이징 필드 검증`() {
            val posts = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 5).content

            val resultActions = mvc.get("/post/api/v1/posts?page=1&pageSize=5")

            resultActions.andExpect {
                status { isOk() }
                jsonPath("$.content.length()") { value(posts.size) }
            }

            for (i in posts.indices) {
                val post = posts[i]
                resultActions.andExpect {
                    jsonPath("$.content[$i].id") { value(post.id) }
                    jsonPath("$.content[$i].authorId") { value(post.author.id) }
                    jsonPath("$.content[$i].title") { value(post.title) }
                }
            }
        }

        @Test
        fun `비공개 글은 공개 목록에서 조회되지 않는다`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            val unpublishedPost = postFacade.write(actor, "비공개 글", "비공개 내용", false, false)

            mvc.get("/post/api/v1/posts").andExpect {
                status { isOk() }
                jsonPath("$.content[*].id") { value(Matchers.not(Matchers.hasItem(unpublishedPost.id))) }
            }
        }

        @Test
        fun `공개지만 목록 미노출 글은 공개 목록에서 조회되지 않는다`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            val unlistedPost = postFacade.write(actor, "비노출 공개 글", "비노출 내용", true, false)

            mvc.get("/post/api/v1/posts").andExpect {
                status { isOk() }
                jsonPath("$.content[*].id") { value(Matchers.not(Matchers.hasItem(unlistedPost.id))) }
            }
        }

        @Test
        fun `공개 글 목록 조회는 잘못된 인증 정보가 있어도 정상 반환된다`() {
            mvc
                .get("/post/api/v1/posts") {
                    cookie(Cookie("apiKey", "invalid-api-key"))
                    cookie(Cookie("accessToken", "invalid-access-token"))
                    header(HttpHeaders.AUTHORIZATION, "Bearer invalid-api-key invalid-access-token")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("getItems"))
                }
        }

        @Test
        fun `탐색 목록 조회는 tags 와 category 메타를 포함한다`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            val uniqueTitle = "feed-meta-${System.currentTimeMillis()}"
            val postContent =
                """
                tags: [성능, 피드]
                categories: [백엔드]

                피드 메타 테스트 본문
                """.trimIndent()
            val post = postFacade.write(actor, uniqueTitle, postContent, true, true)

            mvc
                .get("/post/api/v1/posts/explore") {
                    param("kw", uniqueTitle)
                    param("page", "1")
                    param("pageSize", "30")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("explore"))
                    jsonPath("$.content[*].id") { value(Matchers.hasItem(post.id)) }
                    jsonPath("$.content[?(@.id == ${post.id})].tags[*]") { value(Matchers.hasItems("성능", "피드")) }
                    jsonPath("$.content[?(@.id == ${post.id})].category[*]") { value(Matchers.hasItem("백엔드")) }
                }
        }

        @Test
        fun `태그 집계 조회는 공개 목록의 태그 카운트를 반환한다`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            postFacade.write(
                actor,
                "tags-aggregation-${System.currentTimeMillis()}",
                """
                tags: [운영, 운영, 성능]

                본문
                """.trimIndent(),
                true,
                true,
            )

            mvc
                .get("/post/api/v1/posts/tags")
                .andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("getTags"))
                    jsonPath("$[*].tag") { value(Matchers.hasItems("운영", "성능")) }
                    jsonPath("$[?(@.tag == '운영')].count") { value(Matchers.hasItem(Matchers.greaterThanOrEqualTo(1))) }
                }
        }
    }

    @Nested
    inner class Modify {
        @Test
        @WithUserDetails("admin")
        fun `인증된 작성자가 기존 글 수정 요청 시 글이 정상 변경된다`() {
            val actor = actorApplicationService.findByUsername("admin").getOrThrow()
            val post = postFacade.write(actor, "원래 제목", "원래 내용", true, true)

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목 new", "content": "내용 new"}"""
                }.andExpect {
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("modify"))
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                    jsonPath("$.msg") { value("${post.id}번 글이 수정되었습니다.") }
                }
        }

        @Test
        @WithUserDetails("user3")
        fun `실패 - 권한 없음`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            val post = postFacade.write(actor, "원래 제목", "원래 내용", true, true)

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목 new", "content": "내용 new"}"""
                }.andExpect {
                    status { isForbidden() }
                    jsonPath("$.resultCode") { value("403-1") }
                    jsonPath("$.msg") { value("권한이 없습니다.") }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `published false로 수정하면 listed가 자동으로 false가 된다`() {
            val actor = actorApplicationService.findByUsername("admin").getOrThrow()
            val post = postFacade.write(actor, "공개 글", "내용", true, true)

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "공개 글", "content": "내용", "published": false}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.published") { value(false) }
                    jsonPath("$.data.listed") { value(false) }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `실패 - 존재하지 않는 글`() {
            mvc
                .put("/post/api/v1/posts/${Int.MAX_VALUE}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목 new", "content": "내용 new"}"""
                }.andExpect {
                    status { isNotFound() }
                    jsonPath("$.resultCode") { value("404-1") }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `실패 - 요청 version 이 현재 version 과 다르면 409`() {
            val actor = actorApplicationService.findByUsername("admin").getOrThrow()
            val post = postFacade.write(actor, "원래 제목", "원래 내용", true, true)
            val staleVersion = (post.version ?: 0L) + 1

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목 new", "content": "내용 new", "version": $staleVersion}"""
                }.andExpect {
                    status { isConflict() }
                    jsonPath("$.resultCode") { value("409-1") }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `글 수정 시 contentHtml 은 sanitize 후 저장된다`() {
            val actor = actorApplicationService.findByUsername("admin").getOrThrow()
            val post = postFacade.write(actor, "원본", "원본 본문", true, true)

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "수정 제목",
                          "content": "수정 본문",
                          "contentHtml": "<a href=\"javascript:alert(1)\">link</a><img src=\"https://example.com/a.png\" onerror=\"alert(1)\" />"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                }

            val modified = postFacade.findById(post.id).getOrThrow()
            assertThat(modified.contentHtml).doesNotContain("javascript:")
            assertThat(modified.contentHtml).doesNotContain("onerror")
            assertThat(modified.contentHtml).contains("<a>link</a>")
            assertThat(modified.contentHtml).contains("""<img src="https://example.com/a.png">""")
        }
    }

    @Nested
    inner class Delete {
        @Test
        @WithUserDetails("admin")
        fun `작성자가 본인 글 삭제 요청 시 삭제가 성공적으로 처리된다`() {
            val actor = actorApplicationService.findByUsername("admin").getOrThrow()
            val post = postFacade.write(actor, "삭제할 글", "내용", true, true)

            mvc.delete("/post/api/v1/posts/${post.id}").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("delete"))
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("${post.id}번 글이 삭제되었습니다.") }
            }
        }

        @Test
        @WithUserDetails("admin")
        fun `성공 - 관리자가 다른 사람 글 삭제`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            val post = postFacade.write(actor, "삭제될 글", "내용", true, true)

            mvc.delete("/post/api/v1/posts/${post.id}").andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
            }
        }

        @Test
        @WithUserDetails("user3")
        fun `실패 - 권한 없음`() {
            val actor = actorApplicationService.findByUsername("user1").getOrThrow()
            val post = postFacade.write(actor, "다른 사람 글", "내용", true, true)

            mvc.delete("/post/api/v1/posts/${post.id}").andExpect {
                status { isForbidden() }
                jsonPath("$.resultCode") { value("403-1") }
                jsonPath("$.msg") { value("권한이 없습니다.") }
            }
        }

        @Test
        @WithUserDetails("admin")
        fun `실패 - 존재하지 않는 글`() {
            mvc.delete("/post/api/v1/posts/${Int.MAX_VALUE}").andExpect {
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
            }
        }
    }

    @Nested
    inner class IncrementHit {
        @Test
        fun `글 조회가 호출되면 조회수 증가가 정상 반영된다`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()
            val initialHitCount = post.hitCount

            mvc
                .post("/post/api/v1/posts/${post.id}/hit") {
                    header("X-Forwarded-For", "203.0.113.10")
                    header(HttpHeaders.USER_AGENT, "JUnit-hit-single")
                }.andExpect {
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("incrementHit"))
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                    jsonPath("$.msg") { value("조회수를 반영했습니다.") }
                    jsonPath("$.data.hitCount") { value(initialHitCount + 1) }
                }
        }

        @Test
        fun `실패 - 존재하지 않는 글`() {
            mvc.post("/post/api/v1/posts/${Int.MAX_VALUE}/hit").andExpect {
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
            }
        }

        @Test
        fun `같은 방문자의 반복 조회는 일정 시간 동안 한번만 반영된다`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()
            val initialHitCount = post.hitCount

            mvc
                .post("/post/api/v1/posts/${post.id}/hit") {
                    header("X-Forwarded-For", "203.0.113.11")
                    header(HttpHeaders.USER_AGENT, "JUnit-hit-dedup")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.hitCount") { value(initialHitCount + 1) }
                }

            mvc
                .post("/post/api/v1/posts/${post.id}/hit") {
                    header("X-Forwarded-For", "203.0.113.11")
                    header(HttpHeaders.USER_AGENT, "JUnit-hit-dedup")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.hitCount") { value(initialHitCount + 1) }
                }
        }
    }

    @Nested
    inner class ToggleLike {
        @Test
        @WithUserDetails("user1")
        fun `성공 - 좋아요 추가`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()

            mvc.post("/post/api/v1/posts/${post.id}/like").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("toggleLike"))
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("좋아요를 눌렀습니다.") }
                jsonPath("$.data.liked") { value(true) }
                jsonPath("$.data.likesCount") { isNumber() }
            }
        }

        @Test
        @WithUserDetails("user1")
        fun `성공 - 좋아요 취소`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()

            mvc.post("/post/api/v1/posts/${post.id}/like")

            mvc.post("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.msg") { value("좋아요를 취소했습니다.") }
                jsonPath("$.data.liked") { value(false) }
            }
        }

        @Test
        @WithUserDetails("user1")
        fun `좋아요 카운터 attr 누락 상태에서도 토글 취소가 409 없이 동작한다`() {
            val author = actorApplicationService.findByUsername("admin").getOrThrow()
            val post = postFacade.write(author, "like-attr-missing-${System.currentTimeMillis()}", "내용", true, true)

            mvc.put("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.data.liked") { value(true) }
            }

            jdbcTemplate.update(
                "update post set likes_count_attr_id = null where id = ?",
                post.id,
            )

            jdbcTemplate.update(
                "delete from post_attr where subject_id = ? and name = ?",
                post.id,
                "likesCount",
            )
            entityManager.clear()

            mvc.post("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.msg") { value("좋아요를 취소했습니다.") }
                jsonPath("$.data.liked") { value(false) }
                jsonPath("$.data.likesCount") { value(0) }
            }
        }

        @Test
        fun `실패 - 인증 없이`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()

            mvc.post("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-1") }
            }
        }

        @Test
        @WithUserDetails("user1")
        fun `멱등 like 요청은 여러 번 보내도 좋아요가 한번만 유지된다`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()
            val initialLikesCount = post.likesCount

            mvc.put("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.msg") { value("좋아요를 반영했습니다.") }
                jsonPath("$.data.liked") { value(true) }
                jsonPath("$.data.likesCount") { value(initialLikesCount + 1) }
            }

            mvc.put("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.data.liked") { value(true) }
                jsonPath("$.data.likesCount") { value(initialLikesCount + 1) }
            }
        }

        @Test
        @WithUserDetails("user1")
        fun `멱등 unlike 요청은 여러 번 보내도 취소 상태가 유지된다`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()
            val initialLikesCount = post.likesCount

            mvc.put("/post/api/v1/posts/${post.id}/like")

            mvc.delete("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.msg") { value("좋아요 취소를 반영했습니다.") }
                jsonPath("$.data.liked") { value(false) }
                jsonPath("$.data.likesCount") { value(initialLikesCount) }
            }

            mvc.delete("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.data.liked") { value(false) }
                jsonPath("$.data.likesCount") { value(initialLikesCount) }
            }
        }
    }

    @Nested
    inner class GetMine {
        @Test
        @WithUserDetails("admin")
        fun `성공 - 내 글 목록 조회`() {
            mvc.get("/post/api/v1/posts/mine?page=1&pageSize=10").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("getMine"))
                status { isOk() }
                jsonPath("$.content") { isArray() }
            }
        }

        @Test
        @WithUserDetails("admin")
        fun `성공 - 키워드 검색`() {
            val actor = actorApplicationService.findByUsername("admin").getOrThrow()
            val targetPost = postFacade.write(actor, "내 검색 키워드 글", "검색 검증 글")

            mvc
                .get("/post/api/v1/posts/mine") {
                    param("page", "1")
                    param("pageSize", "10")
                    param("kw", "검색")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content[*].id") { value(Matchers.hasItem(targetPost.id)) }
                    jsonPath("$.content[*].authorId") { value(Matchers.hasItem(actor.id)) }
                }
        }

        @Test
        fun `실패 - 인증 없이`() {
            mvc.get("/post/api/v1/posts/mine?page=1&pageSize=10").andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-1") }
            }
        }
    }

    @Nested
    inner class GetOrCreateTemp {
        @Test
        @WithUserDetails("admin")
        fun `성공 - 새 임시글`() {
            mvc.post("/post/api/v1/posts/temp").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("getOrCreateTemp"))
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.data.published") { value(false) }
                jsonPath("$.data.listed") { value(false) }
            }
        }

        @Test
        @WithUserDetails("admin")
        fun `성공 - 기존 임시글`() {
            mvc.post("/post/api/v1/posts/temp")

            mvc.post("/post/api/v1/posts/temp").andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("기존 임시저장 글을 불러옵니다.") }
            }
        }

        @Test
        fun `실패 - 인증 없이`() {
            mvc.post("/post/api/v1/posts/temp").andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-1") }
            }
        }
    }
}
