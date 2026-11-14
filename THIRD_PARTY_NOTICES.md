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
  - Auto-save non-promoting temp draft management in `com.back.boundedContexts.post.adapter.web.ApiV1PostDraftController`
  - Storage network I/O outside database transaction boundary in `com.back.boundedContexts.member.adapter.web.ApiV1AdmMemberController`

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

## 4. RFC 4291 / Bitap Algorithm Reference

- **Standard**: RFC 4291 (IP Version 6 Addressing Architecture) & Bitap (Baeza-Yates–Gonnet shift-or algorithm)
- **Usage**:
  - Pure byte/hextet IP address literal parsing without DNS resolution in `com.back.global.web.application.IpAddressNormalizer`
  - Bitmask token scan acceleration in `com.back.global.util.TokenBitmaskMatcher`
