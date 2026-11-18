# Academy Program Management — implementation and release plan

## Implemented in this increment
- Removed redundant blue utility bar from the public Academy landing page.
- Compact premium mobile layouts shared by admin, instructor and student sign-in.
- Program and program-course schema (migration 011). **Program CRUD and student program enrollment are not yet implemented.**
- Staff-authored course study materials: study guides, Scripture reading plans, worksheets, reflections and external HTTPS references; draft and publish workflow.
- Enrolled students can browse published resources and download text resources as .txt attachments. External references open in a new tab.
- Resource endpoints gated by `PAI_ACADEMY_RESOURCES_ENABLED=true` (default off) and existing account/role authorization. Enrollments required for student downloads.

## Launch requirements
1. Back up production; apply `migrations/011_academy_program_resources.sql` in staging, verify on MariaDB, then production.
2. Verify staff course creation, draft materials, publication, student enrollments and downloads with actual roles.
3. Set `PAI_ACADEMY_RESOURCES_ENABLED=true` only after QA. Do not enable without migration.
4. Validate mobile login on iPhone/Android, 320–430px, browser zoom, keyboard and screen reader; verify desktop viewport fit.
5. Confirm content copyright and licensing before posting Bible translations, commentaries, audio or other third-party materials.

## Remaining to reach a comprehensive international-standard LMS
- Full program CRUD, prerequisites, cohorts, timetables, academic calendars, credit/hours and multi-course program completion.
- Managed PDF/DOCX/audio/video upload and downloads (virus scanning, object storage, file size limits, content authorization and signed links). Current download supports authored text only, not arbitrary binary files.
- Instructor-managed lesson media, interactive quizzes, flashcards, reading plans, bookmarks, notes, discussion forums, moderation, and accessible media captions/transcripts.
- Student application review and existing-account linking, email notification retry, account recovery and audit trail.
- Academic progress reporting, grading rubric, certificates with verifiable records, accessibility testing to WCAG 2.2 AA, backups, privacy and security reviews.
- Quality assurance, load tests and formal deployment verification. No certification or compliance claim is made.
