package com.back.global.storage.health

import com.back.global.storage.adapter.CloudStorageAdapter
import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.boot.health.contributor.Health
import org.springframework.boot.health.contributor.HealthIndicator
import org.springframework.stereotype.Component

@Component
class StorageDependencyHealthIndicator(
    private val cloudStorageAdapter: CloudStorageAdapter,
    private val meterRegistry: MeterRegistry,
) : HealthIndicator {
    override fun health(): Health {
        val probe = cloudStorageAdapter.probeStorageDependency()
        probe.reason?.let { CloudMediaMetrics.recordStorageDependencyFailure(meterRegistry, it.wireValue) }

        val builder =
            when (probe.state) {
                StorageDependencyState.DISABLED,
                StorageDependencyState.READY,
                -> Health.up()
                StorageDependencyState.DOWN -> Health.down()
            }

        builder.withDetail("state", probe.state.wireValue)
        probe.reason?.let { builder.withDetail("reason", it.wireValue) }
        probe.credentialVersion?.let { builder.withDetail("credentialVersion", it) }
        return builder.build()
    }
}
