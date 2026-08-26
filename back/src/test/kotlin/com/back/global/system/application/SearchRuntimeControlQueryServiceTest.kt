package com.back.global.system.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.system.application.port.output.SearchRuntimeControlStatePort
import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlState
import com.back.global.system.model.SearchRuntimeControlValue
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.dao.DataAccessResourceFailureException
import java.time.Instant

class SearchRuntimeControlQueryServiceTest {
    private val controlStatePort = mock(SearchRuntimeControlStatePort::class.java)

    @Test
    fun `runtime snapshot reads both exact control states in one query`() {
        val service = SearchRuntimeControlQueryService(controlStatePort, pipelineForceControlBaseline = false)
        `when`(
            controlStatePort.findAllByControlKeyIn(
                setOf(
                    SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL,
                    SearchRuntimeControlKey.MIRROR_FORCE_DISABLE,
                ),
            ),
        ).thenReturn(
            listOf(
                state(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL, SearchRuntimeControlValue.ENABLED, 3),
                state(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE, SearchRuntimeControlValue.ENABLED, 4),
            ),
        )

        val snapshot = service.runtimeSnapshot()

        assertThat(snapshot.searchPipelineForceControlEnabled).isTrue()
        assertThat(snapshot.searchEngineMirrorForceDisabled).isFalse()
        assertThat(snapshot.searchPipeline.version).isEqualTo(3)
        assertThat(snapshot.searchEngineMirror.version).isEqualTo(4)
    }

    @Test
    fun `pipeline unset resolves configured baseline while missing and data access fail closed`() {
        val baselineEnabled = SearchRuntimeControlQueryService(controlStatePort, pipelineForceControlBaseline = true)
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL))
            .thenReturn(state(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL, SearchRuntimeControlValue.UNSET, 0))
        assertThat(baselineEnabled.isPipelineForceControlEnabled()).isTrue()

        val baselineDisabled = SearchRuntimeControlQueryService(controlStatePort, pipelineForceControlBaseline = false)
        assertThat(baselineDisabled.isPipelineForceControlEnabled()).isFalse()
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL))
            .thenReturn(state(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL, SearchRuntimeControlValue.DISABLED, 1))
        assertThat(baselineDisabled.isPipelineForceControlEnabled()).isFalse()
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL)).thenReturn(null)
        assertThat(baselineDisabled.isPipelineForceControlEnabled()).isTrue()
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL))
            .thenThrow(DataAccessResourceFailureException("unavailable"))
        assertThat(baselineDisabled.isPipelineForceControlEnabled()).isTrue()
    }

    @Test
    fun `mirror missing unset and data access are force disabled`() {
        val service = SearchRuntimeControlQueryService(controlStatePort, pipelineForceControlBaseline = false)
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE))
            .thenReturn(state(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE, SearchRuntimeControlValue.ENABLED, 0))
        assertThat(service.isMirrorForceDisabled()).isFalse()
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE))
            .thenReturn(state(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE, SearchRuntimeControlValue.DISABLED, 0))
        assertThat(service.isMirrorForceDisabled()).isTrue()
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE))
            .thenReturn(state(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE, SearchRuntimeControlValue.UNSET, 0))
        assertThat(service.isMirrorForceDisabled()).isTrue()
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE)).thenReturn(null)
        assertThat(service.isMirrorForceDisabled()).isTrue()
        `when`(controlStatePort.findByControlKey(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE))
            .thenThrow(DataAccessResourceFailureException("unavailable"))
        assertThat(service.isMirrorForceDisabled()).isTrue()
    }

    @Test
    fun `strict snapshot maps missing and data access to service unavailable`() {
        val service = SearchRuntimeControlQueryService(controlStatePort, pipelineForceControlBaseline = false)
        `when`(controlStatePort.findAllByControlKeyIn(org.mockito.ArgumentMatchers.anySet()))
            .thenReturn(listOf(state(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL, SearchRuntimeControlValue.UNSET, 0)))
        assertThatThrownBy { service.runtimeSnapshot() }
            .isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)

        `when`(controlStatePort.findAllByControlKeyIn(org.mockito.ArgumentMatchers.anySet()))
            .thenThrow(DataAccessResourceFailureException("unavailable"))
        assertThatThrownBy { service.runtimeSnapshot() }
            .isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
    }

    private fun state(
        key: SearchRuntimeControlKey,
        value: SearchRuntimeControlValue,
        version: Long,
    ): SearchRuntimeControlState =
        SearchRuntimeControlState(
            controlKey = key,
            controlValue = value,
            version = version,
            modifiedAt = Instant.parse("2026-08-26T00:00:00Z"),
        )
}
