/* Studyhall design-system primitives (feature 04). Specs: context/ui-context.md.
   Client-only pieces (tabs, chip-group, overlay) carry their own "use client". */

export { Badge, Chip, type BadgeTone } from "./badge";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./button";
export { Card, CardHeader } from "./card";
export { ChipGroup } from "./chip-group";
export { CatalogCard, CompactCourseCard, CourseCard, coverClass, type CoverTint } from "./course-card";
export {
  Accordion,
  AccordionRow,
  DataTable,
  DateTile,
  EmptyState,
  ListRow,
  StatCard,
  type Column,
} from "./data-display";
export { Icon } from "./icon";
export { Avatar, Eyebrow, Logo, Person } from "./identity";
export { Field, Input, Label, SearchField, Select, Textarea } from "./input";
export { NavItem, TabBar } from "./nav";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Toaster,
  toast,
} from "./overlay";
export { ProgressBar, ProgressRing, StepIndicator, type StepState } from "./progress";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
