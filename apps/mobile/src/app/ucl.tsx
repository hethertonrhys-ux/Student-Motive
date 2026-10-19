import { UniLanding, uniMetadata } from "@/components/uni-landing";

export const generateMetadata = () => uniMetadata("UCL");

export default function Page() {
  return <UniLanding id="UCL" />;
}
