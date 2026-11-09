# TODO

- `back/src/main/kotlin/com/back/boundedContexts/post/app/PostAttachmentRetentionService.kt`: 폐기된 일반 첨부파일(`POST_FILE`) 정리 분기 및 레거시 계약 잔재 정리 또는 일반 첨부파일 업로드 정책 확정
- `back`: 게시글 이미지(`UploadedFile`, `/post/api/v1/images/**`)와 개인 클라우드(`CloudFile`, `/system/api/v1/adm/cloud/files/**`) 자산을 에디터에서 바로 참조·삽입하는 연동 경로 검토
- `deploy/homeserver/monitoring`: 운영 대시보드 로그 패널의 소스 메타데이터 노출 정합성 점검
