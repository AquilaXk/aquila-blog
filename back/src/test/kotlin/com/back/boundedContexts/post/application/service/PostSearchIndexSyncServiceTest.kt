package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`

class PostSearchIndexSyncServiceTest {
    private val postTagIndexRepository = mock(PostTagIndexRepositoryPort::class.java)
    private val postTagIndexService = PostTagIndexService(postTagIndexRepository)
    private val service = PostSearchIndexSyncService(postTagIndexRepository, postTagIndexService)

    @Test
    fun `missing post task는 cascade 완료 상태를 empty index로 idempotent하게 수렴한다`() {
        `when`(postTagIndexRepository.findPostSourceForUpdate(41L)).thenReturn(null)

        service.sync(41L)

        verify(postTagIndexRepository).replacePostTags(41L, emptyList())
    }

    @Test
    fun `deleted post task는 empty canonical index를 저장한다`() {
        `when`(postTagIndexRepository.findPostSourceForUpdate(42L))
            .thenReturn(PostTagIndexRepositoryPort.LockedPostSource("tags: retained", deleted = true))

        service.sync(42L)

        verify(postTagIndexRepository).replacePostTags(42L, emptyList())
    }

    @Test
    fun `out of order task도 current post state를 다시 읽어 canonical index로 수렴한다`() {
        `when`(postTagIndexRepository.findPostSourceForUpdate(43L))
            .thenReturn(PostTagIndexRepositoryPort.LockedPostSource("tags: current, state\n\n본문", deleted = false))

        service.sync(43L)
        service.sync(43L)

        verify(postTagIndexRepository, times(2)).replacePostTags(43L, listOf("current", "state"))
    }
}
