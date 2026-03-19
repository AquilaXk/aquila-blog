package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.global.app.AppConfig
import com.back.global.security.config.CustomAuthenticationFilter
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.standard.dto.member.type1.MemberSearchSortType1
import com.back.standard.dto.page.PagedResult
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.FilterType
import org.springframework.context.annotation.Import
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import java.time.Instant
import java.util.Optional

@ActiveProfiles("test")
@WebMvcTest(
    ApiV1AdmMemberController::class,
    excludeFilters = [
        ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE,
            classes = [CustomAuthenticationFilter::class],
        ),
    ],
)
@Import(ApiV1AdmMemberControllerWebMvcTest.TestSecurityConfig::class)
@org.junit.jupiter.api.DisplayName("ApiV1AdmMemberControllerWebMvc 테스트")
class ApiV1AdmMemberControllerWebMvcTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @MockitoBean
    private lateinit var memberUseCase: MemberUseCase

    @MockitoBean
    private lateinit var postImageStoragePort: PostImageStoragePort

    @MockitoBean
    private lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @MockitoBean(name = "jpaMappingContext")
    private lateinit var jpaMappingContext: JpaMetamodelMappingContext

    companion object {
        @JvmStatic
        @BeforeAll
        fun setUpAppConfig() {
            AppConfig(
                siteBackUrl = "http://localhost:8080",
                siteFrontUrl = "http://localhost:3000",
                adminUsername = "admin",
                adminPassword = "test-password",
            )
        }
    }

    @Nested
    inner class GetItems {
        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 목록 조회는 기본 페이지 설정으로 1페이지 결과를 반환한다`() {
            val first = sampleMember(id = 1, username = "admin", nickname = "관리자", isAdmin = true)
            val second = sampleMember(id = 2, username = "user1", nickname = "사용자")
            given(memberUseCase.findPagedByKw("", MemberSearchSortType1.CREATED_AT, 1, 30))
                .willReturn(PagedResult(content = listOf(first, second), page = 1, pageSize = 30, totalElements = 2))

            val resultActions =
                mvc
                    .get("/member/api/v1/adm/members")
                    .andExpect {
                        status { isOk() }
                        match(handler().handlerType(ApiV1AdmMemberController::class.java))
                        match(handler().methodName("getItems"))
                        jsonPath("$.content.length()") { value(2) }
                        jsonPath("$.pageable.pageNumber") { value(1) }
                        jsonPath("$.pageable.pageSize") { value(30) }
                    }

            listOf(first, second).forEachIndexed { index, member ->
                resultActions.andExpect {
                    jsonPath("$.content[$index].id") { value(member.id) }
                    jsonPath("$.content[$index].createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                    jsonPath("$.content[$index].modifiedAt") { value(startsWith(member.modifiedAt.toString().take(20))) }
                    jsonPath("$.content[$index].isAdmin") { value(member.isAdmin) }
                    jsonPath("$.content[$index].username") { value(member.username) }
                    jsonPath("$.content[$index].name") { value(member.name) }
                    jsonPath("$.content[$index].nickname") { value(member.nickname) }
                    jsonPath("$.content[$index].profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
                }
            }
        }

        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 목록 조회는 username 과 nickname 을 통합해서 검색한다`() {
            val matchedOne = sampleMember(id = 10, username = "android-a", nickname = "안드로이드 가이드")
            val matchedTwo = sampleMember(id = 11, username = "android-guide", nickname = "일반 사용자")
            given(memberUseCase.findPagedByKw("android", MemberSearchSortType1.CREATED_AT, 1, 10))
                .willReturn(PagedResult(content = listOf(matchedOne, matchedTwo), page = 1, pageSize = 10, totalElements = 2))

            mvc
                .get("/member/api/v1/adm/members") {
                    param("page", "1")
                    param("pageSize", "10")
                    param("kw", "android")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(2) }
                    jsonPath("$.content[*].username") { value(containsInAnyOrder("android-a", "android-guide")) }
                }
        }

        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 목록 조회에 공백 검색어를 보내면 검색 없이 전체 1페이지 결과를 반환한다`() {
            val first = sampleMember(id = 1, username = "admin", nickname = "관리자", isAdmin = true)
            val second = sampleMember(id = 2, username = "user1", nickname = "사용자")
            given(memberUseCase.findPagedByKw("", MemberSearchSortType1.CREATED_AT, 1, 30))
                .willReturn(PagedResult(content = listOf(first, second), page = 1, pageSize = 30, totalElements = 2))

            mvc
                .get("/member/api/v1/adm/members") {
                    param("kw", "   ")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(2) }
                    jsonPath("$.pageable.pageNumber") { value(1) }
                    jsonPath("$.pageable.pageSize") { value(30) }
                }
        }

        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 목록 조회에서 page 가 1보다 작으면 400을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members") {
                    param("page", "0")
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                    jsonPath("$.msg") { value(org.hamcrest.Matchers.containsString("page-Min-")) }
                }
        }

        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 목록 조회에서 pageSize 가 30보다 크면 400을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members") {
                    param("pageSize", "31")
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                    jsonPath("$.msg") { value(org.hamcrest.Matchers.containsString("pageSize-Max-")) }
                }
        }

        @Test
        @WithMockUser(roles = ["USER"])
        fun `회원 목록 조회에서 일반 사용자는 403을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members")
                .andExpect {
                    status { isForbidden() }
                    jsonPath("$.resultCode") { value("403-1") }
                    jsonPath("$.msg") { value("권한이 없습니다.") }
                }
        }

        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 목록 조회는 프로필 role 과 bio 도 함께 hydrate 한다`() {
            val member = sampleMember(id = 21, username = "profile-list-user", nickname = "프로필 사용자")
            member.profileRole = "Backend Engineer"
            member.profileBio = "회원 목록 hydrate 검증용 bio"
            given(memberUseCase.findPagedByKw("profile-list-user", MemberSearchSortType1.CREATED_AT, 1, 10))
                .willReturn(PagedResult(content = listOf(member), page = 1, pageSize = 10, totalElements = 1))

            mvc
                .get("/member/api/v1/adm/members") {
                    param("kw", "profile-list-user")
                    param("page", "1")
                    param("pageSize", "10")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(1) }
                    jsonPath("$.content[0].username") { value("profile-list-user") }
                    jsonPath("$.content[0].profileRole") { value("Backend Engineer") }
                    jsonPath("$.content[0].profileBio") { value("회원 목록 hydrate 검증용 bio") }
                }
        }
    }

    @Nested
    inner class GetItem {
        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 단건 조회는 경로의 id 에 해당하는 회원 정보를 반환한다`() {
            val member = sampleMember(id = 2, username = "user1", nickname = "user1")
            given(memberUseCase.findById(member.id)).willReturn(Optional.of(member))

            mvc
                .get("/member/api/v1/adm/members/${member.id}")
                .andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1AdmMemberController::class.java))
                    match(handler().methodName("getItem"))
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                    jsonPath("$.modifiedAt") { value(startsWith(member.modifiedAt.toString().take(20))) }
                    jsonPath("$.isAdmin") { value(member.isAdmin) }
                    jsonPath("$.username") { value(member.username) }
                    jsonPath("$.name") { value(member.name) }
                    jsonPath("$.nickname") { value(member.nickname) }
                    jsonPath("$.profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
                }
        }

        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 단건 조회에서 존재하지 않는 id 를 요청하면 404를 반환한다`() {
            given(memberUseCase.findById(999999)).willReturn(Optional.empty())

            mvc
                .get("/member/api/v1/adm/members/999999")
                .andExpect {
                    status { isNotFound() }
                    jsonPath("$.resultCode") { value("404-1") }
                    jsonPath("$.msg") { value("해당 데이터가 존재하지 않습니다.") }
                }
        }

        @Test
        @WithMockUser(roles = ["ADMIN"])
        fun `회원 단건 조회에서 id 가 0 이하이면 400을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members/0")
                .andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                    jsonPath("$.msg") { value(org.hamcrest.Matchers.containsString("id-Positive-")) }
                }
        }

        @Test
        @WithMockUser(roles = ["USER"])
        fun `회원 단건 조회에서 일반 사용자는 403을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members/2")
                .andExpect {
                    status { isForbidden() }
                    jsonPath("$.resultCode") { value("403-1") }
                    jsonPath("$.msg") { value("권한이 없습니다.") }
                }
        }
    }

    private fun sampleMember(
        id: Int,
        username: String,
        nickname: String,
        isAdmin: Boolean = false,
    ): Member {
        val member =
            Member(
                id = id,
                username = username,
                password = null,
                nickname = nickname,
                email = "$username@test.com",
            )
        member.createdAt = Instant.parse("2026-03-13T00:00:00Z")
        member.modifiedAt = Instant.parse("2026-03-13T00:01:00Z")
        check(!isAdmin || username == "admin") { "admin 샘플은 username=admin 이어야 한다." }
        return member
    }

    @TestConfiguration
    class TestSecurityConfig {
        @Bean
        fun testSecurityFilterChain(http: HttpSecurity): SecurityFilterChain {
            http {
                csrf { disable() }
                formLogin { disable() }
                logout { disable() }
                httpBasic { disable() }
                sessionManagement {
                    sessionCreationPolicy = SessionCreationPolicy.STATELESS
                }
                authorizeHttpRequests {
                    authorize("/member/api/v1/adm/**", hasRole("ADMIN"))
                    authorize(anyRequest, permitAll)
                }
                exceptionHandling {
                    authenticationEntryPoint = jsonAuthenticationEntryPoint()
                    accessDeniedHandler = jsonAccessDeniedHandler()
                }
            }

            return http.build()
        }

        @Bean
        fun jsonAuthenticationEntryPoint(): AuthenticationEntryPoint =
            AuthenticationEntryPoint { _, response, _ ->
                response.status = 401
                response.contentType = "application/json;charset=UTF-8"
                response.writer.write("""{"resultCode":"401-1","msg":"로그인 후 이용해주세요."}""")
            }

        @Bean
        fun jsonAccessDeniedHandler(): AccessDeniedHandler =
            AccessDeniedHandler { _, response, _ ->
                response.status = 403
                response.contentType = "application/json;charset=UTF-8"
                response.writer.write("""{"resultCode":"403-1","msg":"권한이 없습니다."}""")
            }
    }
}
