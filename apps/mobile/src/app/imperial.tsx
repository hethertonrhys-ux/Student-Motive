import { UniLanding, uniMetadata } from "@/components/uni-landing";

export const generateMetadata = () => uniMetadata("Imperial");

export default function Page() {
  return <UniLanding id="Imperial" />;
}
