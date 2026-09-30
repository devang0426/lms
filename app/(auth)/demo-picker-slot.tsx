import { DemoAccountPicker } from "@/components/auth/demo-account-picker";
import { demoPickerProps } from "@/components/auth/demo-picker-props";

/* Server wrapper: renders the demo picker only when DEMO_MODE=true, so the
   demo credentials never reach the page otherwise. Behind a passcode
   (feature 24) the password isn't shown either: see demoPickerProps. */
export function DemoPickerSlot() {
  const props = demoPickerProps();
  return props ? <DemoAccountPicker {...props} /> : null;
}
