"use client";

import dynamic from "next/dynamic";
import { SkeletonRegion, SkeletonText } from "@/components/ui";

/* The lesson player's heavier tab bodies, loaded when their tab is first
   opened (feature 29). The Ask, Quiz and Podcast tabs render Markdown and
   maths in the browser (marked, KaTeX, DOMPurify: roughly 95 KB gzipped),
   and most visits never open them. Radix mounts only the open tab, so
   their code downloads on the first click. next/dynamic splits code only
   when it's called from a client component, hence this file. */

function TabLoading() {
  return (
    <SkeletonRegion className="py-2">
      <SkeletonText lines={4} className="max-w-[640px]" />
    </SkeletonRegion>
  );
}

export const LazyAssistantChat = dynamic(() => import("@/components/assistant/assistant-chat").then((m) => m.AssistantChat), {
  loading: TabLoading,
});

export const LazyQuizTab = dynamic(() => import("@/components/study/quiz-tab").then((m) => m.QuizTab), {
  loading: TabLoading,
});

export const LazyPodcastTab = dynamic(() => import("@/components/study/podcast-tab").then((m) => m.PodcastTab), {
  loading: TabLoading,
});
