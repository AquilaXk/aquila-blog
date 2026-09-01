package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.subContexts.privacy.adapter.persistence.MemberAccountDeletionRepository
import com.back.boundedContexts.member.subContexts.privacy.adapter.persistence.MemberPrivacyRequestAuditRepository
import com.back.boundedContexts.member.subContexts.privacy.adapter.persistence.MemberPrivacyRequestRepository
import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAuditAction
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Duration
import java.time.Instant
import java.util.UUID

class ApiV1AdmPrivacyRightsControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var requestRepository: MemberPrivacyRequestRepository

    @Autowired
    private lateinit var auditRepository: MemberPrivacyRequestAuditRepository

    @Autowired
    private lateinit var accountDeletionRepository: MemberAccountDeletionRepository

    @Autowired
    private lateinit var memberSessionUseCase: MemberSessionUseCase

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Test
    fun `operator privacy requests reject anonymous access`() {
        mvc
            .post(REQUESTS_PATH) {
                contentType = MediaType.APPLICATION_JSON
                content = createRequestBody(UUID.randomUUID(), "anonymous@example.com")
            }.andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    @WithUserDetails("user1@test.com")
    fun `operator privacy requests reject non-admin access`() {
        mvc
            .post(REQUESTS_PATH) {
                contentType = MediaType.APPLICATION_JSON
                content = createRequestBody(UUID.randomUUID(), "member@example.com")
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `request creation preserves optional message and scopes operation replay`() {
        val operationId = UUID.randomUUID()
        val body =
            """
            {
              "operationId": "$operationId",
              "type": "EXPORT",
              "requesterContact": "mailbox@example.com"
            }
            """.trimIndent()

        val createdBody =
            mvc
                .post(REQUESTS_PATH) {
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.message") { doesNotExist() }
                }.andReturn()
                .response.contentAsString
        val requestId = JsonPath.read<Number>(createdBody, "$.id").toLong()
        val audit = requireNotNull(auditRepository.findByOperationId(operationId))

        assertThat(requestRepository.findById(requestId).orElseThrow().message).isNull()
        assertThat(audit.operationId).isEqualTo(operationId)
        assertThat(audit.requestId).isEqualTo(requestId)
        assertThat(audit.action).isEqualTo(MemberPrivacyRequestAuditAction.REQUEST_CREATED)

        mvc
            .post(REQUESTS_PATH) {
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect {
                status { isCreated() }
                jsonPath("$.id") { value(requestId) }
            }
        assertThat(auditRepository.count()).isEqualTo(1)

        mvc
            .post(REQUESTS_PATH) {
                contentType = MediaType.APPLICATION_JSON
                content = createRequestBody(operationId, "different@example.com")
            }.andExpect {
                status { isConflict() }
                jsonPath("$.resultCode") { value("409-40") }
            }
        assertThat(auditRepository.count()).isEqualTo(1)
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `administrator processes an email request with idempotent audited decisions`() {
        val admin = requireNotNull(memberApplicationService.findByEmail("admin@test.com"))
        val subject =
            memberApplicationService.join(
                username = "privacy-operator-subject",
                password = "Abcd1234!",
                nickname = "Privacy subject",
                profileImgUrl = null,
                email = "privacy-operator-subject@example.com",
            )
        val createOperationId = UUID.randomUUID()

        val createdBody = createRequest(createOperationId, "  subject@example.com  ")
        val requestId = JsonPath.read<Number>(createdBody, "$.id").toLong()
        val created = requestRepository.findById(requestId).orElseThrow()

        assertThat(created.requesterContact).isEqualTo("subject@example.com")
        assertThat(Duration.between(created.requestedAt, created.dueAt)).isEqualTo(Duration.ofDays(10))
        assertThat(created.assignedOwnerId).isEqualTo(admin.id)
        assertThat(auditRepository.count()).isEqualTo(1)

        val replayedBody = createRequest(createOperationId, "subject@example.com")
        assertThat(JsonPath.read<Number>(replayedBody, "$.id").toLong()).isEqualTo(requestId)
        assertThat(auditRepository.count()).isEqualTo(1)

        mvc.get(REQUESTS_PATH).andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(requestId) }
        }
        mvc.get("$REQUESTS_PATH/$requestId").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(requestId) }
            jsonPath("$.identityStatus") { value("IDENTITY_PENDING") }
        }

        decide(
            requestId,
            "identity-decisions",
            """
            {
              "operationId": "${UUID.randomUUID()}",
              "approved": true,
              "requesterRole": "SUBJECT",
              "memberId": ${subject.id}
            }
            """,
        ).andExpect {
            status { isOk() }
            jsonPath("$.identityStatus") { value("VERIFIED_MANUAL") }
            jsonPath("$.status") { value("IN_PROGRESS") }
            jsonPath("$.identityVerifiedById") { value(admin.id) }
        }

        decide(
            requestId,
            "hold-decisions",
            """
            {
              "operationId": "${UUID.randomUUID()}",
              "status": "ACTIVE",
              "scope": "EXPORT",
              "reason": "Legal review"
            }
            """,
        ).andExpect {
            status { isOk() }
            jsonPath("$.holdStatus") { value("ACTIVE") }
            jsonPath("$.holdScope") { value("EXPORT") }
            jsonPath("$.holdReviewedById") { value(admin.id) }
        }

        decide(
            requestId,
            "hold-decisions",
            """
            {
              "operationId": "${UUID.randomUUID()}",
              "status": "RELEASED",
              "releaseDecision": "Review complete"
            }
            """,
        ).andExpect {
            status { isOk() }
            jsonPath("$.holdStatus") { value("RELEASED") }
            jsonPath("$.holdScope") { value("EXPORT") }
            jsonPath("$.holdReason") { value("Legal review") }
            jsonPath("$.holdReleaseDecision") { value("Review complete") }
        }

        decide(
            requestId,
            "step-up-decisions",
            """
            {"operationId": "${UUID.randomUUID()}", "approved": false}
            """,
        ).andExpect {
            status { isOk() }
            jsonPath("$.stepUpVerifiedById") { doesNotExist() }
        }

        decide(
            requestId,
            "step-up-decisions",
            """
            {"operationId": "${UUID.randomUUID()}", "approved": true}
            """,
        ).andExpect {
            status { isOk() }
            jsonPath("$.stepUpVerifiedById") { value(admin.id) }
        }

        decide(
            requestId,
            "decisions",
            """
            {"operationId": "${UUID.randomUUID()}", "status": "REJECTED"}
            """,
        ).andExpect {
            status { isOk() }
            jsonPath("$.status") { value("REJECTED") }
            jsonPath("$.completedAt") { exists() }
        }

        assertThat(auditRepository.count()).isEqualTo(7)
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `identity and hold decisions reject invalid subject state without audit`() {
        val subject =
            memberApplicationService.join(
                username = "privacy-invalid-identity-subject",
                password = "Abcd1234!",
                nickname = "Identity subject",
                profileImgUrl = null,
                email = "privacy-invalid-identity-subject@example.com",
            )
        val rejectedWithLink = JsonPath.read<Number>(createRequest(UUID.randomUUID(), "reject-link@example.com"), "$.id").toLong()
        val missingLink = JsonPath.read<Number>(createRequest(UUID.randomUUID(), "missing-link@example.com"), "$.id").toLong()
        val missingTombstone = JsonPath.read<Number>(createRequest(UUID.randomUUID(), "missing-tombstone@example.com"), "$.id").toLong()
        val pendingHold = JsonPath.read<Number>(createRequest(UUID.randomUUID(), "pending-hold@example.com"), "$.id").toLong()
        val initialAuditCount = auditRepository.count()

        decide(
            rejectedWithLink,
            "identity-decisions",
            """{"operationId": "${UUID.randomUUID()}", "approved": false, "memberId": ${subject.id}}""",
        ).andExpect { status { isBadRequest() } }
        decide(
            missingLink,
            "identity-decisions",
            """{"operationId": "${UUID.randomUUID()}", "approved": true, "requesterRole": "SUBJECT"}""",
        ).andExpect { status { isBadRequest() } }
        decide(
            missingTombstone,
            "identity-decisions",
            """
            {
              "operationId": "${UUID.randomUUID()}",
              "approved": true,
              "requesterRole": "SUBJECT",
              "accountDeletionId": 9223372036854775807
            }
            """,
        ).andExpect { status { isNotFound() } }
        decide(
            pendingHold,
            "hold-decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "CLEARED"}""",
        ).andExpect { status { isBadRequest() } }

        assertThat(auditRepository.count()).isEqualTo(initialAuditCount)
        listOf(rejectedWithLink, missingLink, missingTombstone, pendingHold).forEach { requestId ->
            assertThat(
                requestRepository
                    .findById(requestId)
                    .orElseThrow()
                    .identityStatus.name,
            ).isEqualTo("IDENTITY_PENDING")
        }

        val unreviewedHold =
            JsonPath
                .read<Number>(createRequest(UUID.randomUUID(), "unreviewed-hold@example.com"), "$.id")
                .toLong()
        approveIdentity(unreviewedHold, subject.id)
        val verifiedAuditCount = auditRepository.count()
        decide(
            unreviewedHold,
            "hold-decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "UNREVIEWED"}""",
        ).andExpect { status { isBadRequest() } }
        assertThat(auditRepository.count()).isEqualTo(verifiedAuditCount)
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `administrator links a tombstone or rejects an unverified request`() {
        val deletedSubject =
            memberApplicationService.join(
                username = "privacy-deleted-subject",
                password = "Abcd1234!",
                nickname = "Deleted subject",
                profileImgUrl = null,
                email = "privacy-deleted-subject@example.com",
            )
        val deletion =
            accountDeletionRepository.saveAndFlush(
                MemberAccountDeletion(memberId = deletedSubject.id, deletedAt = Instant.now()),
            )
        val tombstoneRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), "deleted@example.com"), "$.id").toLong()

        decide(
            tombstoneRequestId,
            "identity-decisions",
            """
            {
              "operationId": "${UUID.randomUUID()}",
              "approved": true,
              "requesterRole": "SUBJECT",
              "accountDeletionId": ${deletion.id}
            }
            """,
        ).andExpect {
            status { isOk() }
            jsonPath("$.identityStatus") { value("VERIFIED_MANUAL") }
            jsonPath("$.accountDeletionId") { value(deletion.id) }
        }
        decide(
            tombstoneRequestId,
            "step-up-decisions",
            """{"operationId": "${UUID.randomUUID()}", "approved": true}""",
        ).andExpect { status { isOk() } }
        decide(
            tombstoneRequestId,
            "exports",
            """{"operationId": "${UUID.randomUUID()}"}""",
        ).andExpect {
            status { isOk() }
            jsonPath("$.export.member.id") { value(deletedSubject.id) }
            jsonPath("$.export.requestHistory[0].id") { value(tombstoneRequestId) }
        }

        val rejectedRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), "rejected@example.com"), "$.id").toLong()
        decide(
            rejectedRequestId,
            "identity-decisions",
            """
            {"operationId": "${UUID.randomUUID()}", "approved": false}
            """,
        ).andExpect {
            status { isOk() }
            jsonPath("$.identityStatus") { value("REJECTED") }
            jsonPath("$.status") { value("REJECTED") }
            jsonPath("$.memberId") { doesNotExist() }
            jsonPath("$.accountDeletionId") { doesNotExist() }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `operation id cannot be reused for a different request`() {
        val operationId = UUID.randomUUID()
        val firstRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), "first@example.com"), "$.id").toLong()
        val secondRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), "second@example.com"), "$.id").toLong()

        decide(
            firstRequestId,
            "identity-decisions",
            """
            {"operationId": "$operationId", "approved": false}
            """,
        ).andExpect { status { isOk() } }
        val auditCount = auditRepository.count()
        decide(
            firstRequestId,
            "identity-decisions",
            """
            {"operationId": "$operationId", "approved": false}
            """,
        ).andExpect { status { isOk() } }
        assertThat(auditRepository.count()).isEqualTo(auditCount)

        decide(
            secondRequestId,
            "identity-decisions",
            """
            {"operationId": "$operationId", "approved": false}
            """,
        ).andExpect {
            status { isConflict() }
            jsonPath("$.resultCode") { value("409-40") }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `final decisions require recorded fulfillment for export and deletion`() {
        val subject =
            memberApplicationService.join(
                username = "privacy-fulfillment-subject",
                password = "Abcd1234!",
                nickname = "Fulfillment subject",
                profileImgUrl = null,
                email = "privacy-fulfillment-subject@example.com",
            )
        val exportRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), subject.email!!, "EXPORT"), "$.id").toLong()
        val deletionRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), subject.email!!, "DELETION"), "$.id").toLong()
        val correctionRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), subject.email!!, "CORRECTION"), "$.id").toLong()
        listOf(exportRequestId, deletionRequestId, correctionRequestId).forEach { approveIdentity(it, subject.id) }

        decide(
            exportRequestId,
            "decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "COMPLETED"}""",
        ).andExpect { status { isBadRequest() } }
        decide(
            deletionRequestId,
            "decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "COMPLETED"}""",
        ).andExpect { status { isBadRequest() } }
        decide(
            correctionRequestId,
            "decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "COMPLETED"}""",
        ).andExpect {
            status { isOk() }
            jsonPath("$.status") { value("COMPLETED") }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `operator actions fail closed when request gates are unmet or mismatched`() {
        val subject =
            memberApplicationService.join(
                username = "privacy-operator-gate-subject",
                password = "Abcd1234!",
                nickname = "Operator gate subject",
                profileImgUrl = null,
                email = "privacy-operator-gate-subject@example.com",
            )
        val pendingExportId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), subject.email!!, "EXPORT"), "$.id").toLong()
        decide(
            pendingExportId,
            "exports",
            """{"operationId": "${UUID.randomUUID()}"}""",
        ).andExpect { status { isBadRequest() } }
        approveIdentity(pendingExportId, subject.id)
        decide(
            pendingExportId,
            "exports",
            """{"operationId": "${UUID.randomUUID()}"}""",
        ).andExpect { status { isBadRequest() } }
        decide(
            pendingExportId,
            "decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "REJECTED"}""",
        ).andExpect { status { isOk() } }
        decide(
            pendingExportId,
            "exports",
            """{"operationId": "${UUID.randomUUID()}"}""",
        ).andExpect { status { isBadRequest() } }

        val deletionRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), subject.email!!, "DELETION"), "$.id").toLong()
        approveIdentity(deletionRequestId, subject.id)
        decide(
            deletionRequestId,
            "step-up-decisions",
            """{"operationId": "${UUID.randomUUID()}", "approved": true}""",
        ).andExpect { status { isOk() } }
        decide(
            deletionRequestId,
            "exports",
            """{"operationId": "${UUID.randomUUID()}"}""",
        ).andExpect { status { isBadRequest() } }
        decide(
            deletionRequestId,
            "deletions",
            """{"operationId": "${UUID.randomUUID()}"}""",
        ).andExpect { status { isBadRequest() } }

        val exportRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), subject.email!!, "EXPORT"), "$.id").toLong()
        approveIdentity(exportRequestId, subject.id)
        decide(
            exportRequestId,
            "step-up-decisions",
            """{"operationId": "${UUID.randomUUID()}", "approved": true}""",
        ).andExpect { status { isOk() } }
        decide(
            exportRequestId,
            "deletions",
            """{"operationId": "${UUID.randomUUID()}"}""",
        ).andExpect { status { isBadRequest() } }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `administrator exports canonical subject data after step-up verification`() {
        val subject =
            memberApplicationService.join(
                username = "privacy-export-operator-subject",
                password = "Abcd1234!",
                nickname = "Export subject",
                profileImgUrl = null,
                email = "privacy-export-operator-subject@example.com",
            )
        val post =
            postApplicationService.write(
                author = subject,
                title = "Public export post",
                content = "Canonical public content",
                published = true,
                listed = true,
                summaryMode = PostSummaryMode.AUTO,
            )
        memberSessionUseCase.createSession(
            member = subject,
            rememberLoginEnabled = true,
            ipSecurityEnabled = false,
            ipSecurityFingerprint = null,
            createdIp = "192.0.2.1",
            userAgent = "must-not-be-exported",
        )
        val requestId =
            JsonPath
                .read<Number>(
                    createRequest(UUID.randomUUID(), subject.email!!, "EXPORT"),
                    "$.id",
                ).toLong()
        approveIdentity(requestId, subject.id)
        decide(
            requestId,
            "step-up-decisions",
            """{"operationId": "${UUID.randomUUID()}", "approved": true}""",
        ).andExpect { status { isOk() } }
        decide(
            requestId,
            "deletions",
            """{"operationId": "${UUID.randomUUID()}"}""",
        ).andExpect { status { isBadRequest() } }
        val exportOperationId = UUID.randomUUID()

        val exportBody =
            decide(
                requestId,
                "exports",
                """{"operationId": "$exportOperationId"}""",
            ).andExpect {
                status { isOk() }
                jsonPath("$.requestId") { value(requestId) }
                jsonPath("$.export.member.id") { value(subject.id) }
                jsonPath("$.export.requestHistory[0].id") { value(requestId) }
                jsonPath("$.export.ownedPublicContent[0].id") { value(post.id) }
                jsonPath("$.export.ownedPublicContent[0].content") { value("Canonical public content") }
                jsonPath("$.export.sessionSummary.totalCount") { value(1) }
                jsonPath("$.export.sessionSummary.activeCount") { value(1) }
                jsonPath("$.evidenceSha256") { value(org.hamcrest.Matchers.matchesPattern("[0-9a-f]{64}")) }
                jsonPath("$..sessionKey") { doesNotExist() }
                jsonPath("$..createdIp") { doesNotExist() }
                jsonPath("$..userAgent") { doesNotExist() }
            }.andReturn()
                .response.contentAsString

        val auditCount = auditRepository.count()
        val replayBody =
            decide(
                requestId,
                "exports",
                """{"operationId": "$exportOperationId"}""",
            ).andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertThat(JsonPath.read<String>(replayBody, "$.evidenceSha256"))
            .isEqualTo(JsonPath.read<String>(exportBody, "$.evidenceSha256"))
        assertThat(auditRepository.count()).isEqualTo(auditCount)

        postApplicationService.write(
            author = subject,
            title = "Later public export post",
            content = "Changed canonical export bytes",
            published = true,
            listed = true,
            summaryMode = PostSummaryMode.AUTO,
        )
        decide(
            requestId,
            "exports",
            """{"operationId": "$exportOperationId"}""",
        ).andExpect {
            status { isConflict() }
            jsonPath("$.resultCode") { value("409-40") }
        }

        val otherRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), "other-export@example.com", "EXPORT"), "$.id").toLong()
        decide(
            otherRequestId,
            "exports",
            """{"operationId": "$exportOperationId"}""",
        ).andExpect {
            status { isConflict() }
            jsonPath("$.resultCode") { value("409-40") }
        }

        decide(
            requestId,
            "decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "COMPLETED"}""",
        ).andExpect {
            status { isOk() }
            jsonPath("$.status") { value("COMPLETED") }
        }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `administrator deletion fails closed until export and hold gates pass`() {
        val subject =
            memberApplicationService.join(
                username = "privacy-delete-operator-subject",
                password = "Abcd1234!",
                nickname = "Deletion subject",
                profileImgUrl = null,
                email = "privacy-delete-operator-subject@example.com",
            )
        val subjectEmail = requireNotNull(subject.email)
        val post =
            postApplicationService.write(
                author = subject,
                title = "Content to delete",
                content = "Remove with the account",
                published = true,
                listed = true,
                summaryMode = PostSummaryMode.AUTO,
            )
        memberSessionUseCase.createSession(
            member = subject,
            rememberLoginEnabled = true,
            ipSecurityEnabled = false,
            ipSecurityFingerprint = null,
            createdIp = null,
            userAgent = null,
        )
        val deletionRequestId =
            JsonPath
                .read<Number>(
                    createRequest(UUID.randomUUID(), subjectEmail, "DELETION"),
                    "$.id",
                ).toLong()
        approveIdentity(deletionRequestId, subject.id)
        decide(
            deletionRequestId,
            "hold-decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "CLEARED"}""",
        ).andExpect { status { isOk() } }
        decide(
            deletionRequestId,
            "step-up-decisions",
            """{"operationId": "${UUID.randomUUID()}", "approved": true}""",
        ).andExpect { status { isOk() } }

        val exportRequestId =
            JsonPath
                .read<Number>(
                    createRequest(UUID.randomUUID(), subjectEmail, "EXPORT"),
                    "$.id",
                ).toLong()
        approveIdentity(exportRequestId, subject.id)

        decide(
            deletionRequestId,
            "deletions",
            """{"operationId": "${UUID.randomUUID()}", "reason": "Verified request"}""",
        ).andExpect {
            status { isBadRequest() }
        }

        decide(
            exportRequestId,
            "decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "REJECTED"}""",
        ).andExpect { status { isOk() } }

        val deletionOperationId = UUID.randomUUID()
        val deletionBody =
            decide(
                deletionRequestId,
                "deletions",
                """{"operationId": "$deletionOperationId"}""",
            ).andExpect {
                status { isOk() }
                jsonPath("$.request.id") { value(deletionRequestId) }
                jsonPath("$.request.memberId") { doesNotExist() }
                jsonPath("$.request.accountDeletionId") { exists() }
                jsonPath("$.deletedAt") { exists() }
                jsonPath("$.evidenceSha256") { value(org.hamcrest.Matchers.matchesPattern("[0-9a-f]{64}")) }
            }.andReturn()
                .response.contentAsString

        val auditCount = auditRepository.count()
        val replayBody =
            decide(
                deletionRequestId,
                "deletions",
                """{"operationId": "$deletionOperationId"}""",
            ).andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertThat(JsonPath.read<String>(replayBody, "$.evidenceSha256"))
            .isEqualTo(JsonPath.read<String>(deletionBody, "$.evidenceSha256"))
        assertThat(auditRepository.count()).isEqualTo(auditCount)

        val otherRequestId =
            JsonPath.read<Number>(createRequest(UUID.randomUUID(), "other-deletion@example.com", "DELETION"), "$.id").toLong()
        decide(
            otherRequestId,
            "deletions",
            """{"operationId": "$deletionOperationId"}""",
        ).andExpect {
            status { isConflict() }
            jsonPath("$.resultCode") { value("409-40") }
        }

        decide(
            deletionRequestId,
            "decisions",
            """{"operationId": "${UUID.randomUUID()}", "status": "COMPLETED"}""",
        ).andExpect {
            status { isOk() }
            jsonPath("$.status") { value("COMPLETED") }
        }

        assertThat(memberApplicationService.findByEmail(subjectEmail)).isNull()
        assertThat(accountDeletionRepository.existsByMemberId(subject.id)).isTrue()
        assertThat(postApplicationService.findPublicDetailById(post.id)).isNull()
    }

    private fun createRequest(
        operationId: UUID,
        contact: String,
        type: String = "EXPORT",
    ): String =
        mvc
            .post(REQUESTS_PATH) {
                contentType = MediaType.APPLICATION_JSON
                content = createRequestBody(operationId, contact, type)
            }.andExpect {
                status { isCreated() }
            }.andReturn()
            .response.contentAsString

    private fun decide(
        requestId: Long,
        decisionPath: String,
        body: String,
    ) = mvc.post("$REQUESTS_PATH/$requestId/$decisionPath") {
        contentType = MediaType.APPLICATION_JSON
        content = body.trimIndent()
    }

    private fun createRequestBody(
        operationId: UUID,
        contact: String,
        type: String = "EXPORT",
    ): String =
        """
        {
          "operationId": "$operationId",
          "type": "$type",
          "requesterContact": "$contact",
          "message": "Requested by email"
        }
        """.trimIndent()

    private fun approveIdentity(
        requestId: Long,
        memberId: Long,
    ) {
        decide(
            requestId,
            "identity-decisions",
            """
            {
              "operationId": "${UUID.randomUUID()}",
              "approved": true,
              "requesterRole": "SUBJECT",
              "memberId": $memberId
            }
            """,
        ).andExpect { status { isOk() } }
    }

    companion object {
        private const val REQUESTS_PATH = "/member/api/v1/adm/privacy/requests"
    }
}
