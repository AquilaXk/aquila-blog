package com.back.global.revalidate

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.revalidate.adapter.event.RevalidateEventListener
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.domain.TaskStatus
import com.back.support.SeededSpringBootTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.util.UUID

@ActiveProfiles("test")
@SpringBootTest
@org.junit.jupiter.api.DisplayName("RevalidateEventListener 테스트")
class RevalidateEventListenerTest : SeededSpringBootTestSupport() {
    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var taskRepository: TaskRepository

    @Autowired
    private lateinit var revalidateEventListener: RevalidateEventListener

    @Test
    fun `게시글 저장 시 홈과 상세와 사이트맵 revalidate task가 큐에 적재된다`() {
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

        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()
        revalidateEventListener.handle(
            PostWrittenEvent(
                uid = UUID.randomUUID(),
                postDto = PostDto(post),
                actorDto = MemberDto(author),
            ),
        )

        var revalidateTasks = emptyList<com.back.global.task.domain.Task>()
        repeat(30) {
            val newTasks = taskRepository.findAll().filter { task -> task.id !in previousTaskIds }
            revalidateTasks =
                newTasks.filter {
                    it.taskType == "global.revalidate.home" &&
                        it.aggregateId == post.id
                }
            if (revalidateTasks.size == 3) return@repeat
            Thread.sleep(100)
        }
        assertThat(revalidateTasks).hasSize(3)
        val payloads = revalidateTasks.map { it.payload }
        assertThat(payloads.any { it.contains("\"path\":\"/\"") }).isTrue()
        assertThat(payloads.any { it.contains("\"path\":\"/posts/${post.id}\"") }).isTrue()
        assertThat(payloads.any { it.contains("\"path\":\"/sitemap.xml\"") }).isTrue()
        assertThat(revalidateTasks.map { it.aggregateId }).containsOnly(post.id)
        assertThat(revalidateTasks.map { it.status }).allMatch { status ->
            status in listOf(TaskStatus.PENDING, TaskStatus.PROCESSING, TaskStatus.COMPLETED)
        }
    }
}
