package com.back.global.springDoc

import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.get
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption

@org.junit.jupiter.api.DisplayName("OpenAPI 계약 산출물 테스트")
class OpenApiContractExportTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Test
    fun `v3 api docs를 빌드 산출물로 내보낸다`() {
        val responseBody =
            mvc
                .get("/v3/api-docs")
                .andExpect {
                    status { isOk() }
                }.andReturn()
                .response
                .contentAsString

        val openApiNode = objectMapper.readTree(responseBody)
        assertThat(openApiNode.path("openapi").asString()).isNotBlank()
        assertThat(openApiNode.path("paths").has("/post/api/v1/posts/files")).isFalse()
        assertThat(openApiNode.path("paths").has("/post/api/v1/files/**")).isFalse()
        val schemas = openApiNode.path("components").path("schemas")
        assertThat(schemas.has("UploadPostFileResBody")).isFalse()
        assertThat(schemas.has("RsDataUploadPostFileResBody")).isFalse()
        assertThat(
            openApiNode
                .path("servers")
                .first()
                .path("url")
                .asString(),
        ).isEqualTo("https://blog.aquilaxk.site")
        assertThat(
            openApiNode
                .path("components")
                .path("securitySchemes")
                .path("bearerAuth")
                .path("type")
                .asString(),
        ).isEqualTo("http")
        assertThat(
            openApiNode
                .path("components")
                .path("securitySchemes")
                .path("bearerAuth")
                .path("scheme")
                .asString(),
        ).isEqualTo("bearer")
        assertThat(
            openApiNode
                .path("components")
                .path("securitySchemes")
                .path("bearerAuth")
                .path("bearerFormat")
                .asString(),
        ).isEqualTo("JWT")
        assertTypeSet(propertySchema(openApiNode, "PostModifyRequest", "contentHtml"), "string", "null")
        assertTypeSet(propertySchema(openApiNode, "PostModifyRequest", "published"), "boolean", "null")
        val completedFileId = propertySchema(openApiNode, "CloudVideoUploadSessionDto", "completedFileId")
        assertTypeSet(completedFileId, "integer", "null")
        assertThat(completedFileId.path("format").asString()).isEqualTo("int64")
        val summaryMode = propertySchema(openApiNode, "PostModifyRequest", "summaryMode")
        assertTypeSet(summaryMode, "string", "null")
        assertNullableEnum(summaryMode, "AUTO", "MANUAL")
        val createSummaryMode = propertySchema(openApiNode, "PostWriteRequest", "summaryMode")
        assertThat(createSummaryMode.path("type").asString()).isEqualTo("string")
        assertThat(createSummaryMode.path("enum").values().map { it.asString() })
            .containsExactlyInAnyOrder("AUTO", "MANUAL")
        assertThat(
            schemas
                .path("PostWriteRequest")
                .path("required")
                .values()
                .map { it.asString() },
        ).contains("summaryMode")
        val adminEmailCode = propertySchema(openApiNode, "AdminEmailCodeVerifyRequest", "code")
        assertThat(adminEmailCode.path("minLength").asInt()).isEqualTo(8)
        assertThat(adminEmailCode.path("maxLength").asInt()).isEqualTo(8)
        assertThat(adminEmailCode.path("pattern").asString()).isEqualTo("\\d{8}")
        assertThat(openApiNode.path("paths").has("/post/api/v1/adm/posts/preview-summary")).isFalse()
        assertThat(openApiNode.path("paths").has("/post/api/v1/adm/posts/summary-backfill")).isFalse()
        assertThat(schemas.has("PostSummaryPreviewRequest")).isFalse()
        assertThat(schemas.has("PostSummaryPreviewResponse")).isFalse()
        assertThat(schemas.has("PostSummaryBackfillRequest")).isFalse()
        assertThat(schemas.has("PostSummaryBackfillResponse")).isFalse()
        assertTypeSet(propertySchema(openApiNode, "PostWithContentDto", "thumbnail"), "string", "null")
        assertTypeSet(propertySchema(openApiNode, "PostWithContentDto", "contentHtmlHash"), "string", "null")
        val contentHtmlSanitizerPolicyVersion =
            propertySchema(openApiNode, "PostWithContentDto", "contentHtmlSanitizerPolicyVersion")
        assertTypeSet(contentHtmlSanitizerPolicyVersion, "string", "null")
        assertNullableEnum(contentHtmlSanitizerPolicyVersion, "content-html-v1")
        val contentHtmlTrustState = propertySchema(openApiNode, "PostWithContentDto", "contentHtmlTrustState")
        assertThat(contentHtmlTrustState.path("type").asString()).isEqualTo("string")
        assertThat(contentHtmlTrustState.path("enum").values().map { it.asString() })
            .containsExactlyInAnyOrder("TRUSTED_CURRENT", "UNKNOWN", "REJECTED")
        val feedPostSchema = openApiNode.path("components").path("schemas").path("FeedPostDto")
        assertThat(feedPostSchema.path("required").values().map { it.asString() })
            .containsExactlyInAnyOrder("summary", "summarySource")
        assertEnum(
            openApiNode,
            propertySchema(openApiNode, "FeedPostDto", "summarySource"),
            "MANUAL",
            "LEADING_BLOCK",
            "EXTRACTED",
            "MIGRATED",
            "NONE",
        )
        val authSessionMemberSchema = openApiNode.path("components").path("schemas").path("AuthSessionMemberDto")
        assertThat(authSessionMemberSchema.path("properties").has("legalReconsent")).isFalse()
        val paths = openApiNode.path("paths")
        assertThat(schemas.has("MemberDto")).isFalse()
        listOf(
            "MemberWithUsernameDto",
            "AuthSessionMemberDto",
        ).forEach { schemaName ->
            val schema = schemas.path(schemaName)
            assertThat(schema.path("properties").has("isAdmin")).isTrue()
            assertThat(schema.path("properties").has("admin")).isFalse()
            assertThat(
                schema
                    .path("properties")
                    .path("isAdmin")
                    .path("type")
                    .asString(),
            ).isEqualTo("boolean")
            assertThat(schema.path("required").values().map { it.asString() }).contains("isAdmin")
        }
        assertThat(schemas.path("MemberWithUsernameDto").path("properties").has("aboutDetails")).isFalse()
        assertThat(schemas.path("MemberWithUsernameDto").path("properties").has("profileImageDirectUrl")).isFalse()
        listOf(
            "/member/api/v1/auth/login",
            "/member/api/v1/privacy/export",
            "/member/api/v1/privacy/requests",
            "/member/api/v1/privacy/requests/{requestId}",
            "/member/api/v1/privacy/account",
            "/member/api/v1/adm/members",
            "/member/api/v1/adm/members/{id}",
            "/member/api/v1/adm/members/legal-reconsent/report",
            "/member/api/v1/adm/members/{id}/profileImgUrl",
            "/member/api/v1/adm/members/{id}/profileCard",
        ).forEach { retiredPath ->
            assertThat(paths.has(retiredPath)).isFalse()
        }
        val uploadResponse = schemas.path("ProfileImageUploadResponse")
        assertThat(uploadResponse.path("properties").propertyNames()).containsExactly("profileImageUrl")
        listOf(
            "AccountDeletionRequest",
            "AccountDeletionResult",
            "MemberLoginRequest",
            "PageDtoMemberWithUsernameDto",
            "PrivacyExportMemberSnapshot",
            "PrivacyExportResponse",
            "PrivacyLegalAcceptanceSnapshot",
            "PrivacyRequestCreateRequest",
            "PrivacyRequestDto",
            "PrivacyRequestResBody",
            "RsDataAccountDeletionResult",
            "RsDataPrivacyExportResponse",
            "RsDataPrivacyRequestResBody",
            "LegalReconsentReport",
            "LegalReconsentReportResponse",
        ).forEach { retiredSchema ->
            assertThat(schemas.has(retiredSchema)).isFalse()
        }
        assertThat(paths.has("/system/api/v1/adm/operations/task-dlq-replay")).isTrue()
        assertThat(paths.has("/system/api/v1/adm/operations/{operationId}")).isTrue()
        assertThat(paths.has("/system/api/v1/adm/tasks/replay-failed")).isFalse()
        val replayRequest = openApiNode.path("components").path("schemas").path("TaskDlqReplayOperationRequest")
        assertThat(replayRequest.path("required").values().map { it.asString() })
            .containsExactlyInAnyOrder("operationId", "reason")
        assertThat(replayRequest.path("properties").has("actorId")).isFalse()
        assertThat(replayRequest.path("properties").has("sessionRowId")).isFalse()
        assertThat(
            replayRequest
                .path("properties")
                .path("operationId")
                .path("format")
                .asString(),
        ).isEqualTo("uuid")
        assertThat(
            replayRequest
                .path("properties")
                .path("operationId")
                .path("type")
                .asString(),
        ).isEqualTo("string")
        val replayReason = replayRequest.path("properties").path("reason")
        assertThat(replayReason.path("minLength").asInt()).isEqualTo(1)
        assertThat(replayReason.path("maxLength").asInt()).isEqualTo(200)
        assertEnum(
            openApiNode,
            propertySchema(openApiNode, "AdminOperationResBody", "action"),
            "TASK_DLQ_REPLAY",
            "SEARCH_PIPELINE_FORCE_CONTROL",
            "SEARCH_ENGINE_MIRROR_FORCE_DISABLE",
        )
        assertEnum(
            openApiNode,
            propertySchema(openApiNode, "AdminOperationResBody", "status"),
            "ACCEPTED",
            "SUCCEEDED",
            "PARTIAL",
            "FAILED",
        )
        assertNullableEnum(
            openApiNode,
            propertySchema(openApiNode, "AdminOperationResBody", "resultCode"),
            "NO_MATCHING_TASKS",
            "ALL_TASKS_QUARANTINED",
            "TASKS_REPLAYED",
            "TASKS_PARTIALLY_REPLAYED",
            "SEARCH_PIPELINE_FORCE_CONTROL_UPDATED",
            "SEARCH_ENGINE_MIRROR_FORCE_DISABLE_UPDATED",
        )
        assertNullableEnum(
            openApiNode,
            propertySchema(openApiNode, "AdminOperationResBody", "controlKey"),
            "PIPELINE_FORCE_CONTROL",
            "MIRROR_FORCE_DISABLE",
        )
        assertNullableEnum(
            openApiNode,
            propertySchema(openApiNode, "AdminOperationResBody", "controlValue"),
            "UNSET",
            "ENABLED",
            "DISABLED",
        )
        assertTypeSet(propertySchema(openApiNode, "AdminOperationResBody", "controlVersion"), "integer", "null")
        assertThat(propertySchema(openApiNode, "AdminOperationResBody", "controlVersion").path("format").asString())
            .isEqualTo("int64")
        listOf("SearchPipelineForceControlRequest", "SearchEngineMirrorForceDisableRequest").forEach { schemaName ->
            val request = openApiNode.path("components").path("schemas").path(schemaName)
            assertThat(request.path("required").values().map { it.asString() })
                .containsExactlyInAnyOrder("operationId", "reason")
            assertThat(
                request
                    .path("properties")
                    .path("operationId")
                    .path("format")
                    .asString(),
            ).isEqualTo("uuid")
            assertThat(
                request
                    .path("properties")
                    .path("reason")
                    .path("minLength")
                    .asInt(),
            ).isEqualTo(1)
            assertThat(
                request
                    .path("properties")
                    .path("reason")
                    .path("maxLength")
                    .asInt(),
            ).isEqualTo(200)
        }
        listOf(
            "/system/api/v1/adm/search/pipeline/force-control",
            "/system/api/v1/adm/search-engine/mirror/force-disable",
        ).forEach { path ->
            val responses =
                openApiNode
                    .path("paths")
                    .path(path)
                    .path("post")
                    .path("responses")
            assertThat(responses.has("202")).isTrue()
            assertThat(responses.has("200")).isFalse()
            assertThat(
                responses
                    .path("202")
                    .path("content")
                    .path("*/*")
                    .path("schema")
                    .path("\$ref")
                    .asString(),
            ).isEqualTo("#/components/schemas/RsDataAdminOperationResBody")
        }
        val runtimeFlags = openApiNode.path("components").path("schemas").path("SearchRuntimeFlags")
        assertThat(runtimeFlags.path("properties").has("searchPipelineRuntimeOverride")).isFalse()
        assertThat(
            runtimeFlags
                .path("properties")
                .path("searchPipeline")
                .path("\$ref")
                .asString(),
        ).isEqualTo("#/components/schemas/SearchRuntimeControlStateResBody")
        assertThat(
            runtimeFlags
                .path("properties")
                .path("searchEngineMirror")
                .path("\$ref")
                .asString(),
        ).isEqualTo("#/components/schemas/SearchRuntimeControlStateResBody")
        assertEnum(
            openApiNode,
            propertySchema(openApiNode, "SearchRuntimeControlStateResBody", "controlKey"),
            "PIPELINE_FORCE_CONTROL",
            "MIRROR_FORCE_DISABLE",
        )
        assertThat(openApiNode.path("paths").has("/post/api/v1/posts/sitemap")).isTrue()
        assertThat(openApiNode.path("paths").has("/post/api/v1/posts/wikilink-catalog")).isTrue()
        assertThat(openApiNode.path("paths").has("/post/api/v1/posts/{id}/backlinks")).isTrue()
        assertThat(openApiNode.path("paths").has("/post/api/v1/posts/{id}/series")).isTrue()
        assertThat(openApiNode.path("paths").has("/post/api/v1/adm/posts/{id}/revisions")).isTrue()
        assertThat(openApiNode.path("paths").has("/post/api/v1/adm/posts/{id}/revisions/{revisionId}/restore")).isTrue()
        assertThat(openApiNode.path("paths").has("/post/api/v1/adm/posts/temp")).isTrue()
        assertThat(openApiNode.path("paths").has("/post/api/v1/adm/posts/temp/{id}")).isTrue()
        assertThat(openApiNode.path("paths").has("/post/api/v1/adm/posts/series")).isTrue()
        listOf(
            "PostWriteRequest",
            "PostModifyRequest",
            "PostTempDraftSaveRequest",
            "PostDto",
            "PostWithContentDto",
            "PostWriteResultDto",
        ).forEach { schemaName ->
            val props = schemas.path(schemaName).path("properties")
            assertThat(props.has("scheduledAt")).describedAs("%s.scheduledAt", schemaName).isTrue()
            assertThat(props.has("seriesName")).describedAs("%s.seriesName", schemaName).isTrue()
            assertThat(props.has("seriesOrder")).describedAs("%s.seriesOrder", schemaName).isTrue()
            assertThat(props.has("canonicalUrl")).describedAs("%s.canonicalUrl", schemaName).isTrue()
        }

        val outputPath = Path.of("build/openapi/openapi.json")
        Files.createDirectories(outputPath.parent)

        val normalizedJson = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(openApiNode)
        Files.writeString(
            outputPath,
            "$normalizedJson\n",
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE,
        )

        assertThat(Files.exists(outputPath)).isTrue()
        assertThat(Files.size(outputPath)).isGreaterThan(0)
    }

    private fun propertySchema(
        openApiNode: JsonNode,
        schemaName: String,
        propertyName: String,
    ): JsonNode =
        openApiNode
            .path("components")
            .path("schemas")
            .path(schemaName)
            .path("properties")
            .path(propertyName)

    private fun assertTypeSet(
        schema: JsonNode,
        vararg expectedTypes: String,
    ) {
        assertThat(schema.path("type").values().map { it.asString() })
            .containsExactlyInAnyOrderElementsOf(expectedTypes.toList())
    }

    private fun assertNullableEnum(
        schema: JsonNode,
        vararg expectedValues: String,
    ) {
        val actualValues = schema.path("enum").values().map { if (it.isNull) null else it.asString() }
        val expected = expectedValues.map<String, String?> { it } + null

        assertThat(actualValues).containsExactlyInAnyOrderElementsOf(expected)
    }

    private fun assertNullableEnum(
        openApiNode: JsonNode,
        schema: JsonNode,
        vararg expectedValues: String,
    ) {
        val resolved = resolveSchema(openApiNode, schema)
        val actualValues = resolved.path("enum").values().map { if (it.isNull) null else it.asString() }
        val expected = expectedValues.map<String, String?> { it } + null

        assertThat(actualValues).containsExactlyInAnyOrderElementsOf(expected)
    }

    private fun assertEnum(
        openApiNode: JsonNode,
        schema: JsonNode,
        vararg expectedValues: String,
    ) {
        val resolved = resolveSchema(openApiNode, schema)

        assertThat(resolved.path("enum").values().map { it.asString() })
            .containsExactlyInAnyOrderElementsOf(expectedValues.toList())
    }

    private fun resolveSchema(
        openApiNode: JsonNode,
        schema: JsonNode,
    ): JsonNode {
        val reference =
            schema.path("\$ref").asString().ifBlank {
                schema
                    .path("oneOf")
                    .firstOrNull { !it.path("\$ref").asString().isBlank() }
                    ?.path("\$ref")
                    ?.asString()
                    .orEmpty()
            }
        return if (reference.isBlank()) {
            schema
        } else {
            openApiNode.path("components").path("schemas").path(reference.substringAfterLast('/'))
        }
    }
}
