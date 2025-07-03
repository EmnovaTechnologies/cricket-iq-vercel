
'use client';

import Link from 'next/link';
import type { Series } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, CalendarFold, Tag, ArrowRight, Archive, ArchiveRestore, Info, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';

interface SeriesCardProps {
  series: Series;
  onArchiveToggle: (seriesId: string, currentStatus: Series['status']) => Promise<void>;
  canArchive: boolean;
  canUnarchive: boolean;
  isPermissionsLoading: boolean;
}

const SeriesCard: React.FC<SeriesCardProps> = ({ series, onArchiveToggle, canArchive, canUnarchive, isPermissionsLoading }) => {
  const handleConfirmArchiveToggle = async () => {
    await onArchiveToggle(series.id, series.status);
  };

  const isArchived = series.status === 'archived';
  const showArchiveButton = !isPermissionsLoading && ((isArchived && canUnarchive) || (!isArchived && canArchive));

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="p-3 space-y-1">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl font-headline text-primary flex items-center gap-1.5">
            <Layers className="h-5 w-5" />
            {series.name}
          </CardTitle>
          <Badge variant={isArchived ? 'outline' : 'default'} className="capitalize text-sm px-2 py-0.5">
            {series.status}
          </Badge>
        </div>
        <CardDescription className="text-sm flex items-center gap-1.5 pt-0.5">
          <Tag className="h-4 w-4" /> {series.ageCategory}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-1.5 p-3 pt-1">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarFold className="h-4 w-4" /> Year: {series.year}
        </p>
        {isArchived && (
            <p className="flex items-center gap-1 text-sm text-destructive/80">
                <Info className="h-4 w-4" /> This series is archived.
            </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-1.5 p-3 pt-2">
        <Button asChild variant="outline" size="sm" className="w-full flex-1 border-primary text-primary hover:bg-primary/10 text-sm">
          <Link href={`/series/${series.id}/details`} prefetch={false}>
            <span className="flex items-center justify-center gap-1.5">
              View Details <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </Button>
        
        {isPermissionsLoading ? (
          <Button disabled size="sm" className="w-full flex-1 text-sm">
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Loading Perms...
          </Button>
        ) : showArchiveButton ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={isArchived ? "default" : "outline"}
                size="sm"
                className={cn(
                  "w-full flex-1 text-sm", 
                  isArchived ? 'bg-primary hover:bg-primary/90' : 'border-destructive text-destructive hover:bg-destructive/10'
                )}
              >
                {isArchived ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}
                {isArchived ? 'Unarchive' : 'Archive'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to {isArchived ? "unarchive" : "archive"} this series?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isArchived
                    ? `Unarchiving "${series.name}" will make it active again. Associated games will also be reactivated.`
                    : `Archiving "${series.name}" will also archive all its associated games. This will hide its games from lists and prevent new games, teams, or venues from being added to it.`}
                    Existing data will be preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmArchiveToggle} className={cn(isArchived ? "" : "bg-destructive hover:bg-destructive/90")}>
                  Confirm {isArchived ? "Unarchive" : "Archive"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardFooter>
    </Card>
  );
};

export default SeriesCard;
