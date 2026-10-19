import { UniLanding, uniMetadata } from "@/components/uni-landing";

export const generateMetadata = () => uniMetadata("LSE");

export default function Page() {
  return <UniLanding id="LSE" />;
}
