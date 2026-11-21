package com.back.global.util

import com.back.global.util.Utf8ChunkDigest.Digest128

/**
 * 16-stripe bounded LRU cache keyed by collision-safe 128-bit [Digest128] digests.
 *
 * Reference implementation note: 16-way lock striping (`digestHead and 15`) inspired by
 * Apache-2.0 concurrent cache designs (Guava Striped / Caffeine) to eliminate global cache lock
 * contention while preserving per-stripe bounded LRU eviction and zero 32-bit hash collisions.
 */
class StripedDigestLruCache<V : Any>(
    maxTotalEntries: Int,
) {
    private val maxPerStripe = (maxTotalEntries / STRIPE_COUNT).coerceAtLeast(1)
    private val locks = Array(STRIPE_COUNT) { Any() }
    private val stripes =
        Array(STRIPE_COUNT) {
            object : LinkedHashMap<Digest128, V>(maxPerStripe + 1, 0.75f, true) {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Digest128, V>?): Boolean = size > maxPerStripe
            }
        }

    fun get(key: Digest128): V? {
        val index = key.stripeIndex(STRIPE_MASK)
        synchronized(locks[index]) {
            return stripes[index][key]
        }
    }

    fun put(
        key: Digest128,
        value: V,
    ) {
        val index = key.stripeIndex(STRIPE_MASK)
        synchronized(locks[index]) {
            stripes[index][key] = value
        }
    }

    fun clear() {
        for (i in 0 until STRIPE_COUNT) {
            synchronized(locks[i]) {
                stripes[i].clear()
            }
        }
    }

    fun totalSize(): Int {
        var total = 0
        for (i in 0 until STRIPE_COUNT) {
            synchronized(locks[i]) {
                total += stripes[i].size
            }
        }
        return total
    }

    fun stripeCount(): Int = STRIPE_COUNT

    fun stripeSizes(): IntArray =
        IntArray(STRIPE_COUNT) { i ->
            synchronized(locks[i]) {
                stripes[i].size
            }
        }

    companion object {
        private const val STRIPE_COUNT = 16
        private const val STRIPE_MASK = STRIPE_COUNT - 1
    }
}
