# Studyhall

## Overview

Studyhall is a production-grade LMS for **one university, on one
deployment**. Instructors run courses, upload lecture videos and material,
set coursework and grade it. Students watch lectures, study and hand in
work.

It keeps all of NitroAI's study features (the code in `lib/`) and builds on
them. Any source (PDF, Word, web page, YouTube, audio **or an uploaded
lecture video**) becomes:

- notes
- spaced-repetition flashcards
- quizzes
- a grounded study chat
- a two-voice podcast

The feature that sets it apart is **video-aware Q&A**. A student asks about
a topic. The AI explains it from the course material and links to the exact
moment in the instructor's lecture where it was taught. Clicking the link
opens the player at that timestamp.

The university pays for AI. Students can also upload their own material for
private study.

## Goals

1. **Solid demo first.** The demo script below runs end to end on real
   hosted infrastructure with seeded data, and nothing in it is faked.
2. A student can ask about a topic and land on the right moment of the right
   lecture in one click. The timestamp is within about 15 seconds of where
   the topic starts.
3. An instructor uploads a lecture video and it is playable, with a
   transcript, chapters, notes, flashcards and a quiz drafted, within about
   the video's own length.
4. Every AI answer is grounded in course material or the student's own
   uploads, and cites it: lesson plus timestamp, or document plus section.
5. **Low running cost.** Every service runs on its free tier where one
   exists. AI is pay-as-you-go on cheap models, and spend is logged per
   feature.
6. The assistant **refuses questions outside the course syllabus.**

## Users and Roles

| Role       | What they do |
| ---------- | ------------ |
| Admin      | University IT or registry staff. Manages terms, users, courses, enrollments and the audit log. |
| Instructor | Owns courses. Uploads videos and material, reviews and publishes AI drafts, sets assignments and quizzes, grades, posts announcements, answers discussions. |
| TA         | (v1.1) Instructor rights on one course's sections, except publishing and final grades. |
| Student    | Watches lectures, studies with the AI tools, asks the course assistant, hands in work, sees grades, uploads private material. |

## Demo Script (the definition of "done" for the demo)

1. **Sign in as the Demo Admin** (one click; Prof. Meera Rao, who is also
   the instructor of the demo course). The Instructor dashboard
   shows courses, learners, the grading queue and unanswered questions.
2. **Upload a 15–25 minute lecture video** (our own recording, MP4) to a
   course module. A live
   progress panel walks through the stages:
   1. Uploading
   2. Processing video
   3. Transcribing
   4. Chapters
   5. Notes
   6. Flashcards
   7. Quiz
   8. Indexing
3. **Review the draft.**
   - Chapters come out as a timestamped outline.
   - The generated notes have section headings that link to timestamps.
   - The instructor edits one flashcard, then publishes.
4. **Switch to the Demo Student** (one click; Aanya Sharma, enrolled). Student home shows "Continue
   learning", "Coming up" and the course cards.
5. **Open the lesson** in the Lesson player. The video comes with chapters, a
   transcript that follows the video and can be clicked to jump, and
   timestamped personal notes.
6. **Ask the course assistant** "Explain eigenvalues", or any topic from the
   lecture. The answer:
   - explains the topic
   - cites "Lecture 3 · 12:48"
   - clicking the citation seeks the player to 12:48

   Then ask something off-syllabus, e.g. "What's the capital of France?".
   The assistant refuses politely and offers "Ask your instructor".
7. **Study.**
   - Flip flashcards and rate them.
   - Take the quiz and see mastery per topic.
   - Generate and play the two-voice podcast for the lecture (on demand).
8. **Student upload.**
   - The student drops in their own PDF.
   - They get private notes and flashcards.
   - They can ask questions across their own upload and the course.
9. **Back as the instructor**, grade a submitted assignment. The student sees
   the grade and feedback.

## Demo Accounts

| Account | Role | Shows |
| ------- | ---- | ----- |
| Demo Admin: Prof. Meera Rao (`demo.admin+clerk_test@example.com`) | admin, plus instructor of the demo course | Demo steps 1–3 and 9, and the admin screens |
| Demo Student: Aanya Sharma (`demo.student+clerk_test@example.com`) | student, enrolled | Demo steps 4–8 |

