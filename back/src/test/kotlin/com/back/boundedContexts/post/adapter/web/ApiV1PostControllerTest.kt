package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.application.service.PostHitDedupService
import com.back.boundedContexts.post.application.service.PostQueryCacheNames
import com.back.boundedContexts.post.dto.PublicPostDetailSnapshotCacheDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import com.back.support.SeededSpringBootTestSupport
import com.jayway.jsonpath.JsonPath
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
import org.springframework.cache.CacheManager
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
@org.junit.jupiter.api.DisplayName("ApiV1PostController 테스트")
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

    @Autowired
    private lateinit var cacheManager: CacheManager

    @AfterEach
    fun clearHitDedupState() {
        postHitDedupService.clearAllForTest()
    }

    @Nested
    inner class Write {
        @Test
        @WithUserDetails("admin@test.com")
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
        @WithUserDetails("admin@test.com")
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
        @WithUserDetails("admin@test.com")
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
        @WithUserDetails("admin@test.com")
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
        @WithUserDetails("admin@test.com")
        fun `contentHtml 저장 시 위험한 스크립트와 이벤트 속성은 제거된다`() {
            mvc
                .post("/post/api/v1/posts") {
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
        fun `비로그인 상세 조회는 ETag 조건부 요청에 304를 반환한다`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()

            val etag =
                requireNotNull(
                    mvc
                        .get("/post/api/v1/posts/${post.id}")
                        .andExpect {
                            status { isOk() }
                            header { exists(HttpHeaders.ETAG) }
                        }.andReturn()
                        .response
                        .getHeader(HttpHeaders.ETAG),
                )

            assertThat(etag).isNotBlank()

            mvc
                .get("/post/api/v1/posts/${post.id}") {
                    header(HttpHeaders.IF_NONE_MATCH, etag)
                }.andExpect {
                    status { isNotModified() }
                    header { string(HttpHeaders.ETAG, etag) }
                }
        }

        @Test
        fun `비로그인 상세 조회는 merged snapshot cache를 채운다`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()
            cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT)?.evict(post.id)

            mvc.get("/post/api/v1/posts/${post.id}").andExpect {
                status { isOk() }
            }

            val snapshot =
                cacheManager
                    .getCache(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT)
                    ?.get(post.id, PublicPostDetailSnapshotCacheDto::class.java)

            assertThat(snapshot).isNotNull
            assertThat(snapshot?.id).isEqualTo(post.id)
            assertThat(snapshot?.content).isNotBlank()
        }

        @Test
        @WithUserDetails("user1@test.com")
        fun `성공 - 미공개 글 작성자 조회`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(actor, "미공개 글", "내용", false, false)

            mvc.get("/post/api/v1/posts/${post.id}").andExpect {
                status { isOk() }
                jsonPath("$.published") { value(false) }
            }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자 role 인증은 이메일 드리프트가 있어도 상세 수정 권한 플래그를 유지한다`() {
            val writer = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(writer, "관리자 권한 확인 글", "내용", false, false)
            val admin = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val driftedEmail = "admin-drift-${System.currentTimeMillis()}@test.com"

            jdbcTemplate.update("update member set email = ? where id = ?", driftedEmail, admin.id)
            entityManager.clear()

            mvc.get("/post/api/v1/posts/${post.id}").andExpect {
                status { isOk() }
                jsonPath("$.published") { value(false) }
                jsonPath("$.actorCanModify") { value(true) }
                jsonPath("$.actorCanDelete") { value(true) }
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
        @WithUserDetails("user3@test.com")
        fun `실패 - 미공개 글 다른 사용자`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
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
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val unpublishedPost = postFacade.write(actor, "비공개 글", "비공개 내용", false, false)

            mvc.get("/post/api/v1/posts").andExpect {
                status { isOk() }
                jsonPath("$.content[*].id") { value(Matchers.not(Matchers.hasItem(unpublishedPost.id))) }
            }
        }

        @Test
        fun `공개지만 목록 미노출 글은 공개 목록에서 조회되지 않는다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
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
        fun `feed 커서 조회는 잘못된 인증 정보가 있어도 정상 반환된다`() {
            mvc
                .get("/post/api/v1/posts/feed/cursor") {
                    param("sort", "CREATED_AT")
                    param("pageSize", "24")
                    cookie(Cookie("apiKey", "invalid-api-key"))
                    cookie(Cookie("accessToken", "invalid-access-token"))
                    header(HttpHeaders.AUTHORIZATION, "Bearer invalid-api-key invalid-access-token")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("getFeedByCursor"))
                }
        }

        @Test
        fun `explore 커서 조회는 잘못된 인증 정보가 있어도 정상 반환된다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            postFacade.write(
                actor,
                "explore-cursor-public-${System.currentTimeMillis()}",
                """
                tags: [커서공개]

                커서 공개 검증
                """.trimIndent(),
                true,
                true,
            )

            mvc
                .get("/post/api/v1/posts/explore/cursor") {
                    param("sort", "CREATED_AT")
                    param("tag", "커서공개")
                    param("pageSize", "24")
                    cookie(Cookie("apiKey", "invalid-api-key"))
                    cookie(Cookie("accessToken", "invalid-access-token"))
                    header(HttpHeaders.AUTHORIZATION, "Bearer invalid-api-key invalid-access-token")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("exploreByCursor"))
                }
        }

        @Test
        fun `공개 feed 조회는 ETag 조건부 요청에 304를 반환한다`() {
            val etag =
                requireNotNull(
                    mvc
                        .get("/post/api/v1/posts/feed") {
                            param("page", "1")
                            param("pageSize", "10")
                            param("sort", "CREATED_AT")
                        }.andExpect {
                            status { isOk() }
                            header { exists(HttpHeaders.ETAG) }
                        }.andReturn()
                        .response
                        .getHeader(HttpHeaders.ETAG),
                )

            assertThat(etag).isNotBlank()

            mvc
                .get("/post/api/v1/posts/feed") {
                    param("page", "1")
                    param("pageSize", "10")
                    param("sort", "CREATED_AT")
                    header(HttpHeaders.IF_NONE_MATCH, etag)
                }.andExpect {
                    status { isNotModified() }
                    header { string(HttpHeaders.ETAG, etag) }
                }
        }

        @Test
        fun `공개 feed 조회는 단일 Cache-Control 정책만 반환한다`() {
            val response =
                mvc
                    .get("/post/api/v1/posts/feed") {
                        param("page", "1")
                        param("pageSize", "10")
                        param("sort", "CREATED_AT")
                    }.andExpect {
                        status { isOk() }
                        header { exists(HttpHeaders.CACHE_CONTROL) }
                    }.andReturn()
                    .response

            val cacheControlHeaders = response.getHeaders(HttpHeaders.CACHE_CONTROL)
            assertThat(cacheControlHeaders).hasSize(1)
            assertThat(cacheControlHeaders.single())
                .contains("public")
                .contains("s-maxage")
                .contains("stale-while-revalidate")
            assertThat(response.getHeader(HttpHeaders.PRAGMA)).isNull()
            assertThat(response.getHeader(HttpHeaders.EXPIRES)).isNull()
        }

        @Test
        fun `홈 bootstrap 조회는 feed와 tags를 함께 반환하고 단일 Cache-Control 정책을 사용한다`() {
            val response =
                mvc
                    .get("/post/api/v1/posts/bootstrap") {
                        param("pageSize", "24")
                        param("sort", "CREATED_AT")
                    }.andExpect {
                        status { isOk() }
                        match(handler().handlerType(ApiV1PostController::class.java))
                        match(handler().methodName("getBootstrap"))
                        jsonPath("$.feed.content") { isArray() }
                        jsonPath("$.tags") { isArray() }
                        header { exists(HttpHeaders.CACHE_CONTROL) }
                        header { string("X-Cache-Policy", "bootstrap-max20-smax60-swr60") }
                    }.andReturn()
                    .response

            val cacheControlHeaders = response.getHeaders(HttpHeaders.CACHE_CONTROL)
            assertThat(cacheControlHeaders).hasSize(1)
            assertThat(cacheControlHeaders.single())
                .contains("public")
                .contains("s-maxage")
                .contains("stale-while-revalidate")
            assertThat(response.getHeader(HttpHeaders.PRAGMA)).isNull()
            assertThat(response.getHeader(HttpHeaders.EXPIRES)).isNull()
        }

        @Test
        fun `홈 bootstrap 조회는 ETag 조건부 요청에 304를 반환한다`() {
            val etag =
                requireNotNull(
                    mvc
                        .get("/post/api/v1/posts/bootstrap") {
                            param("pageSize", "24")
                            param("sort", "CREATED_AT")
                        }.andExpect {
                            status { isOk() }
                            header { exists(HttpHeaders.ETAG) }
                        }.andReturn()
                        .response
                        .getHeader(HttpHeaders.ETAG),
                )

            assertThat(etag).isNotBlank()

            mvc
                .get("/post/api/v1/posts/bootstrap") {
                    param("pageSize", "24")
                    param("sort", "CREATED_AT")
                    header(HttpHeaders.IF_NONE_MATCH, etag)
                }.andExpect {
                    status { isNotModified() }
                    header { string(HttpHeaders.ETAG, etag) }
                }
        }

        @Test
        fun `탐색 목록 조회는 tags 와 category 메타를 포함한다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
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
                    jsonPath("$.content[?(@.id == ${post.id})]") { value(Matchers.not(Matchers.empty<Any>())) }
                    jsonPath("$.content[?(@.id == ${post.id})].tags[*]") { value(Matchers.hasItems("성능", "피드")) }
                    jsonPath("$.content[?(@.id == ${post.id})].category[*]") { value(Matchers.hasItem("백엔드")) }
                }
        }

        @Test
        fun `검색 목록 조회는 keyword 기준으로 공개 글을 반환한다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val uniqueTitle = "search-list-${System.currentTimeMillis()}"
            val post =
                postFacade.write(
                    actor,
                    uniqueTitle,
                    """
                    tags: [검색, 검증]

                    검색 API 검증 본문
                    """.trimIndent(),
                    true,
                    true,
                )

            mvc
                .get("/post/api/v1/posts/search") {
                    param("kw", uniqueTitle)
                    param("page", "1")
                    param("pageSize", "30")
                    param("sort", "CREATED_AT")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("search"))
                    jsonPath("$.content[?(@.id == ${post.id})]") { value(Matchers.not(Matchers.empty<Any>())) }
                }
        }

        @Test
        fun `검색 목록 조회는 잘못된 인증 정보가 있어도 정상 반환된다`() {
            mvc
                .get("/post/api/v1/posts/search") {
                    param("kw", "알림")
                    param("page", "1")
                    param("pageSize", "24")
                    param("sort", "CREATED_AT")
                    cookie(Cookie("apiKey", "invalid-api-key"))
                    cookie(Cookie("accessToken", "invalid-access-token"))
                    header(HttpHeaders.AUTHORIZATION, "Bearer invalid-api-key invalid-access-token")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("search"))
                }
        }

        @Test
        fun `검색 목록 조회는 제목-태그-본문 가중치 순서로 정렬된다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val keyword = "rank-${System.currentTimeMillis()}"
            val titleMatchedPost =
                postFacade.write(
                    actor,
                    "제목 $keyword 매칭",
                    "제목 우선순위 검증 본문",
                    true,
                    true,
                )
            val tagMatchedPost =
                postFacade.write(
                    actor,
                    "태그 매칭 글",
                    """
                    tags: [$keyword]

                    태그 우선순위 검증 본문
                    """.trimIndent(),
                    true,
                    true,
                )
            val contentMatchedPost =
                postFacade.write(
                    actor,
                    "본문 매칭 글",
                    "이 글은 본문에서만 $keyword 를 포함합니다.",
                    true,
                    true,
                )

            mvc
                .get("/post/api/v1/posts/search") {
                    param("kw", keyword)
                    param("page", "1")
                    param("pageSize", "30")
                    param("sort", "CREATED_AT")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(3) }
                    jsonPath("$.content[0].id") { value(titleMatchedPost.id) }
                    jsonPath("$.content[1].id") { value(tagMatchedPost.id) }
                    jsonPath("$.content[2].id") { value(contentMatchedPost.id) }
                }
        }

        @Test
        fun `검색 목록 조회는 멀티 토큰 검색에서 구문 미일치 제목도 후보 상단에 유지한다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val tokenA = "spring${System.currentTimeMillis()}"
            val tokenB = "websocket"
            val keyword = "$tokenA $tokenB"
            val titleMatchedPost =
                postFacade.write(
                    actor,
                    "$tokenA 실시간 $tokenB 설계",
                    "멀티 토큰 제목 매치 검증 본문",
                    true,
                    true,
                )
            val contentPhrasePost =
                postFacade.write(
                    actor,
                    "본문 exact phrase 매치",
                    "이 글은 본문에서만 $keyword 를 포함합니다.",
                    true,
                    true,
                )

            mvc
                .get("/post/api/v1/posts/search") {
                    param("kw", keyword)
                    param("page", "1")
                    param("pageSize", "30")
                    param("sort", PostSearchSortType1.MODIFIED_AT.name)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(2) }
                    jsonPath("$.content[0].id") { value(titleMatchedPost.id) }
                    jsonPath("$.content[1].id") { value(contentPhrasePost.id) }
                }
        }

        @Test
        fun `검색 목록 조회는 hashtag 의도를 태그 필터로 인식한다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val uniqueTitle = "search-hashtag-${System.currentTimeMillis()}"
            val post =
                postFacade.write(
                    actor,
                    uniqueTitle,
                    """
                    tags: [SSE, 실시간]

                    hashtag 검색 의도 테스트 본문
                    """.trimIndent(),
                    true,
                    true,
                )

            mvc
                .get("/post/api/v1/posts/search") {
                    param("kw", "#SSE")
                    param("page", "1")
                    param("pageSize", "30")
                    param("sort", "CREATED_AT")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("search"))
                    jsonPath("$.content[?(@.id == ${post.id})]") { value(Matchers.not(Matchers.empty<Any>())) }
                    jsonPath("$.content[?(@.id == ${post.id})].tags[*]") { value(Matchers.hasItem("SSE")) }
                }
        }

        @Test
        fun `검색 목록 조회는 tag prefix 의도를 태그 필터로 인식한다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val uniqueTitle = "search-tag-prefix-${System.currentTimeMillis()}"
            val post =
                postFacade.write(
                    actor,
                    uniqueTitle,
                    """
                    tags: [Kotlin, JVM]

                    tag prefix 검색 의도 테스트 본문
                    """.trimIndent(),
                    true,
                    true,
                )

            mvc
                .get("/post/api/v1/posts/search") {
                    param("kw", "tag:Kotlin")
                    param("page", "1")
                    param("pageSize", "30")
                    param("sort", "CREATED_AT")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("search"))
                    jsonPath("$.content[?(@.id == ${post.id})]") { value(Matchers.not(Matchers.empty<Any>())) }
                    jsonPath("$.content[?(@.id == ${post.id})].tags[*]") { value(Matchers.hasItem("Kotlin")) }
                }
        }

        @Test
        fun `탐색 목록 조회는 tag 파라미터로 필터링된다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val uniqueTitle = "tag-filter-${System.currentTimeMillis()}"
            val post =
                postFacade.write(
                    actor,
                    uniqueTitle,
                    """
                    tags: [SSE, 실시간]

                    태그 필터 검증 본문
                    """.trimIndent(),
                    true,
                    true,
                )

            mvc
                .get("/post/api/v1/posts/explore") {
                    param("kw", "")
                    param("tag", "SSE")
                    param("page", "1")
                    param("pageSize", "30")
                    param("sort", "CREATED_AT")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("explore"))
                    jsonPath("$.content[?(@.id == ${post.id})]") { value(Matchers.not(Matchers.empty<Any>())) }
                    jsonPath("$.content[?(@.id == ${post.id})].tags[*]") { value(Matchers.hasItem("SSE")) }
                }
        }

        @Test
        fun `태그 집계 조회는 공개 목록의 태그 카운트를 반환한다`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
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

        @Test
        fun `태그 집계 조회는 public Cache-Control 정책을 반환한다`() {
            val response =
                mvc
                    .get("/post/api/v1/posts/tags")
                    .andExpect {
                        status { isOk() }
                        header { exists(HttpHeaders.CACHE_CONTROL) }
                    }.andReturn()
                    .response

            val cacheControlHeaders = response.getHeaders(HttpHeaders.CACHE_CONTROL)
            assertThat(cacheControlHeaders).hasSize(1)
            assertThat(cacheControlHeaders.single())
                .contains("public")
                .contains("s-maxage")
                .contains("stale-while-revalidate")
                .doesNotContain("no-store")
        }

        @Test
        fun `인증 필요 API는 Cache-Control 누락 시 private no-store 기본값을 반환한다`() {
            mvc
                .get("/post/api/v1/posts/mine")
                .andExpect {
                    status { isUnauthorized() }
                    header { string(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0") }
                    header { string(HttpHeaders.PRAGMA, "no-cache") }
                }
        }
    }

    @Nested
    inner class Modify {
        @Test
        @WithUserDetails("admin@test.com")
        fun `인증된 작성자가 기존 글 수정 요청 시 글이 정상 변경된다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val post = postFacade.write(actor, "원래 제목", "원래 내용", true, true)
            val version = post.version ?: 0L

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목 new", "content": "내용 new", "version": $version}"""
                }.andExpect {
                    match(handler().handlerType(ApiV1PostController::class.java))
                    match(handler().methodName("modify"))
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                    jsonPath("$.msg") { value("${post.id}번 글이 수정되었습니다.") }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `성공 - 관리자가 다른 사람 글 수정`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(actor, "원래 제목", "원래 내용", true, true)
            val version = post.version ?: 0L

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "관리자 수정 제목", "content": "관리자 수정 내용", "version": $version}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                    jsonPath("$.data.id") { value(post.id) }
                    jsonPath("$.data.title") { value("관리자 수정 제목") }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자 role 인증은 이메일 드리프트가 있어도 다른 사람 글 수정을 허용한다`() {
            val writer = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(writer, "원래 제목", "원래 내용", true, true)
            val admin = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val driftedEmail = "admin-drift-${System.currentTimeMillis()}@test.com"
            val version = post.version ?: 0L

            jdbcTemplate.update("update member set email = ? where id = ?", driftedEmail, admin.id)
            entityManager.clear()

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "관리자 수정 제목", "content": "관리자 수정 내용", "version": $version}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                    jsonPath("$.data.id") { value(post.id) }
                    jsonPath("$.data.title") { value("관리자 수정 제목") }
                }
        }

        @Test
        @WithUserDetails("user3@test.com")
        fun `실패 - 권한 없음`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(actor, "원래 제목", "원래 내용", true, true)
            val version = post.version ?: 0L

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목 new", "content": "내용 new", "version": $version}"""
                }.andExpect {
                    status { isForbidden() }
                    jsonPath("$.resultCode") { value("403-1") }
                    jsonPath("$.msg") { value("권한이 없습니다.") }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `published false로 수정하면 listed가 자동으로 false가 된다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val post = postFacade.write(actor, "공개 글", "내용", true, true)
            val version = post.version ?: 0L

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "공개 글", "content": "내용", "published": false, "version": $version}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.published") { value(false) }
                    jsonPath("$.data.listed") { value(false) }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `실패 - 존재하지 않는 글`() {
            mvc
                .put("/post/api/v1/posts/${Int.MAX_VALUE}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목 new", "content": "내용 new", "version": 0}"""
                }.andExpect {
                    status { isNotFound() }
                    jsonPath("$.resultCode") { value("404-1") }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `실패 - version 없이 수정 요청하면 400`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val post = postFacade.write(actor, "원래 제목", "원래 내용", true, true)

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title": "제목 new", "content": "내용 new"}"""
                }.andExpect {
                    status { isBadRequest() }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `실패 - 요청 version 이 현재 version 과 다르면 409`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
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
        @WithUserDetails("admin@test.com")
        fun `글 수정 시 contentHtml 은 sanitize 후 저장된다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val post = postFacade.write(actor, "원본", "원본 본문", true, true)
            val version = post.version ?: 0L

            mvc
                .put("/post/api/v1/posts/${post.id}") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "수정 제목",
                          "content": "수정 본문",
                          "version": $version,
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
        @WithUserDetails("admin@test.com")
        fun `작성자가 본인 글 삭제 요청 시 삭제가 성공적으로 처리된다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
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
        @WithUserDetails("admin@test.com")
        fun `legacy version null 글도 삭제 요청이 성공한다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val post = postFacade.write(actor, "legacy-version-null-${System.currentTimeMillis()}", "내용", true, true)

            jdbcTemplate.update("update post set version = null where id = ?", post.id)
            entityManager.clear()

            mvc.delete("/post/api/v1/posts/${post.id}").andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("${post.id}번 글이 삭제되었습니다.") }
            }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `성공 - 관리자가 다른 사람 글 삭제`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(actor, "삭제될 글", "내용", true, true)

            mvc.delete("/post/api/v1/posts/${post.id}").andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
            }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자 role 인증은 이메일 드리프트가 있어도 다른 사람 글 삭제를 허용한다`() {
            val writer = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(writer, "삭제될 글", "내용", true, true)
            val admin = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val driftedEmail = "admin-drift-${System.currentTimeMillis()}@test.com"

            jdbcTemplate.update("update member set email = ? where id = ?", driftedEmail, admin.id)
            entityManager.clear()

            mvc.delete("/post/api/v1/posts/${post.id}").andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
            }
        }

        @Test
        @WithUserDetails("user3@test.com")
        fun `실패 - 권한 없음`() {
            val actor = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(actor, "다른 사람 글", "내용", true, true)

            mvc.delete("/post/api/v1/posts/${post.id}").andExpect {
                status { isForbidden() }
                jsonPath("$.resultCode") { value("403-1") }
                jsonPath("$.msg") { value("권한이 없습니다.") }
            }
        }

        @Test
        @WithUserDetails("admin@test.com")
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

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자 role 인증은 이메일 드리프트가 있어도 비공개 글 조회수 반영을 허용한다`() {
            val writer = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(writer, "비공개 조회수 점검", "내용", false, false)
            val admin = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val driftedEmail = "admin-drift-${System.currentTimeMillis()}@test.com"
            val initialHitCount = post.hitCount

            jdbcTemplate.update("update member set email = ? where id = ?", driftedEmail, admin.id)
            entityManager.clear()

            mvc
                .post("/post/api/v1/posts/${post.id}/hit") {
                    header("X-Forwarded-For", "203.0.113.12")
                    header(HttpHeaders.USER_AGENT, "JUnit-hit-admin-drift")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                    jsonPath("$.data.hitCount") { value(initialHitCount + 1) }
                }
        }
    }

    @Nested
    inner class Like {
        @Test
        @WithUserDetails("user1@test.com")
        fun `성공 - 좋아요 추가`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()

            mvc.put("/post/api/v1/posts/${post.id}/like").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("like"))
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("좋아요를 반영했습니다.") }
                jsonPath("$.data.liked") { value(true) }
                jsonPath("$.data.likesCount") { isNumber() }
            }
        }

        @Test
        @WithUserDetails("user1@test.com")
        fun `성공 - 좋아요 취소`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()

            mvc.put("/post/api/v1/posts/${post.id}/like")

            mvc.delete("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.msg") { value("좋아요 취소를 반영했습니다.") }
                jsonPath("$.data.liked") { value(false) }
            }
        }

        @Test
        @WithUserDetails("user1@test.com")
        fun `좋아요 카운터 attr 누락 상태에서도 unlike가 409 없이 동작한다`() {
            val author = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
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

            mvc.delete("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.msg") { value("좋아요 취소를 반영했습니다.") }
                jsonPath("$.data.liked") { value(false) }
                jsonPath("$.data.likesCount") { value(0) }
            }
        }

        @Test
        fun `실패 - 인증 없이`() {
            val post = postFacade.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 1).content.first()

            mvc.put("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-1") }
            }
        }

        @Test
        @WithUserDetails("user1@test.com")
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
        @WithUserDetails("user1@test.com")
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

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자 role 인증은 이메일 드리프트가 있어도 비공개 글 좋아요 반영을 허용한다`() {
            val writer = actorApplicationService.findByEmail("user1@test.com").getOrThrow()
            val post = postFacade.write(writer, "비공개 좋아요 점검", "내용", false, false)
            val admin = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val driftedEmail = "admin-drift-${System.currentTimeMillis()}@test.com"

            jdbcTemplate.update("update member set email = ? where id = ?", driftedEmail, admin.id)
            entityManager.clear()

            mvc.put("/post/api/v1/posts/${post.id}/like").andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.liked") { value(true) }
            }
        }
    }

    @Nested
    inner class GetMine {
        @Test
        @WithUserDetails("admin@test.com")
        fun `성공 - 내 글 목록 조회`() {
            mvc.get("/post/api/v1/posts/mine?page=1&pageSize=10").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("getMine"))
                status { isOk() }
                jsonPath("$.content") { isArray() }
            }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `성공 - 키워드 검색`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val targetPost = postFacade.write(actor, "내 검색 키워드 글", "검색 검증 글")

            mvc
                .get("/post/api/v1/posts/mine") {
                    param("page", "1")
                    param("pageSize", "10")
                    param("kw", "검색")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content[?(@.id == ${targetPost.id})]") { value(Matchers.not(Matchers.empty<Any>())) }
                    jsonPath("$.content[?(@.authorId == ${actor.id})]") { value(Matchers.not(Matchers.empty<Any>())) }
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
        @WithUserDetails("admin@test.com")
        fun `성공 - 새 임시글`() {
            mvc.post("/post/api/v1/posts/temp").andExpect {
                match(handler().handlerType(ApiV1PostController::class.java))
                match(handler().methodName("getOrCreateTemp"))
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.data.published") { value(false) }
                jsonPath("$.data.listed") { value(false) }
                jsonPath("$.data.tempDraft") { value(true) }
            }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `성공 - 기존 임시글`() {
            mvc.post("/post/api/v1/posts/temp")

            mvc.post("/post/api/v1/posts/temp").andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("기존 임시저장 글을 불러옵니다.") }
                jsonPath("$.data.tempDraft") { value(true) }
            }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `성공 - 임시글 작성 완료 후에는 새 임시글을 다시 만든다`() {
            val firstTemp =
                mvc
                    .post("/post/api/v1/posts/temp")
                    .andReturn()
                    .response
                    .contentAsString
            val firstTempId = JsonPath.read<Int>(firstTemp, "$.data.id")
            val firstTempVersion = JsonPath.read<Int>(firstTemp, "$.data.version")

            mvc
                .put("/post/api/v1/posts/$firstTempId") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "비공개 초안",
                          "content": "완성된 새 글",
                          "published": false,
                          "listed": false,
                          "version": $firstTempVersion
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.listed") { value(false) }
                }

            mvc.post("/post/api/v1/posts/temp").andExpect {
                status { isCreated() }
                jsonPath("$.data.id") { value(org.hamcrest.Matchers.not(firstTempId)) }
                jsonPath("$.data.tempDraft") { value(true) }
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

    @Nested
    inner class AdmDeletedList {
        @Test
        @WithUserDetails("admin@test.com")
        fun `soft delete 글은 관리자 기본 목록에서 제외되고 deleted 목록에서 조회된다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val uniqueTitle = "삭제 목록 대상-${System.currentTimeMillis()}"
            val post = postFacade.write(actor, uniqueTitle, "삭제 목록 테스트 본문", true, true)
            postFacade.delete(post, actor)

            mvc
                .get("/post/api/v1/adm/posts") {
                    param("kw", uniqueTitle)
                    param("page", "1")
                    param("pageSize", "30")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(0) }
                }

            mvc
                .get("/post/api/v1/adm/posts/deleted") {
                    param("kw", uniqueTitle)
                    param("page", "1")
                    param("pageSize", "30")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(1) }
                    jsonPath("$.content[0].id") { value(post.id) }
                    jsonPath("$.content[0].title") { value(uniqueTitle) }
                    jsonPath("$.content[0].deletedAt") { Matchers.not(Matchers.blankString()) }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `deleted 목록은 페이지네이션과 검색어가 적용된다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val prefix = "삭제탭-페이지"

            repeat(3) { idx ->
                val post = postFacade.write(actor, "$prefix-$idx", "페이지네이션", true, true)
                postFacade.delete(post, actor)
            }

            mvc
                .get("/post/api/v1/adm/posts/deleted") {
                    param("kw", prefix)
                    param("page", "1")
                    param("pageSize", "2")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(2) }
                    jsonPath("$.pageable.totalElements") { value(3) }
                    jsonPath("$.content[*].title") { value(Matchers.everyItem(Matchers.containsString(prefix))) }
                }
        }

        @Test
        @WithUserDetails("user1@test.com")
        fun `일반 사용자는 deleted 목록을 조회할 수 없다`() {
            mvc.get("/post/api/v1/adm/posts/deleted").andExpect {
                status { isForbidden() }
                jsonPath("$.resultCode") { value("403-1") }
            }
        }

        @Test
        fun `비로그인 사용자는 deleted 목록을 조회할 수 없다`() {
            mvc.get("/post/api/v1/adm/posts/deleted").andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-1") }
            }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자는 deleted 글을 복구할 수 있다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val uniqueTitle = "복구 대상-${System.currentTimeMillis()}"
            val post = postFacade.write(actor, uniqueTitle, "복구 테스트 본문", true, true)
            postFacade.delete(post, actor)

            mvc
                .post("/post/api/v1/adm/posts/${post.id}/restore")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                    jsonPath("$.data.id") { value(post.id) }
                }

            mvc
                .get("/post/api/v1/adm/posts/${post.id}")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.id") { value(post.id) }
                    jsonPath("$.title") { value(uniqueTitle) }
                }

            mvc
                .get("/post/api/v1/adm/posts/deleted") {
                    param("kw", uniqueTitle)
                    param("page", "1")
                    param("pageSize", "30")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(0) }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자는 deleted 글을 영구삭제할 수 있다`() {
            val actor = actorApplicationService.findByEmail("admin@test.com").getOrThrow()
            val uniqueTitle = "영구삭제 대상-${System.currentTimeMillis()}"
            val post = postFacade.write(actor, uniqueTitle, "영구삭제 테스트 본문", true, true)
            postFacade.delete(post, actor)

            mvc
                .delete("/post/api/v1/adm/posts/${post.id}/hard")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.resultCode") { value("200-1") }
                }

            mvc
                .get("/post/api/v1/adm/posts/deleted") {
                    param("kw", uniqueTitle)
                    param("page", "1")
                    param("pageSize", "30")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(0) }
                }

            // 테스트 메서드 트랜잭션의 1차 캐시를 비워 native hard delete 결과를 반영한다.
            entityManager.clear()

            mvc
                .get("/post/api/v1/posts/${post.id}")
                .andExpect {
                    status { isNotFound() }
                    jsonPath("$.resultCode") { value("404-1") }
                }
        }
    }
}
