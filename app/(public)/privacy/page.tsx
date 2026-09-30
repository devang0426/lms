import type { Metadata } from "next";
import { PolicyList, PolicyPage, PolicySection } from "@/components/landing/policy-page";
import { ContactLinks } from "@/components/landing/site-chrome";
import { institute } from "@/lib/institute";

/* Privacy (feature 34). Plain words about what the app actually keeps
   (architecture.md → Storage Model, Retention) and who can see it
   (Auth and Access Model). Keep it true when those change. Static. */

export function generateMetadata(): Metadata {
  const { name } = institute();
  return {
    title: `Privacy · ${name}`,
    description: `What Studyhall keeps about ${name}'s students and staff, who can see it and how long it stays.`,
    alternates: { canonical: "/privacy" },
  };
}

export default function PrivacyPage() {
  const inst = institute();
  return (
    <PolicyPage
      eyebrow="Privacy"
      title={
        <>
          What we keep, and <em>why.</em>
        </>
      }
      lead={`${inst.name} runs Studyhall for its students and staff. This page explains what it keeps about you, who can see it and how long it stays.`}
    >
      <PolicySection title="What's kept">
        <PolicyList
          items={[
            <>Your account: your name, email address and role. Signing in is handled by Clerk.</>,
            <>
              Your learning: what you&apos;ve watched and where you stopped, lessons you&apos;ve finished, notes you pin to a
              lecture, flashcard reviews and quiz attempts.
            </>,
            <>Your coursework: what you hand in, your grades and feedback, and what you post in course discussions.</>,
            <>Your questions to the course assistant, and its answers.</>,
            <>Your private space: files you upload, and the notes, cards, quizzes and chats made from them.</>,
            <>A count of AI use per person, for the daily limit, and a log of changes such as grades, enrollments and uploads.</>,
          ]}
        />
      </PolicySection>

      <PolicySection title="Who can see it">
        <PolicyList
          items={[
            <>Your instructors see what you hand in, your grades and your progress in the courses they teach.</>,
            <>Instructors don&apos;t see the questions you ask the assistant. They see which topics a class asks about most.</>,
            <>Your classmates see what you post in a course&apos;s discussions, with your name.</>,
            <>Admins manage accounts and enrollments, and read the log of changes.</>,
            <>Your private space is yours alone: not your instructors, not the admins.</>,
          ]}
        />
      </PolicySection>

      <PolicySection title="Services that handle it">
        <p>
          Studyhall runs on Clerk (sign-in), Neon (the database), Vercel (the website and stored files), Trigger.dev (preparing
          lectures and documents) and OpenRouter (AI models).
        </p>
        <p>
          Your questions, and the course material an answer draws on, are sent to an AI model through OpenRouter. Some model
          providers may keep what they&apos;re sent, so don&apos;t put personal details in a question.
        </p>
      </PolicySection>

      <PolicySection title="Cookies">
        <p>
          Studyhall uses cookies only to keep you signed in and to show times in your time zone. There are no advertising or
          tracking cookies.
        </p>
      </PolicySection>

      <PolicySection title="How long it stays">
        <p>
          Read notifications and records of finished background jobs are deleted after 90 days. Coursework, grades, the AI-use
          count and the log of changes are kept as part of {inst.name}&apos;s records.
        </p>
      </PolicySection>

      <PolicySection title="Your data">
        <p>
          Students can download a copy of their data themselves: sign in, open Profile and choose “Prepare my data”. The file is
          ready in a minute or two, and its link works for 7 days.
        </p>
        <p>To ask for a correction, for your account to be deleted, or for a copy another way, contact the office:</p>
        <ContactLinks institute={inst} />
      </PolicySection>
    </PolicyPage>
  );
}
