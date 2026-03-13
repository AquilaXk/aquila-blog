package com.back.boundedContexts.post.adapter.`in`.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.`in`.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.global.app.AppConfig
import com.back.global.security.config.CustomAuthenticationFilter
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.FilterType
import org.springframework.context.annotation.Import
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
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
import java.time.Instant

@ActiveProfiles("test")
@WebMvcTest(
    ApiV1AdmPostController::class,
    excludeFilters = [
        ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE,
            classes = [CustomAuthenticationFilter::class],
        ),
    ],
)
@Import(ApiV1AdmPostControllerTest.TestSecurityConfig::class)
class ApiV1AdmPostControllerTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @MockitoBean
    private lateinit var postUseCase: PostUseCase

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

    @Test
    @WithMockUser(roles = ["ADMIN"])
    fun `관리자는 글 통계를 조회할 수 있다`() {
        given(postUseCase.count()).willReturn(12)
        given(postUseCase.randomSecureTip()).willReturn("강력한 비밀번호는 길고 고유해야 합니다.")

        mvc.get("/post/api/v1/adm/posts/count").andExpect {
            status { isOk() }
            jsonPath("$.all") { value(12) }
            jsonPath("$.secureTip") { value("강력한 비밀번호는 길고 고유해야 합니다.") }
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
        given(postUseCase.findPagedByKwForAdmin("관리자 검색용 숨김", com.back.standard.dto.post.type1.PostSearchSortType1.CREATED_AT, 1, 30))
            .willReturn(PageImpl(listOf(privatePost), PageRequest.of(0, 30), 1))

        mvc
            .get("/post/api/v1/adm/posts") {
                param("kw", "관리자 검색용 숨김")
            }.andExpect {
                status { isOk() }
                jsonPath("$.content.length()") { value(1) }
                jsonPath("$.content[0].id") { value(101) }
                jsonPath("$.content[0].published") { value(false) }
                jsonPath("$.content[0].listed") { value(false) }
                jsonPath("$.pageable.pageNumber") { value(1) }
                jsonPath("$.pageable.pageSize") { value(30) }
            }
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

    private fun samplePost(
        id: Int,
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
                    authorize("/post/api/v1/adm/**", hasRole("ADMIN"))
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