The setup is in `features/feature-03-demo-accounts-and-seed.md`.

## Core User Flow

**Instructor**

1. Signs in with Clerk (demo: one-click seeded accounts; university SSO
   later).
2. Creates or opens a course (term, sections, modules).
3. Adds a lesson by uploading a video or a source (PDF, DOCX, URL, YouTube,
   audio).
4. A background job processes it (see `architecture.md`, Video pipeline).
5. Reviews the drafts (chapters, notes, flashcards, quiz), edits them and
   publishes.
6. Sets assignments and graded quizzes, grades from the queue, and answers
   discussions.

**Student**

1. Signs in and lands on Student home.
2. Watches lectures in the Lesson player and takes notes pinned to
   timestamps.
3. Asks the course assistant. Gets explanations with jump-to-video
   citations.
4. Studies with flashcards (a "due today" queue across courses), quizzes and
   the podcast.
5. Hands in assignments and sees grades and feedback.
6. Uploads their own material to a private space for NitroAI-style notes,
   cards, quiz, chat and podcast.

## Features

### From NitroAI (keep, then port to the server; see `architecture.md`)

- Ingest: PDF, DOCX, text, web page, YouTube, audio.
- Whisper transcription with timestamped segments. The engine already
  returns these; the pipeline drops them today.
- Multi-provider AI engine with fallback chains and retries.
- Notes for long sources: write per section, then merge. Also titles.
- Flashcards with FSRS spaced repetition.
- Quizzes: MCQ, true/false and fill-in-the-blank; basic, intermediate and
  exam; mastery per topic.
- Grounded study chat.
- Podcast: two-voice script, then TTS.
- Markdown and KaTeX rendering. Export to Markdown, Word and print.

### Video learning (new)

- Instructors upload lecture videos as **MP4 (H.264/AAC)**, straight from
  the browser to storage. Other formats are rejected with a clear message.
  There is no transcoding, to keep costs down.
- Plain MP4 playback in a native player, with a poster image. Seeking works
  through HTTP range requests. There is no adaptive bitrate.
- Transcript with timestamps. It highlights the current line, and clicking a
  line seeks the video. It doubles as captions.
- AI chapters: a topic outline with start times, shown on the scrub bar and
  in the sidebar.
- Lesson notes built from the transcript, where each section keeps its
  source timestamp.
- Timestamped personal notes. The note is saved with the current time, and
  clicking it seeks there.
- Watch progress is saved (resume where you left off). A lesson counts as
  complete at 90% watched or when the student marks it complete.
- Deep links: `/courses/[courseId]/lessons/[lessonId]?t=768` opens the
  lesson at 12:48.

### Course assistant: explain and jump to the moment (new)

- A student asks in a lesson (scoped to the lesson) or course-wide (scoped
  to the course).
- The AI explains using the retrieved transcript and document chunks only.
- It cites every claim as a chip, e.g. "Lecture 3 · 12:48" or "Week 2
  slides · p. 7".
- A video chip seeks the player, or opens the lesson at `?t=`.
- **It refuses off-syllabus questions.** The syllabus is the course's
  published lessons and documents. If nothing relevant is found, it replies
  "That topic isn't part of *[Course]*" and offers "Ask your instructor",
  which opens a discussion post. It never answers from general knowledge.
- "Where was this taught?" mode returns the top three moments across all of
  a course's lectures.

### LMS core (new)

- Terms/semesters, courses, sections, enrollments. Courses are split into
  modules, and modules into lessons (video, reading, assignment). Since
  feature 27, teachers can't add Quiz lessons, which only ever held
  documents. Graded quizzes live in each lesson's Quiz tab, and existing
  quiz lessons keep working.
- A course can be deleted by its staff only while nobody depends on it:
  no enrolled student, no handed-in work, no pending invitation
  (feature 35). Any other course is unpublished instead, so its records
  stay.
- Course catalog and course detail with the curriculum and outcomes.
  Enrollment is set by admin or roster. There is no open self-enroll in v1.
- Assignments: file or text submissions, due dates, late flags, rubric and
  feedback, a grading queue.
