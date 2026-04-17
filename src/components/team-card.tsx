'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Team } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Tag, ArrowRight, Shield, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { checkTeamDeletableAction, deleteTeamAdminAction } from '@/lib/actions/team-admin-actions';

interface TeamCardProps {
  team: Team;
  onDeleted?: () => void;
  canDelete?: boolean | null;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, onDeleted, canDelete: canDeleteProp }) => {
  const { effectivePermissions, userProfile, activeOrganizationId } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [canDelete, setCanDelete] = React.useState<boolean | null>(canDeleteProp ?? null);

  const isOrgAdmin = userProfile?.roles?.includes('Organization Admin') ?? false;
  const canDeletePermission = effectivePermissions[PERMISSIONS.TEAMS_DELETE_ANY] ||
    (isOrgAdmin && team.organizationId === activeOrganizationId);

  React.useEffect(() => {
    if (canDeleteProp !== undefined) { setCanDelete(canDeleteProp); return; }
    if (!canDeletePermission) { setCanDelete(false); return; }
    checkTeamDeletableAction(team.id, team.playerIds || [])
      .then(r => setCanDelete(r.canDelete))
      .catch(() => setCanDelete(false));
  }, [team.id, team.playerIds, canDeletePermission, canDeleteProp]);

  const handleDelete = async () => {
    if (!canDeletePermission) return;
    setIsDeleting(true);
    try {
      const result = await deleteTeamAdminAction(team.id, team.playerIds || []);
      if (result.success) {
        toast({ title: 'Team Deleted', description: `"${team.name}" has been permanently deleted.` });
        if (onDeleted) onDeleted();
        else router.refresh();
      } else {
        toast({ title: 'Deletion Failed', description: result.error, variant: 'destructive', duration: 9000 });
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
          <Users className="h-5 w-5" />
          {team.name}
        </CardTitle>
        <div className="space-y-1 pt-1">
          <CardDescription className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> {team.clubName}
          </CardDescription>
          <CardDescription className="flex items-center gap-2">
            <Tag className="h-4 w-4" /> {team.ageCategory}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-2">
        <p className="text-sm text-muted-foreground">Manage team roster and view series participation.</p>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-1.5 p-3 pt-2">
        <Button asChild variant="outline" size="sm" className="w-full flex-1 border-primary text-primary hover:bg-primary/10 text-sm">
          <Link href={`/teams/${team.id}/details`} className="flex items-center justify-center gap-1.5">
            View Details <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {canDeletePermission && (
          canDelete === true ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full flex-1 text-sm" disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Team</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to permanently delete "{team.name}"? This cannot be undone.
                    The team has no players or associated games so it is safe to delete.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirm Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span className="relative group cursor-not-allowed w-full flex-1">
              <Button variant="destructive" size="sm" className="w-full text-sm pointer-events-none opacity-50" disabled>
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete
              </Button>
              {canDelete === false && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-50">
                  Has players or games — cannot delete
                </span>
              )}
              {canDelete === null && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-50">
                  Checking...
                </span>
              )}
            </span>
          )
        )}
      </CardFooter>
    </Card>
  );
};

export default TeamCard;
