package com.back.global.task.adapter.scheduler

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

class TaskProcessingScheduledJobAnnotationTest {
    @Test
    @DisplayName("processTasks는 orphan shedlock이 장시간 backlog를 만들지 않도록 짧은 lockAtMostFor를 선언한다")
    fun `processTasks declares bounded shedlock window`() {
        val method = TaskProcessingScheduledJob::class.java.getDeclaredMethod("processTasks")
        val schedulerLock = method.getAnnotation(SchedulerLock::class.java)

        assertThat(schedulerLock).isNotNull
        assertThat(schedulerLock.name).isEqualTo("processTasks")
        assertThat(schedulerLock.lockAtLeastFor).isEqualTo("PT1M")
        assertThat(schedulerLock.lockAtMostFor).isEqualTo("PT2M")
    }
}
