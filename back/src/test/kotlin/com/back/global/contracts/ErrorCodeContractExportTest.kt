package com.back.global.contracts

import com.back.global.exception.application.ErrorCode
import com.back.global.exception.application.ErrorKind
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import tools.jackson.databind.ObjectMapper
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption

@org.junit.jupiter.api.DisplayName("ErrorCode 계약 산출물 테스트")
class ErrorCodeContractExportTest {
    private val objectMapper = ObjectMapper()

    @Test
    fun `ErrorCode를 code ASCII 순서의 빌드 산출물로 내보낸다`() {
        val outputPath = Path.of("build/public-api/error-codes.json")
        Files.createDirectories(outputPath.parent)

        Files.writeString(
            outputPath,
            "${objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(exportEntries(ErrorCode.entries))}\n",
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE,
        )

        val exported = objectMapper.readTree(Files.readString(outputPath))
        val output = Files.readString(outputPath)
        assertThat(output.indexOf("\"400-1\"")).isLessThan(output.indexOf("\"500-1\""))
        assertThat(output)
            .contains("\"409-3\"", "\"500-2\"")
            .doesNotContain("\"409-4\"")
        assertThat(exported.first().path("httpStatus").asInt()).isPositive()
        assertThat(exported.first().path("defaultUserMessage").asText()).isNotBlank()
        assertThat(exported.first().path("kind").asText()).isIn("USER", "DEVELOPER")
    }

    @Test
    fun `duplicate ErrorCode code는 내보내기를 거부한다`() {
        assertThatThrownBy {
            exportContracts(
                listOf(
                    ErrorCodeContract("400-1", 400, "bad", ErrorKind.USER.name),
                    ErrorCodeContract("400-1", 400, "bad", ErrorKind.USER.name),
                ),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Duplicate ErrorCode code")
    }

    private fun exportEntries(errorCodes: List<ErrorCode>): List<ErrorCodeContract> =
        exportContracts(errorCodes.map { ErrorCodeContract(it.code, it.status.value(), it.defaultUserMessage, it.kind.name) })

    private fun exportContracts(errorCodes: List<ErrorCodeContract>): List<ErrorCodeContract> {
        require(errorCodes.map { it.code }.toSet().size == errorCodes.size) { "Duplicate ErrorCode code" }
        return errorCodes.sortedWith { a, b -> a.code.compareTo(b.code) }
    }

    private data class ErrorCodeContract(
        val code: String,
        val httpStatus: Int,
        val defaultUserMessage: String,
        val kind: String,
    )
}
