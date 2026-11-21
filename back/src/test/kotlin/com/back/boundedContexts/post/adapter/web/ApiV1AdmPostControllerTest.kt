package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmPostFacetCounts
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostRevisionSnapshotDto
import com.back.boundedContexts.post.dto.PostRevisionSummaryDto
import com.back.global.security.domain.SecurityUser
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import com.back.support.BaseAdmPostControllerWebMvcTest
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.never
import org.mockito.BDDMockito.then
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant

@org.junit.jupiter.api.DisplayName("ApiV1AdmPostController 테스트")
class ApiV1AdmPostControllerTest : BaseAdmPostControllerWebMvcTest() {
    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 글 통계를 조회할 수 있다`() {
        given(postUseCase.getAdminPostFacetCounts())
            .willReturn(
                AdmPostFacetCounts(
                    all = 12,
                    published = 8,
                    draft = 2,
                    privateCount = 2,
                    unlisted = 1,
                    deleted = 3,
                    totalHitCount = 150,
                    totalLikesCount = 40,
                ),
            )
        given(postUseCase.randomSecureTip()).willReturn("강력한 비밀번호는 길고 고유해야 합니다.")

        mvc.get("/post/api/v1/adm/posts/count").andExpect {
            status { isOk() }
            jsonPath("$.all") { value(12) }
            jsonPath("$.published") { value(8) }
            jsonPath("$.draft") { value(2) }
            jsonPath("$.privateCount") { value(2) }
            jsonPath("$.unlisted") { value(1) }
            jsonPath("$.deleted") { value(3) }
            jsonPath("$.secureTip") { value("강력한 비밀번호는 길고 고유해야 합니다.") }
        }
    }

    @Test
    fun `관리자는 관리자 글 작업공간 bootstrap을 조회할 수 있다`() {
        val securityUser =
            SecurityUser(
                id = 7L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            )
        val post = samplePost(id = 55, title = "첫 화면 캐시", content = "본문", published = true, listed = true)
        given(adminPostListSnapshotService.getFirstPageSnapshot(com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT))
            .willReturn(
                PageDto(
                    content =
                        listOf(
                            PostDto(post).apply {
                                tempDraft = false
                            },
                        ),
                ),
            )

        mvc
            .get("/post/api/v1/adm/posts/bootstrap") {
                with(user(securityUser))
            }.andExpect {
                status { isOk() }
                jsonPath("$.member.id") { value(7) }
                jsonPath("$.member.isAdmin") { value(true) }
                jsonPath("$.member.nickname") { value("관리자") }
                jsonPath("$.firstPage.content[0].id") { value(55) }
                jsonPath("$.firstPage.content[0].title") { value("첫 화면 캐시") }
            }
    }

    @Test
    @WithMockUser(roles = ["USER"])
    fun `일반 사용자는 관리자 글 통계를 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts/count").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
            jsonPath("$.msg") { value("권한이 없습니다.") }
        }
    }

    @Test
    fun `비로그인 사용자는 관리자 글 통계를 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts/count").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
            jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 숨김글을 포함한 전체 글 목록을 조회할 수 있다`() {
        val privatePost = samplePost(id = 101, title = "관리자 검색용 숨김 글", content = "숨김 내용", published = false, listed = false)
        given(
            postUseCase.findPagedByKwForAdmin(
                "관리자 검색용 숨김",
                com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT,
                1,
                20,
                "all",
            ),
        ).willReturn(PagedResult(content = listOf(privatePost), page = 1, pageSize = 20, totalElements = 1))

        mvc
            .get("/post/api/v1/adm/posts") {
                param("kw", "관리자 검색용 숨김")
            }.andExpect {
                status { isOk() }
                jsonPath("$.content.length()") { value(1) }
                jsonPath("$.content[0].id") { value(101) }
                jsonPath("$.content[0].authorProfileImgUrl") { value(startsWith("https://cdn.example.com/profiles/user1.png")) }
                jsonPath("$.content[0].published") { value(false) }
                jsonPath("$.content[0].listed") { value(false) }
                jsonPath("$.pageable.pageNumber") { value(1) }
                jsonPath("$.pageable.pageSize") { value(20) }
            }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자 첫 화면 기본 목록은 snapshot cache 서비스로 응답한다`() {
        val post =
            samplePost(
                id = 55,
                title = "첫 화면 캐시",
                content =
                    """
                    category: 운영

                    본문
                    """.trimIndent(),
                published = true,
                listed = true,
            )
        given(adminPostListSnapshotService.getFirstPageSnapshot(com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT))
            .willReturn(
                PageDto(
                    content =
                        listOf(
                            PostDto(post).apply {
                                tempDraft = false
                            },
                        ),
                ),
            )

        mvc
            .get("/post/api/v1/adm/posts") {
                param("page", "1")
                param("pageSize", "20")
                param("kw", "")
                param("sort", "MODIFIED_AT")
            }.andExpect {
                status { isOk() }
                jsonPath("$.content[0].id") { value(55) }
                jsonPath("$.content[0].title") { value("첫 화면 캐시") }
                jsonPath("$.content[0].category[0]") { value("운영") }
            }

        then(adminPostListSnapshotService)
            .should()
            .getFirstPageSnapshot(com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT)
        then(postUseCase)
            .should(never())
            .findPagedByKwForAdmin("", com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT, 1, 20, "all")
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자 첫 화면 기본 목록은 쿼리 파라미터 없이 호출 시에도 snapshot cache 서비스로 응답한다`() {
        val post =
            samplePost(
                id = 55,
                title = "첫 화면 캐시",
                content =
                    """
                    category: 운영

                    본문
                    """.trimIndent(),
                published = true,
                listed = true,
            )
        given(adminPostListSnapshotService.getFirstPageSnapshot(com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT))
            .willReturn(
                PageDto(
                    content =
                        listOf(
                            PostDto(post).apply {
                                tempDraft = false
                            },
                        ),
                ),
            )

        mvc
            .get("/post/api/v1/adm/posts")
            .andExpect {
                status { isOk() }
                jsonPath("$.content[0].id") { value(55) }
                jsonPath("$.content[0].title") { value("첫 화면 캐시") }
                jsonPath("$.content[0].category[0]") { value("운영") }
            }

        then(adminPostListSnapshotService)
            .should()
            .getFirstPageSnapshot(com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT)
        then(postUseCase)
            .should(never())
            .findPagedByKwForAdmin("", com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT, 1, 20, "all")
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자 글 목록은 상태 필터를 usecase로 전달한다`() {
        val draftPost = samplePost(id = 103, title = "임시글", content = "임시글 입니다.", published = false, listed = false)
        given(
            postUseCase.findPagedByKwForAdmin(
                "",
                com.back.standard.dto.post.type1.PostSearchSortType1.CREATED_AT,
                1,
                20,
                "draft",
            ),
        ).willReturn(PagedResult(content = listOf(draftPost), page = 1, pageSize = 20, totalElements = 1))

        mvc
            .get("/post/api/v1/adm/posts") {
                param("page", "1")
                param("pageSize", "20")
                param("kw", "")
                param("sort", "CREATED_AT")
                param("status", "draft")
            }.andExpect {
                status { isOk() }
                jsonPath("$.content[0].id") { value(103) }
                jsonPath("$.pageable.totalElements") { value(1) }
            }

        then(adminPostListSnapshotService)
            .should(never())
            .getFirstPageSnapshot(com.back.standard.dto.post.type1.PostSearchSortType1.CREATED_AT)
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자 글 목록은 unlisted 상태 필터를 usecase로 전달한다`() {
        val unlistedPost = samplePost(id = 104, title = "링크공개글", content = "링크로만 접근 가능", published = true, listed = false)
        given(
            postUseCase.findPagedByKwForAdmin(
                "",
                com.back.standard.dto.post.type1.PostSearchSortType1.CREATED_AT,
                1,
                20,
                "unlisted",
            ),
        ).willReturn(PagedResult(content = listOf(unlistedPost), page = 1, pageSize = 20, totalElements = 1))

        mvc
            .get("/post/api/v1/adm/posts") {
                param("page", "1")
                param("pageSize", "20")
                param("kw", "")
                param("sort", "CREATED_AT")
                param("status", "unlisted")
            }.andExpect {
                status { isOk() }
                jsonPath("$.content[0].id") { value(104) }
                jsonPath("$.content[0].published") { value(true) }
                jsonPath("$.content[0].listed") { value(false) }
                jsonPath("$.pageable.totalElements") { value(1) }
            }

        then(postUseCase)
            .should()
            .findPagedByKwForAdmin(
                "",
                com.back.standard.dto.post.type1.PostSearchSortType1.CREATED_AT,
                1,
                20,
                "unlisted",
            )
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자 글 목록 조회는 페이지 내 임시글 여부를 resolveTempDraftPostIds로 일괄 판별한다`() {
        val trackedPost = samplePost(id = 201, title = "추적 임시글", content = "본문1", published = false, listed = false)
        val regularPost = samplePost(id = 202, title = "일반 글", content = "본문2", published = true, listed = true)
        val page = PagedResult(content = listOf(trackedPost, regularPost), page = 1, pageSize = 20, totalElements = 2)
        given(
            postUseCase.findPagedByKwForAdmin(
                "추적",
                com.back.standard.dto.post.type1.PostSearchSortType1.MODIFIED_AT,
                1,
                20,
                "all",
            ),
        ).willReturn(page)
        given(postUseCase.resolveTempDraftPostIds(page.content)).willReturn(setOf(201L))

        mvc
            .get("/post/api/v1/adm/posts") {
                param("kw", "추적")
            }.andExpect {
                status { isOk() }
                jsonPath("$.content[0].tempDraft") { value(true) }
                jsonPath("$.content[1].tempDraft") { value(false) }
            }

        then(postUseCase).should().resolveTempDraftPostIds(page.content)
        then(postUseCase).should(never()).isTempDraft(trackedPost)
        then(postUseCase).should(never()).isTempDraft(regularPost)
    }

    @Test
    @WithMockUser(roles = ["USER"])
    fun `일반 사용자는 관리자 글 목록을 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
            jsonPath("$.msg") { value("권한이 없습니다.") }
        }
    }

    @Test
    fun `비로그인 사용자는 관리자 글 목록을 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
            jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 soft delete 글 목록을 조회할 수 있다`() {
        val deletedPost =
            AdmDeletedPostDto(
                id = 808,
                title = "삭제된 글",
                authorId = 7,
                authorName = "user1",
                authorProfileImgUrl = "https://cdn.example.com/profiles/user1.png?v=1710374400000",
                published = true,
                listed = true,
                createdAt = Instant.parse("2026-03-12T00:00:00Z"),
                modifiedAt = Instant.parse("2026-03-13T00:00:00Z"),
                deletedAt = Instant.parse("2026-03-14T00:00:00Z"),
            )
        given(postUseCase.findDeletedPagedByKwForAdmin("삭제된", 1, 30))
            .willReturn(PagedResult(content = listOf(deletedPost), page = 1, pageSize = 30, totalElements = 1))

        mvc
            .get("/post/api/v1/adm/posts/deleted") {
                param("kw", "삭제된")
            }.andExpect {
                status { isOk() }
                jsonPath("$.content.length()") { value(1) }
                jsonPath("$.content[0].id") { value(808) }
                jsonPath("$.content[0].title") { value("삭제된 글") }
                jsonPath("$.content[0].authorProfileImgUrl") { value("https://cdn.example.com/profiles/user1.png?v=1710374400000") }
                jsonPath("$.content[0].deletedAt") { value("2026-03-14T00:00:00Z") }
            }
    }

    @Test
    @WithMockUser(roles = ["USER"])
    fun `일반 사용자는 soft delete 글 목록을 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts/deleted").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
            jsonPath("$.msg") { value("권한이 없습니다.") }
        }
    }

    @Test
    fun `비로그인 사용자는 soft delete 글 목록을 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts/deleted").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
            jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 soft delete 글을 복구할 수 있다`() {
        val restoredPost = samplePost(id = 808, title = "복구된 글", content = "복구 내용", published = true, listed = true)
        given(postUseCase.restoreDeletedByIdForAdmin(808)).willReturn(restoredPost)

        mvc.post("/post/api/v1/adm/posts/808/restore").andExpect {
            status { isOk() }
            jsonPath("$.resultCode") { value("200-1") }
            jsonPath("$.msg") { value("808번 삭제 글을 복구했습니다.") }
            jsonPath("$.data.id") { value(808) }
            jsonPath("$.data.title") { value("복구된 글") }
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 soft delete 글을 영구삭제할 수 있다`() {
        mvc.delete("/post/api/v1/adm/posts/808/hard").andExpect {
            status { isOk() }
            jsonPath("$.resultCode") { value("200-1") }
            jsonPath("$.msg") { value("808번 삭제 글을 영구삭제했습니다.") }
        }

        then(postUseCase).should().hardDeleteDeletedByIdForAdmin(808)
    }

    @Test
    @WithMockUser(roles = ["USER"])
    fun `일반 사용자는 soft delete 글 복구를 수행할 수 없다`() {
        mvc.post("/post/api/v1/adm/posts/808/restore").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
        }
    }

    @Test
    @WithMockUser(roles = ["USER"])
    fun `일반 사용자는 soft delete 글 영구삭제를 수행할 수 없다`() {
        mvc.delete("/post/api/v1/adm/posts/808/hard").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
        }
    }

    @Test
    fun `비로그인 사용자는 soft delete 글 복구를 수행할 수 없다`() {
        mvc.post("/post/api/v1/adm/posts/808/restore").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
        }
    }

    @Test
    fun `비로그인 사용자는 soft delete 글 영구삭제를 수행할 수 없다`() {
        mvc.delete("/post/api/v1/adm/posts/808/hard").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> anyNonNull(): T {
        org.mockito.ArgumentMatchers.any<T>()
        return null as T
    }

    private fun <T> eqNonNull(value: T): T {
        org.mockito.ArgumentMatchers.eq(value)
        return value
    }

    private fun samplePost(
        id: Long,
        title: String,
        content: String,
        published: Boolean,
        listed: Boolean,
    ): Post {
        val author =
            Member(
                id = 7,
                username = "user1",
                password = null,
                nickname = "user1",
                email = "user1@test.com",
            )
        author.setProfileWorkspaceDraftContent(
            MemberProfileWorkspaceContent(profileImageUrl = "https://cdn.example.com/profiles/user1.png"),
        )
        author.setProfileWorkspacePublishedContent(
            MemberProfileWorkspaceContent(profileImageUrl = "https://cdn.example.com/profiles/user1.png"),
        )
        author.getProfileWorkspaceDraftAttr().apply {
            createdAt = Instant.parse("2026-03-13T00:00:00Z")
            modifiedAt = Instant.parse("2026-03-13T00:00:00Z")
        }
        author.getProfileWorkspacePublishedAttr().apply {
            createdAt = Instant.parse("2026-03-13T00:00:00Z")
            modifiedAt = Instant.parse("2026-03-13T00:00:00Z")
        }
        val post =
            Post(
                id = id,
                author = author,
                title = title,
                content = content,
                published = published,
                listed = listed,
            )
        post.createdAt = Instant.parse("2026-03-13T00:00:00Z")
        post.modifiedAt = Instant.parse("2026-03-13T00:01:00Z")
        return post
    }

    @Test
    fun `관리자는 글 일괄 처리를 수행할 수 있다`() {
        val securityUser =
            SecurityUser(
                id = 1L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            )
        val resBody =
            com.back.boundedContexts.post.dto.AdmPostBulkActionResBody(
                processedCount = 2,
                ids = listOf(1L, 2L),
            )
        given(
            postUseCase.bulkActionForAdmin(
                anyNonNull(),
                eqNonNull(listOf(1L, 2L)),
                eqNonNull(com.back.boundedContexts.post.dto.AdmPostBulkActionType.PUBLISH_LISTED),
            ),
        ).willReturn(resBody)

        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [1, 2],
                        "action": "PUBLISH_LISTED"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.processedCount") { value(2) }
                jsonPath("$.data.ids[0]") { value(1) }
                jsonPath("$.data.ids[1]") { value(2) }
            }
    }

    @Test
    fun `관리자 글 일괄 처리 시 빈 목록은 400 거부된다`() {
        val securityUser =
            SecurityUser(
                id = 1L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            )

        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [],
                        "action": "DELETE"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `관리자 글 일괄 처리 시 50개 초과 목록은 400 거부된다`() {
        val securityUser =
            SecurityUser(
                id = 1L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            )
        val oversizedIds = (1..51).joinToString(",")

        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [$oversizedIds],
                        "action": "DELETE"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `관리자 글 일괄 처리 시 0 이하 ID 포함은 400 거부된다`() {
        val securityUser =
            SecurityUser(
                id = 1L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            )

        mvc
            .post("/post/api/v1/adm/posts/bulk") {
                with(user(securityUser))
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "ids": [0, 1],
                        "action": "DELETE"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `AdmPostBulkActionRequest 및 AdmPostBulkActionType DTO 커버리지 검증`() {
        val reqValid =
            com.back.boundedContexts.post.dto.AdmPostBulkActionRequest(
                ids = listOf(1L, 2L),
                action = com.back.boundedContexts.post.dto.AdmPostBulkActionType.PUBLISH_LISTED,
            )
        org.assertj.core.api.Assertions
            .assertThat(reqValid.hasValidPositiveIds)
            .isTrue()
        org.assertj.core.api.Assertions
            .assertThat(reqValid.ids)
            .containsExactly(1L, 2L)
        org.assertj.core.api.Assertions
            .assertThat(reqValid.action)
            .isEqualTo(com.back.boundedContexts.post.dto.AdmPostBulkActionType.PUBLISH_LISTED)

        val reqInvalid =
            com.back.boundedContexts.post.dto.AdmPostBulkActionRequest(
                ids = listOf(-1L),
                action = com.back.boundedContexts.post.dto.AdmPostBulkActionType.DELETE,
            )
        org.assertj.core.api.Assertions
            .assertThat(reqInvalid.hasValidPositiveIds)
            .isFalse()

        val resBody =
            com.back.boundedContexts.post.dto
                .AdmPostBulkActionResBody(1, listOf(10L))
        org.assertj.core.api.Assertions
            .assertThat(resBody.processedCount)
            .isEqualTo(1)
        org.assertj.core.api.Assertions
            .assertThat(resBody.ids)
            .containsExactly(10L)

        // Enum values and valueOf coverage
        for (action in com.back.boundedContexts.post.dto.AdmPostBulkActionType
            .values()) {
            org.assertj.core.api.Assertions
                .assertThat(
                    com.back.boundedContexts.post.dto.AdmPostBulkActionType
                        .valueOf(action.name),
                ).isEqualTo(action)
        }
    }

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 글 리비전 히스토리 목록을 최신순으로 조회할 수 있다`() {
        val createdAt = Instant.parse("2026-11-18T01:02:03Z")
        val summary =
            PostRevisionSummaryDto(
                id = 51L,
                postId = 42L,
                title = "리비전 제목",
                summaryText = "리비전 요약",
                contentLength = 12,
                createdAt = createdAt,
            )
        val snapshot =
            PostRevisionSnapshotDto(
                id = 51L,
                postId = 42L,
                authorId = 7L,
                title = "리비전 제목",
                content = "리비전 본문 내용",
                summaryText = "리비전 요약",
                createdAt = createdAt,
            )
        assertThat(summary.id).isEqualTo(51L)
        assertThat(summary.postId).isEqualTo(42L)
        assertThat(summary.title).isEqualTo("리비전 제목")
        assertThat(summary.summaryText).isEqualTo("리비전 요약")
        assertThat(summary.contentLength).isEqualTo(12)
        assertThat(summary.createdAt).isEqualTo(createdAt)
        assertThat(snapshot.id).isEqualTo(51L)
        assertThat(snapshot.postId).isEqualTo(42L)
        assertThat(snapshot.authorId).isEqualTo(7L)
        assertThat(snapshot.title).isEqualTo("리비전 제목")
        assertThat(snapshot.content).isEqualTo("리비전 본문 내용")
        assertThat(snapshot.summaryText).isEqualTo("리비전 요약")
        assertThat(snapshot.createdAt).isEqualTo(createdAt)

        given(postUseCase.getPostRevisionsForAdmin(42L)).willReturn(listOf(summary))
        given(postUseCase.getPostRevisionSnapshotForAdmin(42L, 51L)).willReturn(snapshot)

        mvc.get("/post/api/v1/adm/posts/42/revisions").andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(51) }
            jsonPath("$[0].postId") { value(42) }
            jsonPath("$[0].title") { value("리비전 제목") }
            jsonPath("$[0].summaryText") { value("리비전 요약") }
            jsonPath("$[0].contentLength") { value(12) }
        }

        mvc.get("/post/api/v1/adm/posts/42/revisions/51").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(51) }
            jsonPath("$.postId") { value(42) }
            jsonPath("$.authorId") { value(7) }
            jsonPath("$.title") { value("리비전 제목") }
            jsonPath("$.content") { value("리비전 본문 내용") }
            jsonPath("$.summaryText") { value("리비전 요약") }
        }
    }

    @Test
    fun `관리자는 특정 리비전으로 글을 복원할 수 있다`() {
        val securityUser =
            SecurityUser(
                id = 7L,
                username = "admin@example.com",
                password = "",
                nickname = "관리자",
                authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
            )
        val restored = samplePost(id = 42, title = "복원된 제목", content = "복원된 본문", published = true, listed = true)
        given(postUseCase.restorePostRevisionForAdmin(anyNonNull(), eqNonNull(42L), eqNonNull(51L)))
            .willReturn(restored)
        given(postUseCase.isTempDraft(restored)).willReturn(false)

        mvc
            .post("/post/api/v1/adm/posts/42/revisions/51/restore") {
                with(user(securityUser))
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("42번 글을 51번 리비전으로 복원했습니다.") }
                jsonPath("$.data.id") { value(42) }
                jsonPath("$.data.title") { value("복원된 제목") }
                jsonPath("$.data.content") { value("복원된 본문") }
                jsonPath("$.data.tempDraft") { value(false) }
            }
    }

    @Test
    @WithMockUser(roles = ["USER"])
    fun `일반 사용자는 글 리비전 목록 조회와 복원을 수행할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts/42/revisions").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
        }
        mvc.get("/post/api/v1/adm/posts/42/revisions/51").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
        }
        mvc.post("/post/api/v1/adm/posts/42/revisions/51/restore").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
        }
    }

    @Test
    fun `비로그인 사용자는 글 리비전 목록 조회와 복원을 수행할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts/42/revisions").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
        }
        mvc.get("/post/api/v1/adm/posts/42/revisions/51").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
        }
        mvc.post("/post/api/v1/adm/posts/42/revisions/51/restore").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
        }
    }
}
