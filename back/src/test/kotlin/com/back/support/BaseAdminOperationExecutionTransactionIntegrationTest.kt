package com.back.support

import com.back.global.task.application.TaskDlqReplayService
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean

@SpringBootTest
abstract class BaseAdminOperationExecutionTransactionIntegrationTest : BaseIntegrationTest() {
    @MockitoBean
    protected lateinit var taskDlqReplayService: TaskDlqReplayService
}