- Graded quizzes (instructor-approved question banks) alongside practice
  quizzes.
- Gradebook with weighted categories, and a CSV export.
- Calendar, announcements, course discussions (Q&A) and notifications
  (in-app only for the demo).
- Analytics:
  - Active learners and average completion.
  - Where students re-watch or drop off in a video.
  - Topics students ask the assistant about most.
- Learners and progress (feature 31):
  - Teachers see each course's students: lessons completed, quiz
    scores, and work handed in, graded and missing. They can export it
    as CSV and open a report per student.
  - Students see their own progress per course, with a "Next up"
    suggestion.
  - Teachers never see a student's assistant questions or private space,
    and there are no rankings.

### Student private space (from NitroAI)

- A student uploads their own sources to get private notes, cards, quiz,
  chat and podcast.
- Instructors never see a student's private space.

### Platform

- Clerk auth. Email login and one-click demo accounts for the demo.
  University SSO (Google or Microsoft) is a Clerk setting, switched on
  later.
- CSV roster import. Roles and an audit log.
- AI usage logging per feature, plus a daily safety limit per person on
  AI calls and cost (feature 25). It keeps one account from running up the
  bill or using up the free models' shared quota; normal study never meets
  it.
- **Data export and deletion** (feature 33):
  - "Download my data" on the Profile page (students and admins) builds
    one JSON file in the background, covering everything Studyhall keeps
    about the person. The link works for 7 days, at most 3 a day.
  - Deleting an account comes from Clerk or from an admin's **Delete
    user**. It erases the person's private data and files and anonymises
    them as "Deleted user".
  - It keeps the academic records (submissions, grades, graded quiz
    attempts) and discussion posts.
- WCAG 2.2 AA. Responsive down to phone (Mobile home wireframe).
- **A public landing page** (feature 34) at `/welcome`, where a
  signed-out visitor on `/` lands instead of the sign-in form:
  - the institute's name and tagline, **Sign in**, and **Try the demo**
    while demo mode is on;
  - what students get;
  - the courses published this term (catalog fields only);
  - how to join (the institute enrolls you: there's no self-enrollment);
  - contact details, and simple privacy and terms pages.
  The institute's details come from environment variables. The page is
  static, with SEO basics (Open Graph, `robots.txt`, a sitemap of the
  public pages). There is no CMS, blog, pricing or enquiry form.

## Scope

### In Scope (v1)

- One university, one deployment.
- Roles: admin, instructor, student. TA is v1.1.
- Everything under Video learning, Course assistant, LMS core and Student
  private space.
- All NitroAI features, now server-side and multi-user.

### Out of Scope (v1)

- Multi-tenancy. There is one university per deployment, so no `schoolId`
  column is needed.
- Payments or paid enrollment. The "[Price / Free]" button becomes
  "Enroll", assigned by roster.
- Live classes (link to Zoom/Teams instead), proctoring, plagiarism
  detection.
- LTI, SCORM, xAPI, SIS sync. Plan for them, don't build them.
- Native apps, the Electron/Tauri wrapper, local Ollama, the publik API,
  bring-your-own keys.
- Dark mode.
- **AI credits, paid top-ups, or budgets per course.** The only ceiling is
  the daily safety limit per person (feature 25): calls and cost over the
  last 24 hours, set per role in the environment. It is not a credit or
  payment system.
- Video transcoding, adaptive streaming (HLS), and formats other than MP4.
- Email notifications.

## Success Criteria

1. The full demo script runs on the deployed app with seeded data, with no
   manual database edits.
2. For 10 test questions on a seeded lecture, at least 8 citations land
   within 15 seconds of where the topic is taught.
3. Closing the browser during a video upload's processing does not lose the
   job. Reopening shows live progress.
4. A student not enrolled in a course gets a 404 on its lessons, its video
   playback URLs and its assistant.
5. No AI, storage or auth secret appears in the client bundle or in network
   responses.
6. Of 5 off-syllabus test questions, all 5 are refused. Every AI call
   appears in `ai_usage`.
7. `npm run build` passes. The demo flow is covered by Playwright.
