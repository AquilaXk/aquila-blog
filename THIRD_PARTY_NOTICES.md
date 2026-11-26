# Third-Party Notices

This project incorporates components from the following open-source projects.

---

## 1. apache/answer

- **Project**: Apache Answer
- **License**: Apache License 2.0
- **Source**: https://github.com/apache/answer
- **Usage**:
  - Multi-needle substring matching algorithm and ASCII fold table patterns in `com.back.global.util.TokenBitmaskMatcher`
  - Admin bulk action workflow patterns in `com.back.boundedContexts.post.adapter.web.ApiV1AdmPostController`

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   Copyright (c) The Apache Software Foundation

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

---

## 2. TryGhost/Ghost

- **Project**: Ghost
- **License**: MIT License
- **Source**: https://github.com/TryGhost/Ghost
- **Usage**:
  - Adjacent posts keyset pagination and boundary navigation semantics in `com.back.boundedContexts.post.adapter.web.ApiV1PostPublicReadController`
  - Auto-save non-promoting temp draft management in `com.back.boundedContexts.post.adapter.web.ApiV1PostDraftController` and `com.back.boundedContexts.post.application.service.PostApplicationService`
  - Storage network I/O outside database transaction boundary in `com.back.boundedContexts.member.adapter.web.ApiV1AdmMemberController`
  - Admin single-pass facet counts and dashboard KPI aggregation semantics in `com.back.boundedContexts.post.adapter.persistence.PostDeletedQueryRepository`
  - Iterative batch backlog cleanup with safety bounds in `com.back.boundedContexts.member.subContexts.session.job.MemberSessionCleanupScheduledJob` and `com.back.boundedContexts.cloud.adapter.scheduler.CloudExternalPlaybackTokenCleanupScheduledJob`
  - Lightweight public sitemap projection (`id`, `createdAt`, `modifiedAt`) and post revision ledger (`post_revision`) snapshots & restore workflows in `com.back.boundedContexts.post`
  - Non-canonical surface host permanent `308` canonical redirect for blog paths in `deploy/homeserver/caddy/Caddyfile`

```
The MIT License (MIT)

Copyright (c) 2013-2026 Ghost Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. payloadcms/payload

- **Project**: Payload CMS
- **License**: MIT License
- **Source**: https://github.com/payloadcms/payload
- **Usage**:
  - Autosave drafts state preservation and optimistic lock validation patterns in `com.back.boundedContexts.post.application.service.PostApplicationService`
  - Admin bulk operations request validation and result envelope patterns
  - Single-pass content status facet counts and KPI snapshot metrics in `com.back.boundedContexts.post.adapter.persistence.PostDeletedQueryRepository`
  - Lightweight sitemap projection and post revision history retention/restore patterns in `com.back.boundedContexts.post`

```
The MIT License (MIT)

Copyright (c) 2020-2026 Payload CMS LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 4. commonmark/commonmark-java

- **Project**: commonmark-java
- **License**: BSD 2-Clause License
- **Source**: https://github.com/commonmark/commonmark-java
- **Usage**:
  - 128-entry static ASCII character bitmask classification table for zero-allocation line ending and whitespace scanning in `com.back.boundedContexts.post.dto.PostPreviewExtractor` and `com.back.boundedContexts.post.dto.PostHeaderMetadataMatcher`

```
BSD 2-Clause License

Copyright (c) 2015-2026, Atlassian Pty Ltd
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## 5. RFC 4291 / Bitap Algorithm Reference

- **Standard**: RFC 4291 (IP Version 6 Addressing Architecture) & Bitap (Baeza-Yates–Gonnet shift-or algorithm)
- **Usage**:
  - Pure byte/hextet IP address literal parsing without DNS resolution in `com.back.global.web.application.IpAddressNormalizer`
  - Bitmask token scan acceleration in `com.back.global.util.TokenBitmaskMatcher`

---

## 6. strapi/strapi

- **Project**: Strapi
- **License**: MIT License
- **Source**: https://github.com/strapi/strapi
- **Usage**:
  - Cloud storage file facets single-pass aggregation, bulk delete synchronization with storage cleanup, and workspace asset promotion in `com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController` and `com.back.boundedContexts.cloud.application.service.CloudFileService`

```
The MIT License (MIT)

