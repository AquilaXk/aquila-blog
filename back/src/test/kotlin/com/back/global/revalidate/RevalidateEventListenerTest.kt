package com.back.global.revalidate

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.global.task.domain.TaskStatus
import com.back.global.task.out.TaskRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.transaction.TestTransaction
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@ActiveProfiles("test")
@SpringBootTest
@Transactional
class RevalidateEventListenerTest {
    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var taskRepository: TaskRepository

    @Test
    fun `게시글 저장 시 홈 revalidate task가 큐에 적재된다`() {
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()
        val testId = UUID.randomUUID().toString().take(8)
        val author =
            memberApplicationService.join(
                username = "revalidate-author-$testId",
                password = "Abcd1234!",
                nickname = "리밸리데이트작성자-$testId",
                profileImgUrl = null,
                email = "revalidate-author-$testId@example.com",
            )

        val post =
            postApplicationService.write(
                author = author,
                title = "revalidate-post-$testId",
                content = "content",
                published = true,
                listed = true,
            )

        TestTransaction.flagForCommit()
        TestTransaction.end()

        val revalidateTasks =
            taskRepository.findAll().filter {
                it.id !in previousTaskIds &&
                    it.taskType == "global.revalidate.home" &&
                    it.aggregateId == post.id
            }

        assertThat(revalidateTasks).hasSize(1)
        assertThat(revalidateTasks.single().aggregateId).isEqualTo(post.id)
        assertThat(revalidateTasks.single().status).isEqualTo(TaskStatus.COMPLETED)
    }
}
