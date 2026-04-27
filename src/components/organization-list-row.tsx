'use client';

/**
 * FILE: src/components/organization-list-row.tsx
 * List-view row for an Organization — mirrors OrganizationCard.
 */

import Link from 'next/link';
import type { Organization } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building, Palette, Users, ArrowRight, CheckCircle, XCircle, ShieldPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrganizationListRowProps {
  organization: Organization;
  isLast?: boolean;
}

const OrganizationListRow: React.FC<OrganizationListRowProps> = ({ organization, isLast }) => {
  return (
    <div className={cn('flex items-center gap-4 px-4 py-3', !isLast && 'border-b border-border')}>
      {/* Name + details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Building className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-sm font-medium text-primary truncate">{organization.name}</p>
          <Badge variant={organization.status === 'active' ? 'default' : 'secondary'} className="capitalize text-xs px-1.5 py-0.5 shrink-0">
            {organization.status === 'active'
              ? <><CheckCircle className="h-3 w-3 mr-1 text-green-500" />{organization.status}</>
              : <><XCircle className="h-3 w-3 mr-1 text-red-500" />{organization.status}</>}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {organization.branding?.themeName && (
            <span className="flex items-center gap-1">
              <Palette className="h-3 w-3" /> {organization.branding.themeName}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {organization.organizationAdminUids.length} admins
          </span>
          <span className="flex items-center gap-1">
            <ShieldPlus className="h-3 w-3" /> {organization.clubs?.length || 0} clubs
          </span>
        </div>
      </div>

      {/* Action */}
      <div className="shrink-0">
        <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs border-primary text-primary hover:bg-primary/10">
          <Link href={`/admin/organizations/${organization.id}/details`} className="flex items-center gap-1">
            View <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default OrganizationListRow;
