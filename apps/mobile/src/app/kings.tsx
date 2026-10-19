import { UniLanding, uniMetadata } from "@/components/uni-landing";

export const generateMetadata = () => uniMetadata("KCL");

export default function Page() {
  return <UniLanding id="KCL" />;
}
