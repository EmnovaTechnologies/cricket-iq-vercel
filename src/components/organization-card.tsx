
import Link from 'next/link';
import type { Organization } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building, Palette, Users, ArrowRight, CheckCircle, XCircle, ShieldPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface OrganizationCardProps {
  organization: Organization;
}

const OrganizationCard: React.FC<OrganizationCardProps> = ({ organization }) => {
  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
            <Building className="h-5 w-5" />
            {organization.name}
          </CardTitle>
          <Badge variant={organization.status === 'active' ? 'default' : 'secondary'} className="capitalize">
             {organization.status === 'active' ? <CheckCircle className="h-4 w-4 mr-1 text-green-500" /> : <XCircle className="h-4 w-4 mr-1 text-red-500" /> }
            {organization.status}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-2 text-sm">
          Manage settings, users, and branding for this organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-2">
        {organization.branding?.themeName && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Palette className="h-4 w-4" /> Theme: {organization.branding.themeName}
          </p>
        )}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" /> Admins: {organization.organizationAdminUids.length}
        </p>
         <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldPlus className="h-4 w-4" /> Clubs: {organization.clubs?.length || 0}
        </p>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
          {/* Link to future edit page, for now just a placeholder or could link to a conceptual details page */}
          <Link href={`/admin/organizations/${organization.id}/details`} className="flex items-center justify-center gap-2">
            View Details <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default OrganizationCard;
    
