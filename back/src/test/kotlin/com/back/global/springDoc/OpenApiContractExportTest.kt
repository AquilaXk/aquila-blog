package com.back.global.springDoc

import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.get
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
}
