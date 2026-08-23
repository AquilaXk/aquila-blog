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
        assertThat(openApiNode.path("openapi").asText()).isNotBlank()
        assertThat(
            openApiNode
                .path("servers")
                .first()
                .path("url")
                .asText(),
        ).isEqualTo("https://api.blog.aquilaxk.site")
        assertThat(
            openApiNode
                .path("components")
                .path("securitySchemes")
                .path("bearerAuth")
                .path("type")
                .asText(),
        ).isEqualTo("http")
        assertThat(
            openApiNode
                .path("components")
                .path("securitySchemes")
                .path("bearerAuth")
                .path("scheme")
                .asText(),
        ).isEqualTo("bearer")
        assertThat(
            openApiNode
                .path("components")
                .path("securitySchemes")
                .path("bearerAuth")
                .path("bearerFormat")
                .asText(),
        ).isEqualTo("JWT")
        assertTypeSet(propertySchema(openApiNode, "PostModifyRequest", "contentHtml"), "string", "null")
        assertTypeSet(propertySchema(openApiNode, "PostModifyRequest", "published"), "boolean", "null")
        val completedFileId = propertySchema(openApiNode, "CloudVideoUploadSessionDto", "completedFileId")
        assertTypeSet(completedFileId, "integer", "null")
        assertThat(completedFileId.path("format").asText()).isEqualTo("int64")
        val summaryMode = propertySchema(openApiNode, "PostModifyRequest", "summaryMode")
        assertTypeSet(summaryMode, "string", "null")
        assertNullableEnum(summaryMode, "AUTO", "MANUAL")
        assertNullableReference(
            propertySchema(openApiNode, "AuthSessionMemberDto", "legalReconsent"),
            "#/components/schemas/LegalReconsentStatus",
        )

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
        assertThat(schema.path("type").values().map { it.asText() })
            .containsExactlyInAnyOrderElementsOf(expectedTypes.toList())
    }

    private fun assertNullableReference(
        schema: JsonNode,
        expectedReference: String,
    ) {
        val variants = schema.path("oneOf")

        assertThat(variants).hasSize(2)
        assertThat(variants.values().map { it.path("\$ref").asText() to it.path("type").asText() })
            .containsExactlyInAnyOrderElementsOf(listOf(expectedReference to "", "" to "null"))
    }

    private fun assertNullableEnum(
        schema: JsonNode,
        vararg expectedValues: String,
    ) {
        val actualValues = schema.path("enum").values().map { if (it.isNull) null else it.asText() }
        val expected = expectedValues.map<String, String?> { it } + null

        assertThat(actualValues).containsExactlyInAnyOrderElementsOf(expected)
    }
}
