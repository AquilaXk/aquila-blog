package com.back.global.system.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.system.application.port.output.SearchRuntimeControlStatePort
import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlState
import com.back.global.system.model.SearchRuntimeControlValue
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DataAccessException
import org.springframework.stereotype.Service
import java.time.Instant

@Service
class SearchRuntimeControlQueryService(
    private val controlStatePort: SearchRuntimeControlStatePort,
    @Value("\${custom.post.search.pipeline.rollback.forceControl:false}")
    private val pipelineForceControlBaseline: Boolean,
) {
    private val requiredKeys =
        setOf(
            SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL,
            SearchRuntimeControlKey.MIRROR_FORCE_DISABLE,
        )

    data class ControlStateSnapshot(
        val controlKey: SearchRuntimeControlKey,
        val controlValue: SearchRuntimeControlValue,
        val version: Long,
        val modifiedAt: Instant,
    )

    data class RuntimeSnapshot(
        val searchPipeline: ControlStateSnapshot,
        val searchPipelineForceControlEnabled: Boolean,
        val searchEngineMirror: ControlStateSnapshot,
        val searchEngineMirrorForceDisabled: Boolean,
    )

    fun runtimeSnapshot(): RuntimeSnapshot =
        try {
            val states = controlStatePort.findAllByControlKeyIn(requiredKeys)
            val statesByKey = states.groupBy(SearchRuntimeControlState::controlKey)
            if (statesByKey.keys != requiredKeys || statesByKey.values.any { it.size != 1 }) unavailable()

            val pipeline = statesByKey.getValue(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL).single().toSnapshot()
            val mirror = statesByKey.getValue(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE).single().toSnapshot()
            RuntimeSnapshot(
                searchPipeline = pipeline,
                searchPipelineForceControlEnabled = resolvePipelineForceControl(pipeline.controlValue),
                searchEngineMirror = mirror,
                searchEngineMirrorForceDisabled = resolveMirrorForceDisabled(mirror.controlValue),
            )
        } catch (error: DataAccessException) {
            throw AppException(ErrorCode.SERVICE_UNAVAILABLE, cause = error)
        }

    fun isPipelineForceControlEnabled(): Boolean =
        try {
            controlStatePort
                .findByControlKey(SearchRuntimeControlKey.PIPELINE_FORCE_CONTROL)
                ?.let { resolvePipelineForceControl(it.controlValue) }
                ?: true
        } catch (_: DataAccessException) {
            true
        }

    fun isMirrorForceDisabled(): Boolean =
        try {
            controlStatePort
                .findByControlKey(SearchRuntimeControlKey.MIRROR_FORCE_DISABLE)
                ?.let { resolveMirrorForceDisabled(it.controlValue) }
                ?: true
        } catch (_: DataAccessException) {
            true
        }

    private fun SearchRuntimeControlState.toSnapshot(): ControlStateSnapshot =
        ControlStateSnapshot(
            controlKey = controlKey,
            controlValue = controlValue,
            version = version,
            modifiedAt = modifiedAt ?: unavailable(),
        )

    private fun resolvePipelineForceControl(value: SearchRuntimeControlValue): Boolean =
        when (value) {
            SearchRuntimeControlValue.ENABLED -> true
            SearchRuntimeControlValue.DISABLED -> false
            SearchRuntimeControlValue.UNSET -> pipelineForceControlBaseline
        }

    private fun resolveMirrorForceDisabled(value: SearchRuntimeControlValue): Boolean =
        when (value) {
            SearchRuntimeControlValue.ENABLED -> false
            SearchRuntimeControlValue.DISABLED,
            SearchRuntimeControlValue.UNSET,
            -> true
        }

    private fun unavailable(): Nothing = throw AppException(ErrorCode.SERVICE_UNAVAILABLE)
}
