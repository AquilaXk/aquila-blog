package com.back.global.security.config

import com.back.boundedContexts.member.subContexts.memberActionLog.adapter.event.MemberActionLogEventListener
import com.back.boundedContexts.post.adapter.event.PostReadModelTaskEventListener
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.service.PostRecommendFeatureStoreService
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.task.application.TaskHandlerRegistry
import com.back.support.BaseControllerIntegrationTest
import jakarta.persistence.EntityManagerFactory
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.context.ApplicationContext
import org.springframework.http.HttpMethod
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.transaction.event.TransactionalEventListener
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
import org.springframework.web.util.ServletRequestPathUtils

@DisplayName("Admin-only runtime retirement contract")
class AdminOnlyRuntimeRetirementContractTest : BaseControllerIntegrationTest() {
    @jakarta.annotation.Resource
    private lateinit var applicationContext: ApplicationContext

    @jakarta.annotation.Resource
    private lateinit var taskHandlerRegistry: TaskHandlerRegistry

    @jakarta.annotation.Resource
    private lateinit var requestMappingHandlerMapping: RequestMappingHandlerMapping

    @jakarta.annotation.Resource
    private lateinit var entityManagerFactory: EntityManagerFactory

    @Test
    fun `removes drained handlers while retaining active task boundaries`() {
        val registeredTaskTypes = taskHandlerRegistry.getRegisteredEntries().map { it.taskType }

        assertThat(registeredTaskTypes)
            .doesNotContain(
                "member.signupVerification.sendMail",
                "post.interaction.side-effect",
            ).contains(
                "member.createActionLog",
                "post.hit.side-effect",
            )
    }

    @Test
    fun `removes retired public persistence while retaining administrator operations`() {
        listOf(
            HttpMethod.GET to "/system/api/v1/adm/mail/signup",
            HttpMethod.POST to "/system/api/v1/adm/mail/signup/test",
            HttpMethod.GET to "/system/api/v1/adm/notifications/stream",
        ).forEach { (method, path) ->
            assertThat(hasHandlerMethod(method, path))
                .describedAs("%s %s must not remain mapped", method, path)
                .isFalse()
        }

        assertThat(applicationContext.containsBean("signupVerificationMailTaskHandler")).isFalse()
        assertThat(applicationContext.containsBean("postInteractionSideEffectHandler")).isFalse()
        assertThat(applicationContext.containsBean("memberNotificationSseService")).isFalse()
        assertThat(applicationContext.beanDefinitionNames)
            .doesNotContain(
                "memberSignupVerificationRepository",
                "memberSignupVerificationRepositoryAdapter",
                "signupStartRateLimitService",
                "pendingOAuthSignupRepository",
                "pendingOAuthSignupRepositoryAdapter",
                "oauthSignupApplicationService",
                "oauthSignupHashService",
                "memberNotificationRepository",
                "memberNotificationRepositoryAdapter",
                "memberPrivacyRequestRepository",
                "memberLegalAcceptanceRepository",
                "legalAcceptanceApplicationService",
            ).contains(
                "adminEmailAuthenticationService",
                "memberSessionService",
                "memberSessionRepositoryAdapter",
                "authSecurityEventService",
                "authSecurityEventPersistenceAdapter",
                "memberActionLogApplicationService",
                "privacyRetentionCleanupScheduledJob",
                "postHitSideEffectHandler",
            )

        assertThat(entityManagerFactory.metamodel.entities.map { it.javaType.name })
            .doesNotContain(
                "com.back.boundedContexts.member.subContexts.signupVerification.model.MemberSignupVerification",
                "com.back.boundedContexts.member.subContexts.oauthSignup.model.PendingOAuthSignup",
                "com.back.boundedContexts.member.subContexts.notification.model.MemberNotification",
                "com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest",
                "com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance",
                "com.back.boundedContexts.post.model.PostComment",
            ).contains(
                "com.back.boundedContexts.member.subContexts.session.model.MemberSession",
                "com.back.boundedContexts.member.subContexts.memberActionLog.model.MemberActionLog",
                "com.back.global.security.model.AuthSecurityEvent",
                "com.back.boundedContexts.post.model.Post",
            )
    }

    @Test
    fun `removes comment and viewer-like public response signals`() {
        listOf(PostDto::class.java, PostWithContentDto::class.java, FeedPostDto::class.java).forEach { dtoType ->
            assertThat(dtoType.declaredFields.map { it.name })
                .describedAs("%s public fields", dtoType.simpleName)
                .doesNotContain("commentsCount", "actorHasLiked")
        }

        assertThat(PostUseCase::class.java.methods.map { it.name })
            .doesNotContain("isLiked", "findLikedPostIds")
        assertThat(PostRecommendFeatureStoreService.RecommendFeatureVector::class.java.declaredFields.map { it.name })
            .contains("likesCount")
            .doesNotContain("commentsCount")
    }

    @Test
    fun `registers action log listeners only for retained post events`() {
        val listenerMethods =
            MemberActionLogEventListener::class.java.declaredMethods
                .filter { it.isAnnotationPresent(TransactionalEventListener::class.java) }

        assertThat(listenerMethods.map { it.parameterTypes.single() })
            .containsExactlyInAnyOrder(
                PostWrittenEvent::class.java,
                PostModifiedEvent::class.java,
                PostDeletedEvent::class.java,
            )
        assertThat(
            MemberActionLogEventListener::class.java.declaredMethods
                .single { it.name == "addTask" }
                .isAnnotationPresent(TransactionalEventListener::class.java),
        ).isFalse()
    }

    @Test
    fun `removes drained account deletion event consumption while retaining active boundaries`() {
        assertThat(PostUseCase::class.java.methods.map { it.name })
            .doesNotContain("deleteContentByAuthorForAccountDeletion")

        val listenerParameterTypes =
            PostReadModelTaskEventListener::class.java.declaredMethods
                .filter { it.isAnnotationPresent(TransactionalEventListener::class.java) }
                .map { it.parameterTypes.single() }

        assertThat(listenerParameterTypes)
            .containsExactlyInAnyOrder(
                PostWrittenEvent::class.java,
                PostModifiedEvent::class.java,
                PostDeletedEvent::class.java,
            )

        assertThat(applicationContext.containsBean("memberAccountDeletionRepository")).isFalse()
        assertThat(applicationContext.containsBean("memberAccountDeletionRepositoryAdapter")).isFalse()
        assertThat(applicationContext.containsBean("privacyRetentionCleanupScheduledJob")).isTrue()
        assertThat(applicationContext.containsBean("postWriteSideEffectHandler")).isTrue()

        assertThat(taskHandlerRegistry.getRegisteredEntries().map { it.taskType })
            .contains(
                "post.write.side-effect",
                "post.search-index.sync",
                "post.search-engine.mirror",
                "post.read.prewarm",
            )
    }

    private fun hasHandlerMethod(
        method: HttpMethod,
        path: String,
    ): Boolean {
        val request = MockHttpServletRequest(method.name(), path)
        ServletRequestPathUtils.parseAndCache(request)
        return requestMappingHandlerMapping.handlerMethods.keys.any { mapping ->
            mapping.getMatchingCondition(request) != null
        }
    }
}
