package com.back.support

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationSseService
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupMailDiagnosticsService
import com.back.boundedContexts.post.application.service.PostKeywordSearchPipelineService
import com.back.boundedContexts.post.application.service.PostSearchEngineMirrorService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.config.CustomAuthenticationFilter
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.system.adapter.web.ApiV1AdmSystemController
import com.back.global.system.application.AdminDashboardSnapshotService
import com.back.global.system.application.AdminSystemHealthSnapshotService
import com.back.global.task.application.TaskDlqReplayService
import com.back.global.task.application.TaskQueueDiagnosticsService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.FilterType
import org.springframework.context.annotation.Import
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc

@WebMvcTest(
    ApiV1AdmSystemController::class,
    excludeFilters = [
        ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE,
            classes = [CustomAuthenticationFilter::class],
        ),
    ],
)
@Import(BaseAdmSystemControllerWebMvcTest.TestSecurityConfig::class)
abstract class BaseAdmSystemControllerWebMvcTest : BaseIntegrationTest() {
    @Autowired
    protected lateinit var mvc: MockMvc

    @MockitoBean
    protected lateinit var adminSystemHealthSnapshotService: AdminSystemHealthSnapshotService

    @MockitoBean
    protected lateinit var adminDashboardSnapshotService: AdminDashboardSnapshotService

    @MockitoBean
    protected lateinit var signupMailDiagnosticsService: SignupMailDiagnosticsService

    @MockitoBean
    protected lateinit var memberNotificationSseService: MemberNotificationSseService

    @MockitoBean
    protected lateinit var authSecurityEventService: AuthSecurityEventService

    @MockitoBean
    protected lateinit var taskQueueDiagnosticsService: TaskQueueDiagnosticsService

    @MockitoBean
    protected lateinit var taskDlqReplayService: TaskDlqReplayService

    @MockitoBean
    protected lateinit var uploadedFileRetentionService: UploadedFileRetentionService

    @MockitoBean
    protected lateinit var postKeywordSearchPipelineService: PostKeywordSearchPipelineService

    @MockitoBean
    protected lateinit var postSearchEngineMirrorService: PostSearchEngineMirrorService

    @MockitoBean(name = "jpaMappingContext")
    protected lateinit var jpaMappingContext: JpaMetamodelMappingContext

    @TestConfiguration
    class TestSecurityConfig {
        @Bean
        fun filterChain(http: HttpSecurity): SecurityFilterChain {
            http {
                authorizeHttpRequests {
                    authorize("/system/api/v1/adm/**", hasRole("ADMIN"))
                    authorize(anyRequest, permitAll)
                }

                csrf { disable() }
                formLogin { disable() }
                logout { disable() }
                httpBasic { disable() }

                sessionManagement {
                    sessionCreationPolicy = SessionCreationPolicy.STATELESS
                }

                exceptionHandling {
                    authenticationEntryPoint =
                        org.springframework.security.web.AuthenticationEntryPoint { _, response, _ ->
                            response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
                            response.status = 401
                            response.writer.write("""{"resultCode":"401-1","msg":"로그인 후 이용해주세요."}""")
                        }

                    accessDeniedHandler =
                        org.springframework.security.web.access.AccessDeniedHandler { _, response, _ ->
                            response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
                            response.status = 403
                            response.writer.write("""{"resultCode":"403-1","msg":"권한이 없습니다."}""")
                        }
                }
            }

            return http.build()
        }
    }
}
