
import { TeamCompositionClientWrapper } from '@/components/team-composition-client-wrapper';

export default async function TeamCompositionPage() {
  // Data fetching is now handled client-side in the wrapper
  // to ensure user-specific permissions are applied.
  return (
    <TeamCompositionClientWrapper />
  );
}
