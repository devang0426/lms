# Feature 27: Course-building flow (instructor)

**Status:** Done (2026-09-30). Details are in `../progress-tracker.md` under Completed.
**Depends on:** 26
**Demo step:** 2, 3
**Source:** `report.md` (production-readiness audit, 2026-09-29): V1, V4,
V5, V6, N1, N2, N7, N8.

## Goal

A teacher who has never seen Studyhall can upload a lecture, review it and
publish it without help.

## The problem

On 28 Sep, the demo teacher created a course, added a module, deleted it
a minute later, and gave up. The audit log shows no lesson was ever
created and no upload was started.

Today the path to the upload box is seven steps, and none of them is
signposted:

1. Courses.
2. The course.
3. Type a title into "Add lesson" at the bottom of a module.
4. Keep the type "Video".
5. Click a small grey "Upload video" link (`components/course-builder/curriculum-editor.tsx:159`).
6. The lesson editor opens.
7. "Choose a video".

## Scope

**In:**
- An "Upload lecture" button on each module.
- Opening a new lesson straight after it's created.
- One Publish behaviour, and no publishing a video lesson that has no video.
- The Quiz lesson type, and changing a lesson's type.
- A "Get your course live" checklist.
- A clearer review screen.
- A consistent MP4 check.
- Seed data that follows the new rules.

**Out:**
- Navigation between areas (feature 28).
- Graded quizzes on reading lessons (later).

## Tasks

1. **"Upload lecture" on each module header.** A primary button opens a dialog.
   - The dialog has a title field (filled in from the file name) and a file picker.
   - It creates the video lesson and runs the upload inside the dialog, reusing `VideoUploader`.
   - When the upload finishes, it opens the lesson editor, where processing progress shows.
   - The upload has to stay in the dialog: navigating away during an upload would stop it.
2. **Open new lessons straight away.** `addLesson` (`app/(instructor)/instructor/courses/actions.ts:235-259`) returns the new id, and the builder opens that lesson's editor.
3. **Easier to find:**
   - The row's "Upload video" becomes a secondary button, not a faint link.
   - It shows for any video lesson with no ready video, whatever its status (not only drafts).
   - The lesson type select gets a visible label.
   - Choosing Video shows "MP4 (H.264 video, AAC audio), up to 2 GB and 60 minutes".
4. **Publishing** (V4, N2):
   - `setLessonPublished` (`actions.ts:276`) refuses a video lesson with no ready video: "Upload and process the video first." Today the seed publishes three such lessons.
   - The curriculum row's **Publish** does what the review screen's `publishLesson` does (`review/actions.ts:228`, `publishLessonStatements` in `lib/db/lesson-content.ts:315`): the lesson **and** its drafted notes, flashcards and quiz go live.
   - A confirm step lists what goes live. Today the row button publishes the lesson alone and leaves its content as drafts.
   - The draft banner on the course page gets a "Publish the course and all its modules" shortcut.
5. **Lesson types** (V5):
   - Remove **Quiz** from the add-lesson types. Today a Quiz lesson's editor has only a documents card, and students see "Its content arrives with a later update".
   - Graded quizzes stay in lessons' Quiz tab.
   - Existing quiz lessons keep working, shown the way they are today.
   - Add **Change type** to the lesson row's menu. It works only while the lesson is empty: no video, documents, assignment or drafts.
   - On non-video lessons, change the Documents card text "upload the video or its audio instead" (`components/documents/document-manager.tsx:213`) to "For a lecture video, create a Video lesson."
6. **Review screen** (N7):
   - Make "Review and publish" the primary button in the AI drafts card.
   - Add a breadcrumb: Course › Module › Lesson › Review.
   - Remove the stale line "Students study them in a later update" (`review/page.tsx:221`).
7. **Checklist** (N8): show "Get your course live" on `/instructor` and on the course page until everything is done. The steps are:
   1. course details;
   2. a module;
   3. a video lesson with a ready video;
   4. review;
   5. publish the lesson, module and course;
   6. students enrolled.

   Each step is worked out from the data. Dismissing the list is remembered in `localStorage`. Move the "Start your first course" empty state on Overview to the top of the page (`app/(instructor)/instructor/page.tsx:201-213`).
8. **MP4 check** (V6): `prepareVideoUpload` accepts a file whose name ends in `.mp4` even when the browser reports an empty or unusual type. ffprobe checks the real codecs afterwards anyway. Today the browser accepts the file and the server refuses it (`components/video/video-uploader.tsx:16-21`).
9. **Seed** (`scripts/seed.ts:108, 117, 118`): video lessons with no video stay drafts, or use the demo lecture. Check `e2e/demo.spec.ts` still passes.

## Decisions needed

Both were taken as recommended on 2026-09-30, when the owner asked for the feature as specified.

1. **Row Publish.** Recommended: it publishes the lesson with its drafted content, after a confirm step. The alternative is to send the teacher to the review screen. **Decided: as recommended.**
2. **Quiz lesson type.** Recommended: remove it now. Building a full "quiz lesson" can come later if it's wanted. **Decided: removed from the add-lesson and Change type lists.** Existing quiz lessons keep working.

## Acceptance criteria

- [x] In an empty course with a module, a lecture is uploading within 4 clicks from the course page. Count them in a Playwright test. (3 clicks, `e2e/builder.spec.ts`.)
- [x] Adding any lesson opens its editor.
- [x] Publishing a video lesson without a ready video is refused with the message. (Over HTTP and in the builder's confirm step.)
- [x] The seed has no published video lesson without a video, and the demo suite passes. (Steps 2 and 8 need `E2E_UPLOAD`, as before.)
- [x] The row Publish and the review screen's Publish leave the same rows published. Checked in the database.
- [x] Quiz isn't offered. Change type works on an empty lesson and is refused on one with content.
- [x] The checklist matches the real state and disappears when everything is done. (Checked against the dev database: MATH 201 complete and hidden, an empty course at 0 of 6.)
- [x] A `.mp4` with an empty browser type uploads. (It passes both checks and the upload starts; with `E2E_UPLOAD=1` the test sends the real clip.)
- [x] `npm run build`, lint and tests pass.