Copyright (c) 2015-present Strapi Solutions SAS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 7. felixmosh/bull-board

- **Project**: Bull Board
- **License**: MIT License
- **Source**: https://github.com/felixmosh/bull-board
- **Usage**:
  - Task queue diagnostics single-pass aggregate query and DLQ inspect/selective replay patterns in `com.back.global.task.adapter.persistence.TaskRepository`, `com.back.global.task.application.TaskQueueDiagnosticsService`, and `com.back.global.system.adapter.web.ApiV1AdmSystemController`

```
MIT License

Copyright (c) 2019-present Felix Moshkovich

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 8. Sliding Window Rate Limiting Pattern

- **Standard / Pattern**: Redis Sorted Set microsecond sliding window rate limiting
- **Usage**:
  - Boundary burst prevention with atomic score cleanup and sliding window count validation in `com.back.boundedContexts.member.adapter.persistence.RedisAdminEmailChallengeStore`

---

## 9. kagkarlsson/db-scheduler

- **Component**: Persistent DB task queue EWMA execution duration tracking pattern
- **Source**: https://github.com/kagkarlsson/db-scheduler
- **License**: MIT License (Copyright (c) 2016-2024 Gustav Karlsson)
- **Usage**:
  - Sub-millisecond floor clamping and symmetric EWMA decay in `com.back.global.task.adapter.scheduler.TaskProcessingScheduledJob.updateRecentHandlerDuration`
  - Saturated task type exclusion (`task_type NOT IN (...)`) at the SQL `FOR UPDATE SKIP LOCKED` selection stage in `TaskProcessingScheduledJob` and `TaskRepository`

---

## 10. BorgBackup / Restic / RFC 2104 Domain-Separated Subkey Derivation Pattern

- **References**:
  - `borgbackup/borg` (BSD-3-Clause, https://github.com/borgbackup/borg)
  - `restic/restic` (BSD-2-Clause, https://github.com/restic/restic)
  - RFC 2104 HMAC-SHA256 domain separation (`aquila-backup:v2:enc`, `aquila-backup:v2:mac`)
- **Usage**:
  - Independent encryption and integrity subkey derivation with `backup_kdf_version=2` metadata and `v1` backward compatibility in `deploy/homeserver/create_external_backup.sh` and `deploy/homeserver/restore_external_backup_drill.sh`
  - Local deploy snapshot retention count limit in `deploy/homeserver/create_deploy_backup.sh`
  - Idempotent daily external backup and prune cron timer with `flock` exclusion in `deploy/homeserver/install_external_backup_timer.sh`

---

## 11. withastro/starlight

- **Project**: Starlight
- **License**: MIT License
- **Source**: https://github.com/withastro/starlight
- **Usage**:
  - Canonical `308` permanent redirect pattern for non-canonical surface paths in `deploy/homeserver/caddy/Caddyfile`

```
MIT License

Copyright (c) 2023 Astro contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 12. grafana/loki

- **Project**: Grafana Loki / Promtail
- **License**: Apache License 2.0
- **Source**: https://github.com/grafana/loki
- **Usage**:
  - `file_sd_configs` target array generation and direct container JSON log tailing patterns in `deploy/homeserver/monitoring/docker-runtime-probe.mjs` and `deploy/homeserver/monitoring/promtail/promtail-config.yml`

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

---

## 13. supabase/supabase

- **Project**: Supabase Studio (`CustomExpiryModal`)
- **License**: Apache License 2.0
- **Source**: https://github.com/supabase/supabase
- **Usage**:
  - Selectable expiration presets (`1h` / `6h` / `24h` / `7d`) and signed external share link issuance lifecycle in `com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenService` and `com.back.boundedContexts.cloud.adapter.web.ApiV1AdmCloudController`

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/
```

