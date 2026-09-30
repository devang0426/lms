import type { Metadata } from "next";
import { PolicyList, PolicyPage, PolicySection } from "@/components/landing/policy-page";
import { ContactLinks } from "@/components/landing/site-chrome";
import { institute } from "@/lib/institute";

/* Terms (feature 34): the plain-language basics. The institute's own
   rules apply on top. The limits named here are the real ones
   (security-architecture.md → Rate limits and AI spend). Static. */

export function generateMetadata(): Metadata {
  const { name } = institute();
  return {
    title: `Terms · ${name}`,
    description: `The basics of using Studyhall at ${name}.`,
    alternates: { canonical: "/terms" },
  };
}

export default function TermsPage() {
  const inst = institute();
  return (
    <PolicyPage
      eyebrow="Terms"
      title={
        <>
          Terms of <em>use.</em>
        </>
      }
      lead={`The basics of using Studyhall at ${inst.name}. The institute's own rules and policies apply too.`}
    >
      <PolicySection title="Who it's for">
        <p>
          Studyhall is for {inst.name}&apos;s students and staff. The institute sets up your account and enrolls you in your
          courses.
        </p>
      </PolicySection>

      <PolicySection title="Your account">
        <p>Keep your sign-in to yourself. If you think someone else has used your account, tell the office.</p>
      </PolicySection>

      <PolicySection title="Your work and your posts">
        <PolicyList
          items={[
            <>Hand in your own work.</>,
            <>Discussions are read by the whole class, with your name. Keep them kind and on topic.</>,
            <>Upload only material you&apos;re allowed to use for study.</>,
          ]}
        />
      </PolicySection>

      <PolicySection title="The assistant and other AI tools">
        <p>
          The course assistant answers only from your course material and shows where each answer came from. It can still be
          wrong: check the moment it cites, and ask your instructor when in doubt. AI-made notes, cards, quizzes and podcasts can
          have mistakes too.
        </p>
      </PolicySection>

      <PolicySection title="Fair-use limits">
        <p>
          To keep things fair and affordable, there&apos;s a daily limit on AI use per person, a limit on questions every few
          minutes, and limits on uploads. Normal study doesn&apos;t reach them.
        </p>
      </PolicySection>

      <PolicySection title="Changes and questions">
        <p>{inst.name} may update these terms. Questions go to the office:</p>
        <ContactLinks institute={inst} />
      </PolicySection>
    </PolicyPage>
  );
}
